package app

import (
	"context"
	"fmt"
	"time"

	"feed-to-go/internal/config"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"feed-to-go/pkg/persistence"

	"gorm.io/gorm"
)

// Factories return cleanup even on partial failure. Keeping connection ownership
// here also allows startup failure tests without touching a real datastore.
type connectors struct {
	postgres func(context.Context, config.DatabaseConfig) (*gorm.DB, func() error, error)
	migrate  func(context.Context, *gorm.DB) error
	redis    func(context.Context, config.RedisConfig) (*cache.Client, func() error, error)
	rabbit   func(context.Context, config.RabbitMQConfig) (*mq.RabbitMQ, func() error, error)
}

func defaultConnectors() connectors {
	return connectors{
		postgres: func(ctx context.Context, cfg config.DatabaseConfig) (*gorm.DB, func() error, error) {
			db, err := persistence.NewDBContext(ctx, cfg)
			if err != nil {
				return nil, nil, err
			}
			return db, func() error { return persistence.CloseDB(db) }, nil
		},
		migrate: func(ctx context.Context, db *gorm.DB) error { return persistence.AutoMigrate(db.WithContext(ctx)) },
		redis: func(ctx context.Context, cfg config.RedisConfig) (*cache.Client, func() error, error) {
			client, err := cache.NewFromCfg(&cfg)
			if err != nil {
				return nil, nil, err
			}
			ping, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			return client, client.Close, client.Ping(ping)
		},
		rabbit: func(ctx context.Context, cfg config.RabbitMQConfig) (*mq.RabbitMQ, func() error, error) {
			client, err := mq.NewRabbitMQContext(ctx, &cfg)
			if err != nil {
				return nil, nil, err
			}
			return client, func() error {
				if client.Conn.IsClosed() {
					return nil
				}
				return client.CLose()
			}, nil
		},
	}
}

func openConnections(ctx context.Context, cfg config.Config, mode Mode, f connectors, addClose func(func() error)) (*gorm.DB, *cache.Client, *mq.RabbitMQ, error) {
	db, closeDB, err := f.postgres(ctx, cfg.Database)
	if closeDB != nil {
		addClose(closeDB)
	}
	if err != nil {
		return nil, nil, nil, fmt.Errorf("PostgreSQL startup: %w", err)
	}
	if mode != Worker {
		if err := f.migrate(ctx, db); err != nil {
			return nil, nil, nil, fmt.Errorf("database migration: %w", err)
		}
	}
	redis, closeRedis, err := f.redis(ctx, cfg.Redis)
	if err != nil {
		if closeRedis != nil {
			_ = closeRedis()
		}
		redis = nil
		if mode == Combined {
			return nil, nil, nil, fmt.Errorf("Redis startup: %w", err)
		}
		logging.Sugar.Warn("Redis unavailable; cache and Redis-dependent consumers disabled")
	} else if closeRedis != nil {
		addClose(closeRedis)
	}
	rabbit, closeRabbit, err := f.rabbit(ctx, cfg.RabbitMQ)
	if closeRabbit != nil {
		addClose(closeRabbit)
	}
	if err != nil {
		if mode != Server {
			return nil, nil, nil, fmt.Errorf("RabbitMQ startup: %w", err)
		}
		logging.Sugar.Warn("RabbitMQ unavailable; message queues disabled")
	}
	return db, redis, rabbit, nil
}
