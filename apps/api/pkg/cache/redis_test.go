package cache

import (
	"context"
	"crypto/x509"
	"feed-to-go/internal/config"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestNewFromCfgConnects(t *testing.T) {
	for _, useTLS := range []bool{false, true} {
		name := "plain"
		if useTLS {
			name = "TLS"
		}
		t.Run(name, func(t *testing.T) {
			mr := miniredis.NewMiniRedis()
			var roots *x509.CertPool
			if useTLS {
				certServer := httptest.NewTLSServer(nil)
				defer certServer.Close()
				roots = x509.NewCertPool()
				roots.AddCert(certServer.Certificate())
				if err := mr.StartTLS(certServer.TLS); err != nil {
					t.Fatal(err)
				}
			} else if err := mr.Start(); err != nil {
				t.Fatal(err)
			}
			defer mr.Close()
			mr.RequireAuth("test-password")
			port, err := strconv.Atoi(mr.Port())
			if err != nil {
				t.Fatal(err)
			}
			client, err := NewFromCfg(&config.RedisConfig{
				Host: mr.Host(), Port: port, Password: "test-password", TLS: useTLS,
			})
			if err != nil {
				t.Fatal(err)
			}
			defer client.Close()
			if useTLS {
				// Trust the local test certificate while keeping verification enabled.
				client.rdb.Options().TLSConfig.RootCAs = roots
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := client.Ping(ctx); err != nil {
				t.Fatalf("ping: %v", err)
			}
		})
	}
}

func TestIncrementWithExpireSetsTTLWIthoutExtendingWindow(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start miniredis: %v", err)
	}
	defer mr.Close()

	client := &Client{
		rdb: redis.NewClient(&redis.Options{
			Addr: mr.Addr(),
		}),
	}
	defer client.Close()

	ctx := context.Background()
	key := "feedsystem:ratelimit:test"
	expire := 30 * time.Second

	count, err := client.IncrementWithExpire(ctx, key, expire)
	if err != nil {
		t.Fatalf("first increment: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}

	firstTTL := mr.TTL(key)
	if firstTTL <= 0 || firstTTL > expire {
		t.Fatalf("expected ttl in (0, %s], got %s", expire, firstTTL)
	}

	mr.FastForward(5 * time.Second)
	ttlBeforeSecond := mr.TTL(key)

	count, err = client.IncrementWithExpire(ctx, key, expire)
	if err != nil {
		t.Fatalf("second increment: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected count 2, got %d", count)
	}

	// 固定窗口限流，后续请求不会重新设置 过期ttl
	ttlAfterSecond := mr.TTL(key)
	if ttlAfterSecond != ttlBeforeSecond {
		t.Fatalf("expected ttl to stay at %s, got %s", ttlBeforeSecond, ttlAfterSecond)
	}

}
