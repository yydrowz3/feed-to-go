package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"feed-to-go/internal/api"
	"feed-to-go/internal/config"
	"feed-to-go/internal/worker"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"feed-to-go/pkg/observability"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
)

type Mode int

const (
	Server Mode = iota
	Worker
	Combined
)

// Main is the only place that handles process signals and initializes logging.
func Main(mode Mode) int {
	envErr := godotenv.Load()
	if err := logging.Init(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer logging.Sync()
	if envErr != nil {
		logging.Sugar.Info(".env unavailable; using process environment")
	}
	path := os.Getenv("CONFIG_PATH")
	if path == "" {
		path = "configs/config.yaml"
	}
	cfg, _, err := config.LoadLocalDev(path)
	if err != nil {
		logging.Sugar.Errorf("load config: %v", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := Run(ctx, cfg, mode); err != nil {
		logging.Sugar.Errorf("application stopped: %v", err)
		return 1
	}
	return 0
}

// Run initializes one set of shared connections and cleans up partial startup.
func Run(ctx context.Context, cfg config.Config, mode Mode) (result error) {
	if mode != Server && mode != Worker && mode != Combined {
		return errors.New("invalid application mode")
	}
	startup, cancelStartup := context.WithTimeout(ctx, 60*time.Second)
	defer cancelStartup()
	var closers []func() error
	var rmq *mq.RabbitMQ
	enteredService := false
	defer func() {
		if ctx.Err() != nil && !enteredService {
			result = nil
		}
		result = errors.Join(result, closeResources(closers, func() { rmq.Abort() }, 5*time.Second))
	}()
	db, redis, rabbit, err := openConnections(startup, cfg, mode, defaultConnectors(), func(close func() error) { closers = append(closers, close) })
	if err != nil {
		return err
	}
	rmq = rabbit
	s := &service{httpTimeout: 10 * time.Second, workerTimeout: 10 * time.Second}
	stopStartup := func() bool { return true }
	if rmq != nil {
		s.brokerClosed = rmq.Conn.NotifyClose(make(chan *amqp.Error, 1))
		s.brokerHealthy = func() bool { return !rmq.Conn.IsClosed() }
		stopStartup = context.AfterFunc(startup, rmq.Abort)
	} else {
		logging.Sugar.Warn("RabbitMQ unavailable; message queues disabled")
	}
	defer stopStartup()
	if mode != Worker {
		runtime, err := api.NewRuntime(db, redis, rmq, cfg.Server.WebURL, cfg.Server.AppEnv, mode == Combined)
		if err != nil {
			return err
		}
		closers = append(closers, runtime.Close)
		s.components = append(s.components, runtime)
		s.stopStreams = runtime.Hub.StopStreams
		s.http = &http.Server{Addr: ":" + strconv.Itoa(cfg.Server.Port), Handler: runtime.Handler, ReadHeaderTimeout: 5 * time.Second}
		if mode == Combined {
			pool, err := db.DB()
			if err != nil {
				return err
			}
			s.checks = []func(context.Context) error{pool.PingContext, redis.Ping}
			runtime.Handler.GET("/readyz", gin.WrapF(s.readiness))
		}
	}
	if mode != Server {
		runner, err := worker.NewBusinessRunner(db, redis, rmq)
		if err != nil {
			return err
		}
		s.components = append(s.components, runner)
	}
	addr := cfg.Observability.Pprof.ApiAddr
	if mode == Worker {
		addr = cfg.Observability.Pprof.WorkerAddr
	}
	pprof, err := observability.NewPprofServer("application", cfg.Observability.Pprof.Enabled, addr)
	if err != nil {
		if mode != Worker {
			return err
		}
		logging.Sugar.Warnf("worker pprof unavailable: %v", err)
	}
	if pprof != nil {
		closers = append(closers, pprof.Close)
	}
	enteredService = true
	return s.run(ctx, startup, func() {
		stopStartup()
		cancelStartup()
		logging.Sugar.Infof("application ready (mode=%d, port=%d)", mode, cfg.Server.Port)
	})
}
