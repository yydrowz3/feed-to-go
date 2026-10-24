package worker

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"feed-to-go/pkg/logging"

	amqp "github.com/rabbitmq/amqp091-go"
	"golang.org/x/sync/errgroup"
)

// Task must report readiness only after its initial setup has completed.
type Task struct {
	Name string
	Run  func(context.Context, func(bool)) error
}

// Runner owns tasks, but never owns their shared database or broker connection.
type Runner struct {
	tasks   []Task
	ready   []atomic.Bool
	started atomic.Bool
	running atomic.Bool
}

func NewRunner(tasks ...Task) *Runner {
	return &Runner{tasks: tasks, ready: make([]atomic.Bool, len(tasks))}
}

func (r *Runner) Ready() bool {
	if !r.running.Load() {
		return false
	}
	for i := range r.ready {
		if !r.ready[i].Load() {
			return false
		}
	}
	return true
}

func (r *Runner) Run(ctx context.Context) error {
	if !r.started.CompareAndSwap(false, true) {
		return errors.New("runner already started")
	}
	r.running.Store(true)
	defer r.running.Store(false)
	g, taskCtx := errgroup.WithContext(ctx)
	for i, task := range r.tasks {
		g.Go(func() error {
			defer r.ready[i].Store(false)
			err := task.Run(taskCtx, r.ready[i].Store)
			if taskCtx.Err() != nil {
				return nil
			}
			if err == nil {
				err = errors.New("task exited unexpectedly")
			}
			return fmt.Errorf("%s: %w", task.Name, err)
		})
	}
	if len(r.tasks) == 0 {
		<-ctx.Done()
	}
	return g.Wait()
}

func waitContext(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

type consumerChannel interface {
	Qos(int, int, bool) error
	Consume(string, string, bool, bool, bool, bool, amqp.Table) (<-chan amqp.Delivery, error)
	Close() error
}

type deliveryHandler func(context.Context, amqp.Delivery)

func retryDelivery(ctx context.Context, d amqp.Delivery, process func() error) {
	for attempt := 0; attempt <= 3; attempt++ {
		if ctx.Err() != nil {
			_ = d.Nack(false, true)
			return
		}
		err := process()
		if err == nil {
			_ = d.Ack(false)
			return
		}
		if ctx.Err() != nil {
			_ = d.Nack(false, true)
			return
		}
		if attempt == 3 {
			logging.Sugar.Warnf("message failed after 3 retries, discarding: %v", err)
			_ = d.Ack(false)
			return
		}
		logging.Sugar.Warnf("message failed, retrying (%d/3): %v", attempt+1, err)
		if !waitContext(ctx, time.Second<<attempt) {
			_ = d.Nack(false, true)
			return
		}
	}
}

type consumer struct {
	queue      string
	prefetch   int
	open       func() (consumerChannel, error)
	closed     func() bool
	handle     func(context.Context, amqp.Delivery)
	retryDelay time.Duration
}

func (c consumer) run(ctx context.Context, ready func(bool)) error {
	registered := false
	for {
		if ctx.Err() != nil {
			return nil
		}
		if c.closed() {
			return errors.New("RabbitMQ connection closed")
		}
		ch, err := c.open()
		if err == nil {
			err = ch.Qos(c.prefetch, 0, false)
			if err == nil {
				err = consume(ctx, ch, c.queue, c.handle, func() { registered = true; ready(true) })
			}
			ready(false)
			_ = ch.Close()
		}
		if ctx.Err() != nil {
			return nil
		}
		if c.closed() {
			return errors.New("RabbitMQ connection closed")
		}
		var protocolError *amqp.Error
		if !registered || (errors.As(err, &protocolError) && (!protocolError.Recover || protocolError.Code == 403 || protocolError.Code == 404 || protocolError.Code == 405 || protocolError.Code == 406)) {
			return err
		}
		logging.Sugar.Warnf("consumer %s disconnected; retrying: %v", c.queue, err)
		if !waitContext(ctx, c.retryDelay) {
			return nil
		}
	}
}

func consume(ctx context.Context, ch consumerChannel, queue string, handle func(context.Context, amqp.Delivery), started func()) error {
	deliveries, err := ch.Consume(queue, "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	if started != nil {
		started()
	}
	logging.Sugar.Infof("consumer registered: %s", queue)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case d, ok := <-deliveries:
			if !ok {
				return errors.New("deliveries channel closed")
			}
			if ctx.Err() != nil {
				_ = d.Nack(false, true)
				return ctx.Err()
			}
			handle(ctx, d)
		}
	}
}
