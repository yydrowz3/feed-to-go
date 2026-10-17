package api

import (
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func SetRouter(db *gorm.DB, cache *cache.Client, rmq *mq.RabbitMQ) *gin.Engine {
	r := gin.Default()
	if err := r.SetTrustedProxies(nil); err != nil {
		logging.Sugar.Fatalf("Failed to set trusted proxies: %v", err)
	}
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	r.Static("/static", "./.run/uploads")

	// rate_limit

	// account

	// video

	// like

	// comment

	// social

	// feed

	// message

	// worker

	// SSE notification

	return r
}
