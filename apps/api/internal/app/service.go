package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type component interface {
	Run(context.Context) error
	Ready() bool
}

type service struct {
	components    []component
	http          *http.Server
	listener      net.Listener
	stopStreams   func()
	brokerClosed  <-chan *amqp.Error
	brokerHealthy func() bool
	checks        []func(context.Context) error
	stopping      atomic.Bool
	httpTimeout   time.Duration
	workerTimeout time.Duration
}

func (s *service) ready() bool {
	if s.stopping.Load() {
		return false
	}
	if s.brokerHealthy != nil && !s.brokerHealthy() {
		return false
	}
	for _, c := range s.components {
		if !c.Ready() {
			return false
		}
	}
	return true
}

func (s *service) readiness(w http.ResponseWriter, r *http.Request) {
	ok := s.ready()
	if ok {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		results := make(chan error, len(s.checks))
		for _, check := range s.checks {
			go func() { results <- check(ctx) }()
		}
		for range s.checks {
			select {
			case err := <-results:
				ok = ok && err == nil
			case <-ctx.Done():
				ok = false
			}
			if !ok {
				break
			}
		}
		ok = ok && s.ready()
	}
	w.Header().Set("Content-Type", "application/json")
	if !ok {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"status":"not_ready"}`))
		return
	}
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// run keeps workers alive while HTTP requests drain. The caller owns connections.
func (s *service) run(ctx, startup context.Context, started func()) (result error) {
	workersCtx, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()
	var wg sync.WaitGroup
	failures := make(chan error, len(s.components)+1)
	for _, c := range s.components {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := c.Run(workersCtx)
			if workersCtx.Err() == nil {
				if err == nil {
					err = errors.New("background component exited unexpectedly")
				}
				failures <- err
			}
		}()
	}
	defer func() {
		s.stopping.Store(true)
		if s.stopStreams != nil {
			s.stopStreams()
		}
		if s.http != nil {
			shutdown, cancel := context.WithTimeout(context.Background(), s.httpTimeout)
			err := s.http.Shutdown(shutdown)
			cancel()
			if err != nil {
				result = errors.Join(result, fmt.Errorf("HTTP shutdown: %w", err))
				_ = s.http.Close()
			}
		}
		cancelWorkers()
		done := make(chan struct{})
		go func() { wg.Wait(); close(done) }()
		timer := time.NewTimer(s.workerTimeout)
		defer timer.Stop()
		select {
		case <-done:
		case <-timer.C:
			result = errors.Join(result, errors.New("background shutdown timed out"))
		}
	}()
	// Poll only in-process readiness flags; no extra network requests are made here.
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for !s.ready() {
		select {
		case <-ctx.Done():
			return nil
		case <-startup.Done():
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("startup: %w", startup.Err())
		case err := <-failures:
			if ctx.Err() != nil {
				return nil
			}
			return err
		case <-s.brokerClosed:
			if ctx.Err() != nil {
				return nil
			}
			return errors.New("RabbitMQ connection closed")
		case <-ticker.C:
		}
	}
	if err := startup.Err(); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return err
	}
	if s.http != nil {
		if s.listener == nil {
			listener, err := net.Listen("tcp", s.http.Addr)
			if err != nil {
				return err
			}
			s.listener = listener
		}
		go func() {
			err := s.http.Serve(s.listener)
			if !errors.Is(err, http.ErrServerClosed) {
				failures <- err
			}
		}()
	}
	started()
	select {
	case <-ctx.Done():
		return nil
	case err := <-failures:
		if ctx.Err() != nil {
			return nil
		}
		return err
	case <-s.brokerClosed:
		if ctx.Err() != nil {
			return nil
		}
		return errors.New("RabbitMQ connection closed")
	}
}
