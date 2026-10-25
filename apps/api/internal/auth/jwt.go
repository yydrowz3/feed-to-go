package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"feed-to-go/pkg/apierror"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var cachedSecret []byte

type Claims struct {
	AccountID uint   `json:"account_id"`
	Username  string `json:"username"`
	jwt.RegisteredClaims
}

type TokenRepository interface {
	FindTokenByID(ctx context.Context, id uint) (string, error)
}

func JWTAuth(accountRepo TokenRepository, cache *cache.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			apierror.Write(c, apierror.AuthRequired)
			return
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			apierror.Write(c, apierror.InvalidToken)
			return
		}

		tokenString := parts[1]

		claims, err := ParseToken(tokenString)
		if err != nil {
			if errors.Is(err, jwt.ErrTokenExpired) {
				apierror.Write(c, apierror.TokenExpired)
			} else {
				apierror.Write(c, apierror.InvalidToken)
			}
			return
		}
		check(c, claims, tokenString, accountRepo, cache)
	}
}

func SoftJWTAuth(accountRepo TokenRepository, cache *cache.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		// let go, when no auth header
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			apierror.Write(c, apierror.InvalidToken)
			return
		}

		tokenString := parts[1]

		claims, err := ParseToken(tokenString)
		if err != nil {
			if errors.Is(err, jwt.ErrTokenExpired) {
				apierror.Write(c, apierror.TokenExpired)
			} else {
				apierror.Write(c, apierror.InvalidToken)
			}
			return
		}

		check(c, claims, tokenString, accountRepo, cache)
	}
}

func check(c *gin.Context, claims *Claims, tokenString string, accountRepo TokenRepository, cache *cache.Client) {
	key := cache.Key("account:%d", claims.AccountID)

	if cache != nil {
		cacheCtx, cancel := context.WithTimeout(c.Request.Context(), 1*time.Minute)
		defer cancel()
		b, err := cache.GetBytes(cacheCtx, key)
		if err == nil {
			if string(b) != tokenString {
				apierror.Write(c, apierror.TokenRevoked)
				return
			}
			c.Set("accountID", claims.AccountID)
			c.Set("username", claims.Username)
			c.Next()
			return
		}
	}

	// redis fail: check db
	storedToken, err := accountRepo.FindTokenByID(c.Request.Context(), claims.AccountID)
	if err != nil {
		apierror.From(c, err, apierror.TokenRevoked)
		return
	}
	if storedToken == "" || storedToken != tokenString {
		apierror.Write(c, apierror.TokenRevoked)
		return
	}

	if cache != nil {
		cacheCtx, cancel := context.WithTimeout(c.Request.Context(), 1*time.Minute)
		defer cancel()

		if err := cache.SetBytes(cacheCtx, key, []byte(tokenString), 24*time.Hour); err != nil {
			logging.Sugar.Warnf("Failed to cache token for account %d: %v", claims.AccountID, err)
		}
	}
	c.Set("accountID", claims.AccountID)
	c.Set("username", claims.Username)
	c.Next()
}

func GetAccountID(c *gin.Context) (uint, error) {
	uidValue, exists := c.Get("accountID")
	if !exists {
		return 0, errors.New("accountID not found")
	}

	accountID, ok := uidValue.(uint)
	if !ok {
		return 0, errors.New("accountID has invalid type")
	}

	return accountID, nil
}

func GetUsername(c *gin.Context) (string, error) {
	val, exists := c.Get("username")
	if !exists {
		return "", errors.New("username not found")
	}

	username, ok := val.(string)
	if !ok {
		return "", errors.New("username has invalid type")
	}

	return username, nil
}

func jwtSecret() []byte {
	if cachedSecret != nil {
		return cachedSecret
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			logging.Sugar.Warnf("FATAL: cannot generate JWT secret: %v", err)
			cachedSecret = []byte("fallback-unsafe-key-change-me")
			return cachedSecret
		}
		secret = hex.EncodeToString(b)
		logging.Sugar.Warnf("JWT_SECRET not set, generated random key. All tokens invalid on restart")
	}

	cachedSecret = []byte(secret)
	return cachedSecret
}

func ParseToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (any, error) {
			if token.Method == nil || token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
				return nil, errors.New("unexpected signing method")
			}
			return jwtSecret(), nil
		},
	)
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}

	return claims, nil
}

func GenerateToken(accountID uint, username string) (string, error) {
	now := time.Now()
	claims := Claims{
		AccountID: accountID,
		Username:  username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(jwtSecret())
}

func GenerateRefreshToken(accountID uint) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
