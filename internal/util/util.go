package util

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/gin-gonic/gin"
)

func RandHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("rand.Read: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func BuildAbsoluteURL(c *gin.Context, p string) string {
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	if xf := c.GetHeader("X-Forwarded-Proto"); xf != "" {
		scheme = xf
	}
	return fmt.Sprintf("%s://%s%s", scheme, c.Request.Host, p)
}

func GetAccountID(c *gin.Context) (uint, error) {
	value, exists := c.Get("accountID")
	if !exists {
		return 0, errors.New("accountID not found")
	}
	id, ok := value.(uint)
	if !ok {
		return 0, errors.New("accountID has invalid type")
	}
	return id, nil
}
