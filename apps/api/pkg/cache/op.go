package cache

import (
	"context"
	"time"
)

func (c *Client) GetBytes(ctx context.Context, key string) ([]byte, error) {
	if c == nil || c.rdb == nil {
		return nil, ErrUnintializedClient
	}

	return c.rdb.Get(ctx, key).Bytes()
}

func (c *Client) SetBytes(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	if c == nil || c.rdb == nil {
		return ErrUnintializedClient
	}

	return c.rdb.Set(ctx, key, value, ttl).Err()
}

func (c *Client) Del(ctx context.Context, key string) error {
	if c == nil || c.rdb == nil {
		return ErrUnintializedClient
	}

	return c.rdb.Del(ctx, key).Err()
}

func (c *Client) DelByPattern(ctx context.Context, pattern string) error {
	if c == nil || c.rdb == nil {
		return ErrUnintializedClient
	}

	iter := c.rdb.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		_ = c.rdb.Del(ctx, iter.Val())
	}

	return iter.Err()
}

// 多个 查询
func (c *Client) MGet(cacheCtx context.Context, cacheKeys ...string) ([]any, error) {
	if c == nil || c.rdb == nil {
		return nil, ErrUnintializedClient
	}

	return c.rdb.MGet(cacheCtx, cacheKeys...).Result()
}
