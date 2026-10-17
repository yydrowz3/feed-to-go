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
	if err := godotenv.Load(); err != nil {
		// ...
	}

	if err := logging.Init(); err != nil {
		panic(err)
	}
	defer logging.Sync()

	logging.Sugar.Infof("server started")

	// 加载 .env（本地开发）
	if err := godotenv.Load(); err != nil {
		logging.Sugar.Warnf(".env not found; continuing")
	}

	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "configs/config.yaml"
	}

	// Config Loading
	logging.Sugar.Infof("Loading config from %s", configPath)
	cfg, usedDefault, err := config.LoadLocalDev(configPath)
	if err != nil {
		logging.Sugar.Fatalf("Failed to load config: %v", err)
	}
	if usedDefault {
		logging.Sugar.Infof("Config File %s not found, using default local config", configPath)
	} else {
		logging.Sugar.Infof("Config loaded from file: %s", configPath)
	}

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
		pingCtx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
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
	r := api.SetRouter(sqlDB, cache, rmq)
	logging.Sugar.Infof("Server is running on port %d", cfg.Server.Port)
	if err := r.Run(":" + strconv.Itoa(cfg.Server.Port)); err != nil {
		logging.Sugar.Fatalf("Failed to run server: %v", err)
	}
}
