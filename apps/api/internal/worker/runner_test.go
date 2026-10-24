package worker

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/mq"

	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"
)

func eventually(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for !condition() {
		select {
		case <-deadline:
			t.Fatal("condition did not become true")
		case <-time.After(time.Millisecond):
		}
	}
}

func TestRunnerRequiresEveryTaskAndWaitsForCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	release := make(chan struct{})
	var exited atomic.Int32
	r := NewRunner(
		Task{Name: "first", Run: func(ctx context.Context, ready func(bool)) error {
			ready(true)
			<-ctx.Done()
			exited.Add(1)
			return nil
		}},
		Task{Name: "second", Run: func(ctx context.Context, ready func(bool)) error {
			select {
			case <-release:
			case <-ctx.Done():
				return nil
			}
			ready(true)
			<-ctx.Done()
			exited.Add(1)
			return nil
		}},
	)
	if r.Ready() {
		t.Fatal("construction must not start tasks")
	}
	done := make(chan error, 1)
	go func() { done <- r.Run(ctx) }()
	eventually(t, func() bool { return r.ready[0].Load() })
	if r.Ready() {
		t.Fatal("partially started runner reported ready")
	}
	close(release)
	eventually(t, r.Ready)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if r.Ready() || exited.Load() != 2 {
		t.Fatal("runner did not wait for every task")
	}
	if err := r.Run(ctx); err == nil {
		t.Fatal("duplicate Run must fail")
	}
}

func TestRunnerFailureCancelsOtherTasks(t *testing.T) {
	boom := errors.New("registration failed")
	r := NewRunner(Task{Name: "broken", Run: func(context.Context, func(bool)) error { return boom }}, Task{Name: "waiting", Run: func(ctx context.Context, _ func(bool)) error { <-ctx.Done(); return ctx.Err() }})
	if err := r.Run(context.Background()); !errors.Is(err, boom) {
		t.Fatalf("lost startup error: %v", err)
	}
	if r.Ready() {
		t.Fatal("failed runner reported ready")
	}
}

type fakeConsumerChannel struct {
	deliveries chan amqp.Delivery
	consumeErr error
	closed     atomic.Bool
	registered chan struct{}
}

func (f *fakeConsumerChannel) Qos(int, int, bool) error { return nil }
func (f *fakeConsumerChannel) Close() error             { f.closed.Store(true); return nil }
func (f *fakeConsumerChannel) Consume(string, string, bool, bool, bool, bool, amqp.Table) (<-chan amqp.Delivery, error) {
	if f.registered != nil {
		close(f.registered)
	}
	return f.deliveries, f.consumeErr
}

func TestConsumerInitialFailureIsFatal(t *testing.T) {
	want := errors.New("consume rejected")
	ch := &fakeConsumerChannel{consumeErr: want}
	c := consumer{open: func() (consumerChannel, error) { return ch, nil }, closed: func() bool { return false }}
	if err := c.run(context.Background(), func(ready bool) {
		if ready {
			t.Error("failed consumer reported ready")
		}
	}); !errors.Is(err, want) {
		t.Fatal(err)
	}
	if !ch.closed.Load() {
		t.Fatal("failed channel leaked")
	}
}

func TestConsumerReregistersAfterChannelClosure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	first := &fakeConsumerChannel{deliveries: make(chan amqp.Delivery)}
	second := &fakeConsumerChannel{deliveries: make(chan amqp.Delivery)}
	var opens atomic.Int32
	states := make(chan bool, 8)
	c := consumer{queue: "test", retryDelay: time.Millisecond, closed: func() bool { return false }, open: func() (consumerChannel, error) {
		if opens.Add(1) == 1 {
			return first, nil
		}
		return second, nil
	}}
	done := make(chan error, 1)
	go func() { done <- c.run(ctx, func(v bool) { states <- v }) }()
	if !<-states {
		t.Fatal("first registration missing")
	}
	close(first.deliveries)
	if <-states {
		t.Fatal("disconnected channel still ready")
	}
	if !<-states {
		t.Fatal("second registration missing")
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if opens.Load() != 2 || !first.closed.Load() || !second.closed.Load() {
		t.Fatal("incorrect channel ownership")
	}
}

