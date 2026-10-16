package logging

import (
	"os"

	"go.uber.org/zap"
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
	if env == "production" || env == "prod" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
