package logging

import (
	"os"

	"go.uber.org/zap"
)

func New() (*zap.Logger, error) {
	env := os.Getenv("APP_ENV")
	if env == "production" || env == "prod" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
