package worker

import (
	"context"
	"encoding/json"
	"errors"

	"feed-to-go/internal/util"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/mq"

	amqp "github.com/rabbitmq/amqp091-go"
)

type PopularityWorker struct {
	ch    *amqp.Channel
	cache *cache.Client
	queue string
}

func NewPopularityWorker(ch *amqp.Channel, cache *cache.Client, queue string) *PopularityWorker {
	return &PopularityWorker{ch: ch, cache: cache, queue: queue}
}

func (w *PopularityWorker) Run(ctx context.Context) error {
	if w == nil || w.ch == nil || w.cache == nil {
		return errors.New("popularity worker is not initialized")
	}
	if w.queue == "" {
		return errors.New("queue is required")
	}
	return consume(ctx, w.ch, w.queue, w.handleDelivery, nil)
}

func (w *PopularityWorker) handleDelivery(ctx context.Context, d amqp.Delivery) {
	retryDelivery(ctx, d, func() error { return w.process(ctx, d.Body) })
}

func (w *PopularityWorker) process(ctx context.Context, body []byte) error {
	var evt mq.PopularityEvent

	if err := json.Unmarshal(body, &evt); err != nil {
		return nil
	}
	if evt.VideoID == 0 || evt.Change == 0 {
		return nil
	}

	util.UpdatePopularityCache(ctx, w.cache, evt.VideoID, evt.Change)

	return nil
}
