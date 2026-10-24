package app

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"feed-to-go/internal/worker"

	amqp "github.com/rabbitmq/amqp091-go"
)

func runningComponent(stopped chan<- struct{}) *worker.Runner {
	return worker.NewRunner(worker.Task{Name: "test", Run: func(ctx context.Context, ready func(bool)) error {
		ready(true)
		<-ctx.Done()
		if stopped != nil {
			close(stopped)
		}
		return nil
	}})
}

func testService(c component) *service {
	return &service{components: []component{c}, httpTimeout: time.Second, workerTimeout: time.Second}
}

func awaitResult(t *testing.T, result <-chan error) error {
	t.Helper()
	select {
	case err := <-result:
		return err
	case <-time.After(3 * time.Second):
		t.Fatal("service did not stop")
		return nil
	}
}

func TestServiceBrokerFailureStopsAndWaitsForWorkers(t *testing.T) {
	stopped := make(chan struct{})
	s := testService(runningComponent(stopped))
	broker := make(chan *amqp.Error)
	s.brokerClosed = broker
	started := make(chan struct{})
	done := make(chan error, 1)
	go func() { done <- s.run(context.Background(), context.Background(), func() { close(started) }) }()
	<-started
	close(broker)
	if err := awaitResult(t, done); err == nil || !strings.Contains(err.Error(), "RabbitMQ") {
		t.Fatal(err)
	}
	select {
	case <-stopped:
	default:
		t.Fatal("service returned before workers stopped")
	}
	if s.ready() {
		t.Fatal("stopped application still ready")
	}
}

func TestServiceNeverStartsHTTPBeforeAllConsumersReady(t *testing.T) {
	boom := errors.New("initial registration failed")
	r := worker.NewRunner(worker.Task{Name: "failed", Run: func(context.Context, func(bool)) error { return boom }})
	s := testService(r)
	s.http = &http.Server{Addr: "127.0.0.1:0"}
	called := false
	if err := s.run(context.Background(), context.Background(), func() { called = true }); !errors.Is(err, boom) {
		t.Fatal(err)
	}
	if called || s.listener != nil {
		t.Fatal("HTTP started before successful registration")
	}
}

func TestStartupTimeoutCancelsUnreadyTasks(t *testing.T) {
	stopped := make(chan struct{})
	r := worker.NewRunner(worker.Task{Name: "unready", Run: func(ctx context.Context, _ func(bool)) error { <-ctx.Done(); close(stopped); return nil }})
	s := testService(r)
	startup, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := s.run(context.Background(), startup, func() { t.Error("unexpected readiness") }); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal(err)
	}
	select {
	case <-stopped:
	default:
		t.Fatal("startup timeout leaked task")
	}
}

func TestHTTPDrainsBeforeWorkersStop(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	workersStopped := make(chan struct{})
	s := testService(runningComponent(workersStopped))
	shutdownBegan := make(chan struct{})
	s.stopStreams = func() { close(shutdownBegan) }
	requestBegan := make(chan struct{})
	release := make(chan struct{})
	s.http = &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(requestBegan)
		<-release
		w.WriteHeader(http.StatusNoContent)
	})}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s.listener = listener
	defer listener.Close()
	started := make(chan struct{})
	done := make(chan error, 1)
	go func() { done <- s.run(ctx, context.Background(), func() { close(started) }) }()
	<-started
	response := make(chan error, 1)
	go func() {
		client := http.Client{Timeout: 2 * time.Second}
		res, err := client.Get("http://" + listener.Addr().String())
		if err == nil {
			res.Body.Close()
			if res.StatusCode != http.StatusNoContent {
				err = errors.New("request did not complete")
			}
		}
		response <- err
	}()
	<-requestBegan
	cancel()
	<-shutdownBegan
	select {
	case <-workersStopped:
		t.Fatal("workers stopped while request was still active")
	default:
	}
	close(release)
	if err := awaitResult(t, response); err != nil {
		t.Fatal(err)
	}
	if err := awaitResult(t, done); err != nil {
		t.Fatal(err)
	}
	select {
	case <-workersStopped:
	default:
		t.Fatal("workers were not joined")
	}
}

func TestShutdownTimeoutIsAnError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	release := make(chan struct{})
	r := worker.NewRunner(worker.Task{Name: "stuck", Run: func(ctx context.Context, ready func(bool)) error { ready(true); <-release; return nil }})
	s := testService(r)
	s.workerTimeout = 20 * time.Millisecond
	started := make(chan struct{})
	done := make(chan error, 1)
	go func() { done <- s.run(ctx, context.Background(), func() { close(started) }) }()
	<-started
	cancel()
	err := awaitResult(t, done)
	close(release)
	if err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatal(err)
	}
}

func TestHTTPShutdownTimeoutForcesRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := testService(runningComponent(nil))
	s.httpTimeout = 20 * time.Millisecond
	requestStarted, requestStopped := make(chan struct{}), make(chan struct{})
	s.http = &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(requestStarted)
		<-r.Context().Done()
		close(requestStopped)
	})}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	s.listener = listener
	started := make(chan struct{})
	done := make(chan error, 1)
	go func() { done <- s.run(ctx, context.Background(), func() { close(started) }) }()
	<-started
	clientDone := make(chan struct{})
	go func() {
		defer close(clientDone)
		client := http.Client{Timeout: 2 * time.Second}
		res, _ := client.Get("http://" + listener.Addr().String())
		if res != nil {
			res.Body.Close()
		}
	}()
	<-requestStarted
	cancel()
	if err := awaitResult(t, done); err == nil || !strings.Contains(err.Error(), "HTTP shutdown") {
		t.Fatal(err)
	}
	select {
	case <-requestStopped:
	case <-time.After(time.Second):
		t.Fatal("HTTP connection was not force closed")
	}
	<-clientDone
}

type readyComponent struct{ isReady bool }

func (r readyComponent) Ready() bool                   { return r.isReady }
func (r readyComponent) Run(ctx context.Context) error { <-ctx.Done(); return nil }

func TestReadinessChecksBothDependenciesInParallelAndHidesErrors(t *testing.T) {
	s := testService(readyComponent{true})
	var entered atomic.Int32
	both := make(chan struct{})
	check := func(ctx context.Context) error {
		if entered.Add(1) == 2 {
			close(both)
		}
		select {
		case <-both:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	s.checks = []func(context.Context) error{check, check}
	w := httptest.NewRecorder()
	s.readiness(w, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if w.Code != 200 || w.Body.String() != `{"status":"ok"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	s.checks = []func(context.Context) error{func(context.Context) error { return errors.New("secret connection credentials") }}
	w = httptest.NewRecorder()
	s.readiness(w, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if w.Code != 503 || w.Body.String() != `{"status":"not_ready"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestReadinessRejectsUnreadyStoppingAndUnreachableDependencies(t *testing.T) {
	s := testService(readyComponent{false})
	w := httptest.NewRecorder()
	s.readiness(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	s.components = []component{readyComponent{true}}
	s.checks = []func(context.Context) error{func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	w = httptest.NewRecorder()
	s.readiness(w, httptest.NewRequest("GET", "/readyz", nil).WithContext(ctx))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	s.checks = nil
	s.stopping.Store(true)
	w = httptest.NewRecorder()
	s.readiness(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
