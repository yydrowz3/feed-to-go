package main

import (
	"feed-to-go/internal/config"
	"os"

	"github.com/joho/godotenv"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
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
}
