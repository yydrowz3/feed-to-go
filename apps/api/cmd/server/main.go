package main

import (
	"context"
	"feed-to-go/internal/api"
	"feed-to-go/internal/config"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"feed-to-go/pkg/observability"
	"feed-to-go/pkg/persistence"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	// 先加载 .env，让日志初始化能够读取 APP_ENV。
	envErr := godotenv.Load()

	if err := logging.Init(); err != nil {
		panic(err)
	}
	defer logging.Sync()

	logging.Sugar.Infof("server started")

	if envErr != nil {
		logging.Sugar.Warnf("Failed to load .env; using existing environment variables: %v", envErr)
	}

	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "configs/config.yaml"
	}

	// 应用配置从环境变量读取，文件仅提供 observability 配置。
	logging.Sugar.Infof("Loading application config from environment and observability config from %s", configPath)
	cfg, usedDefaultObservability, err := config.LoadLocalDev(configPath)
	if err != nil {
		logging.Sugar.Fatalf("Failed to load config: %v", err)
	}
	if usedDefaultObservability {
		logging.Sugar.Warnf("Config file %s not found; using default local observability config", configPath)
	} else {
		logging.Sugar.Infof("Observability config loaded from file: %s", configPath)
	}
	logging.Sugar.Infof("Application config loaded from environment (PORT defaults to 8095)")

	// Database
	sqlDB, err := persistence.NewDB(cfg.Database)
	if err != nil {
		logging.Sugar.Fatalf("Failed to connect database: %v", err)
	}
	if err := persistence.AutoMigrate(sqlDB); err != nil {
		logging.Sugar.Fatalf("Failed to auto migrate database: %v", err)
	}
	defer persistence.CloseDB(sqlDB)

	// Redis
	cache, err := cache.NewFromCfg(&cfg.Redis)
	if err != nil {
		logging.Sugar.Warnf("Redis config error (cache disabled): %v", err)
		cache = nil
	} else {
		pingCtx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		// 这边 超时 就会出错
		if err := cache.Ping(pingCtx); err != nil {
			logging.Sugar.Warnf("Redis not available (cache disabled): %v", err)
			_ = cache.Close()
			cache = nil
		} else {
			defer cache.Close()
			logging.Sugar.Infof("Redis connected (cache enabled)")
		}
	}

	rmq, err := mq.NewRabbitMQ(&cfg.RabbitMQ)
	if err != nil {
		logging.Sugar.Warnf("RabbitMQ config err (disabled): %v", err)
		rmq = nil
	} else {
		defer rmq.CLose()
		logging.Sugar.Infof("RabbitMQ connected")
	}

	// Pprof
	pprofServer, err := observability.NewPprofServer(
		"API", cfg.Observability.Pprof.Enabled, cfg.Observability.Pprof.ApiAddr,
	)
	if err != nil {
		logging.Sugar.Fatalf("Failed to start pprof server: %v", err)
	}
	if pprofServer != nil {
		defer pprofServer.Close()
	}

	// Router
	r := api.SetRouter(sqlDB, cache, rmq, cfg.Server.WebURL)
	logging.Sugar.Infof("Server is running on port %d", cfg.Server.Port)
	if err := r.Run(":" + strconv.Itoa(cfg.Server.Port)); err != nil {
		logging.Sugar.Fatalf("Failed to run server: %v", err)
	}
}
