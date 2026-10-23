package cache

import (
	"context"
	"crypto/tls"
	"errors"
	"feed-to-go/internal/config"
	"fmt"
	"net"
	"strconv"
	"time"

	redis "github.com/redis/go-redis/v9"
)

type Client struct {
	rdb       *redis.Client
	keyPrefix string
}

var ErrUnintializedClient = errors.New("redis client not initialized")

const defaultKeyPrefix = "v1:"

func NewClient(rdb *redis.Client, keyPrefix string) *Client {
	return &Client{rdb: rdb, keyPrefix: keyPrefix}
}

func NewFromCfg(cfg *config.RedisConfig) (*Client, error) {
	opts := &redis.Options{
		Addr:     net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)),
		Password: cfg.Password,
		DB:       cfg.DB,
	}
	if cfg.TLS {
		opts.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	rdb := redis.NewClient(opts)
	return &Client{rdb, defaultKeyPrefix}, nil
}

func (c *Client) Close() error {
	if c == nil || c.rdb == nil {
		return nil
	}

	return c.rdb.Close()
}

func (c *Client) Ping(ctx context.Context) error {
	if c == nil || c.rdb == nil {
		return ErrUnintializedClient
	}

	return c.rdb.Ping(ctx).Err()
}

func (c *Client) Key(format string, args ...any) string {
	prefix := ""
	if c != nil {
		prefix = c.keyPrefix
	}

	return prefix + fmt.Sprintf(format, args...)
}

func (c *Client) Lock(ctx context.Context, key string, ttl time.Duration) (token string, ok bool, err error) {
	if c == nil || c.rdb == nil {
		return "", false, ErrUnintializedClient
	}

	token, err = randToken(16)
	if err != nil {
		return "", false, err
	}

	ok, err = c.rdb.SetNX(ctx, key, token, ttl).Result()

	return token, ok, err
}

func (c *Client) Unlock(ctx context.Context, key string, token string) error {
	if c == nil || c.rdb == nil {
		return ErrUnintializedClient
	}

	_, err := unlockScript.Run(ctx, c.rdb, []string{key}, token).Result()
	return err
}

func (c *Client) IncrementWithExpire(ctx context.Context, key string, expire time.Duration) (int64, error) {
	if c == nil || c.rdb == nil {
		return 0, ErrUnintializedClient
	}

	return incrementWithExpireScript.Run(
		ctx,
		c.rdb,
		[]string{key},
		expire.Milliseconds(),
	).Int64()
}
