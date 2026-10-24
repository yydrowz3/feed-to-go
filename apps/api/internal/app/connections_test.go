package app

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"feed-to-go/internal/config"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/mq"

	"gorm.io/gorm"
)

func TestConnectionFailurePoliciesAndPartialCleanup(t *testing.T) {
	for _, tc := range []struct {
		name    string
		mode    Mode
		failure string
		wantErr bool
		want    []string
	}{
		{"database", Combined, "db", true, []string{"db"}},
		{"migration", Combined, "migration", true, []string{"db"}},
		{"redis required", Combined, "redis", true, []string{"redis", "db"}},
		{"broker required", Combined, "mq", true, []string{"mq", "redis", "db"}},
		{"server redis fallback", Server, "redis", false, []string{"redis", "mq", "db"}},
		{"server broker fallback", Server, "mq", false, []string{"mq", "redis", "db"}},
		{"worker redis optional", Worker, "redis", false, []string{"redis", "mq", "db"}},
		{"worker broker required", Worker, "mq", true, []string{"mq", "redis", "db"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var closed []string
			var closers []func() error
			failure := func(stage string) error {
				if stage == tc.failure {
					return errors.New(stage)
				}
				return nil
			}
			closeResource := func(name string) func() error { return func() error { closed = append(closed, name); return nil } }
			migrated := false
			f := connectors{
				postgres: func(context.Context, config.DatabaseConfig) (*gorm.DB, func() error, error) {
					return &gorm.DB{}, closeResource("db"), failure("db")
				},
				migrate: func(context.Context, *gorm.DB) error { migrated = true; return failure("migration") },
				redis: func(context.Context, config.RedisConfig) (*cache.Client, func() error, error) {
					return &cache.Client{}, closeResource("redis"), failure("redis")
				},
				rabbit: func(context.Context, config.RabbitMQConfig) (*mq.RabbitMQ, func() error, error) {
					err := failure("mq")
					if err != nil {
						return nil, closeResource("mq"), err
					}
					return &mq.RabbitMQ{}, closeResource("mq"), nil
				},
			}
			_, redis, _, err := openConnections(context.Background(), config.Config{}, tc.mode, f, func(close func() error) { closers = append(closers, close) })
			if (err != nil) != tc.wantErr {
				t.Fatalf("error=%v", err)
			}
			if tc.failure == "redis" && redis != nil {
				t.Fatal("failed Redis client escaped into runtime")
			}
			for i := len(closers) - 1; i >= 0; i-- {
				_ = closers[i]()
			}
			if !reflect.DeepEqual(closed, tc.want) {
				t.Fatalf("cleanup order %v, want %v", closed, tc.want)
			}
			if tc.mode == Worker && migrated {
				t.Fatal("standalone worker unexpectedly migrated tables")
			}
		})
	}
}
