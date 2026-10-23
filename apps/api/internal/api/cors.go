package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func corsMiddleware(webURL, appEnv string) gin.HandlerFunc {
	allowAllOrigins := appEnv == "dev"

	return func(c *gin.Context) {
		c.Writer.Header().Add("Vary", "Origin")

		origin := c.GetHeader("Origin")
		if origin == "" {
			c.Next()
			return
		}
		if !allowAllOrigins && origin != webURL {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}

		if allowAllOrigins {
			c.Header("Access-Control-Allow-Origin", "*")
		} else {
			c.Header("Access-Control-Allow-Origin", origin)
		}
		if c.Request.Method == http.MethodOptions {
			c.Header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, Range")
			c.Header("Access-Control-Max-Age", "600")
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
