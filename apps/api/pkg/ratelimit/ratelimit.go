package ratelimit

import (
	"feed-to-go/internal/auth"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type KeyFunc func(*gin.Context) (string, bool)

func Limit(cache *cache.Client, keyPrefix string, maxRequests int64, window time.Duration, keyFunc KeyFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		// limit not set
		if cache == nil || keyFunc == nil || maxRequests <= 0 || window <= 0 {
			c.Next()
			return
		}
		subject, ok := keyFunc(c)
		if !ok {
			c.Next()
			return
		}
		key := buildKey(keyPrefix, subject)
		// 第一次请求，创建 window 过期时间。过期后 key 删除，再次请求重新创建 key
		count, err := cache.IncrementWithExpire(c.Request.Context(), key, window)
		if err != nil {
			c.Next()
			return
		}
		if count > maxRequests {
			apierror.Write(c, apierror.RateLimited)
			return
		}
		c.Next()
	}
}

func buildKey(keyPrefix, subject string) string {
	keyPrefix = strings.TrimSpace(keyPrefix)
	if keyPrefix == "" {
		keyPrefix = "default"
	}

	return fmt.Sprintf("feed-to-go:ratelimit:%s:%s", keyPrefix, strings.TrimSpace(subject))
}

func KeyByIP(c *gin.Context) (string, bool) {
	ip := strings.TrimSpace(c.ClientIP())
	if ip == "" {
		return "", false
	}
	return ip, true
}

func KeyByAccount(c *gin.Context) (string, bool) {
	accountID, err := auth.GetAccountID(c)
	if err != nil || accountID == 0 {
		return "", false
	}

	return strconv.FormatUint(uint64(accountID), 10), true
}