func TestConsumerConnectionLossDoesNotRetryDeadConnection(t *testing.T) {
	ch := &fakeConsumerChannel{deliveries: make(chan amqp.Delivery)}
	var disconnected atomic.Bool
	var opens atomic.Int32
	ready := make(chan bool, 4)
	c := consumer{retryDelay: time.Hour, closed: disconnected.Load, open: func() (consumerChannel, error) { opens.Add(1); return ch, nil }}
	done := make(chan error, 1)
	go func() { done <- c.run(context.Background(), func(v bool) { ready <- v }) }()
	<-ready
	disconnected.Store(true)
	close(ch.deliveries)
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("connection failure was ignored")
		}
	case <-time.After(time.Second):
		t.Fatal("retrying closed connection")
	}
	if opens.Load() != 1 {
		t.Fatal("opened a channel on dead connection")
	}
}

func TestConsumerCancellationInterruptsReconnectWait(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch := &fakeConsumerChannel{deliveries: make(chan amqp.Delivery)}
	states := make(chan bool, 4)
	c := consumer{retryDelay: time.Hour, closed: func() bool { return false }, open: func() (consumerChannel, error) { return ch, nil }}
	done := make(chan error, 1)
	go func() { done <- c.run(ctx, func(v bool) { states <- v }) }()
	<-states
	close(ch.deliveries)
	<-states
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("reconnect sleep ignored cancellation")
	}
}

type acknowledger struct {
	acks, nacks atomic.Int32
	requeue     atomic.Bool
}

func (a *acknowledger) Ack(uint64, bool) error { a.acks.Add(1); return nil }
func (a *acknowledger) Nack(_ uint64, _ bool, requeue bool) error {
	a.nacks.Add(1)
	a.requeue.Store(requeue)
	return nil
}
func (a *acknowledger) Reject(uint64, bool) error { return nil }

func TestRetryCancellationRequeuesRatherThanAcknowledges(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a := &acknowledger{}
	called := make(chan struct{})
	done := make(chan struct{})
	go func() {
		retryDelivery(ctx, amqp.Delivery{Acknowledger: a}, func() error { close(called); return errors.New("temporarily unavailable") })
		close(done)
	}()
	<-called
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("message retry ignored cancellation")
	}
	if a.acks.Load() != 0 || a.nacks.Load() != 1 || !a.requeue.Load() {
		t.Fatal("cancelled message must be requeued")
	}
}

func TestSuccessfulDeliveryStillAcknowledged(t *testing.T) {
	a := &acknowledger{}
	retryDelivery(context.Background(), amqp.Delivery{Acknowledger: a}, func() error { return nil })
	if a.acks.Load() != 1 || a.nacks.Load() != 0 {
		t.Fatal("successful message not acknowledged")
	}
}

func TestCombinedTaskSetContainsEveryConsumerExactlyOnce(t *testing.T) {
	db, redis, rmq := &gorm.DB{}, &cache.Client{}, &mq.RabbitMQ{}
	tasks := append(businessTasks(db, redis, rmq), apiTasks(db, redis, rmq, &mq.TimelineMQ{}, nil)...)
	want := map[string]bool{"social.events": true, "like.events": true, "comment.events": true, "video.popularity.events": true, "video.timeline.update.queue": true, "notification.like": true, "notification.comment": true, "notification.social": true, "outbox": true}
	for _, task := range tasks {
		if !want[task.Name] {
			t.Fatalf("unexpected or duplicate task %s", task.Name)
		}
		delete(want, task.Name)
	}
	if len(want) != 0 {
		t.Fatalf("missing tasks: %v", want)
	}
	if len(businessTasks(db, nil, rmq)) != 3 {
		t.Fatal("standalone worker must omit popularity without Redis")
	}
	if len(apiTasks(db, nil, nil, nil, nil)) != 0 {
		t.Fatal("API without MQ must not start MQ tasks")
	}
}
