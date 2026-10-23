package logging

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	Logger = zap.NewNop()
	Sugar  = Logger.Sugar()
)

func Init() error {
	logger, err := New()
	if err != nil {
		return err
	}

	Logger = logger
	Sugar = logger.Sugar()
	return nil
}

func Sync() error {
	return Logger.Sync()
}

func New() (*zap.Logger, error) {
	env := os.Getenv("APP_ENV")
	cfg := zap.NewDevelopmentConfig()
	if env == "production" || env == "prod" {
		return zap.NewProduction()
	} else {
		cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}
	cfg.EncoderConfig.EncodeTime = zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05.000")

	return cfg.Build()
}
