package main

import (
	"context"
	"feed-to-go/internal/config"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/persistence"
	"os"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	logger, _ := logging.New()
	defer logger.Sync() // flushes buffer, if any
	sugar := logger.Sugar()

	// 加载 .env（本地开发）
	if err := godotenv.Load(); err != nil {
		sugar.Warnf(".env not found; continuing")
	}

	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "configs/config.yaml"
	}

	sugar.Infof("Loading config from %s", configPath)
	cfg, usedDefault, err := config.LoadLocalDev(configPath)
	if err != nil {
		sugar.Fatalf("Failed to load config: %v", err)
	}
	if usedDefault {
		sugar.Infof("Config File %s not found, using default local config", configPath)
	} else {
		sugar.Infof("Config loaded from file: %s", configPath)
	}

	sqlDB, err := persistence.NewDB(cfg.Database)
	if err != nil {
		sugar.Fatalf("Failed to connect database: %v", err)
	}
	if err := persistence.AutoMigrate(sqlDB); err != nil {
		sugar.Fatalf("Failed to auto migrate database: %v", err)
	}
	defer persistence.CloseDB(sqlDB)

	cache, err := cache.NewFromCfg(&cfg.Redis)
	if err != nil {
		sugar.Warnf("Redis config error (cache disabled): %v", err)
		cache = nil
	} else {
		pingCtx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
		defer cancel()
		// 这边 超时 就会出错
		if err := cache.Ping(pingCtx); err != nil {
			sugar.Warnf("Redis not available (cache disabled): %v", err)
			_ = cache.Close()
			cache = nil
		} else {
			defer cache.Close()
			sugar.Infof("Redis connected (cache enabled)")
		}
	}

}
