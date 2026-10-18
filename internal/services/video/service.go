package video

import (
	"feed-to-go/pkg/cache"
	"time"
)

type VideoService struct {
	repo         *VideoRepository
	cache        *cache.Client
	cacheTTL     time.Duration
	popularityMQ *rabbitmq.PopularityMQ
}
