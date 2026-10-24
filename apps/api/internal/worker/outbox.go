package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// NewAPIRunner constructs tasks without starting goroutines.
func NewAPIRunner(db *gorm.DB, redisClient *cache.Client, rmq *mq.RabbitMQ, tmq *mq.TimelineMQ, hub NotificationHub) (*Runner, error) {
	if rmq == nil {
		return NewRunner(), nil
	}
	ch, err := rmq.NewChannel()
	if err != nil {
		return nil, err
	}
	defer ch.Close()
	for _, topic := range mq.NotificationTopics {
		if err := mq.DeclareTopic(ch, topic.Exchange, topic.Queue, topic.Binding); err != nil {
			return nil, err
		}
	}
	return NewRunner(apiTasks(db, redisClient, rmq, tmq, hub)...), nil
}

func apiTasks(db *gorm.DB, redisClient *cache.Client, rmq *mq.RabbitMQ, tmq *mq.TimelineMQ, hub NotificationHub) []Task {
	var tasks []Task
	if rmq == nil {
		return tasks
	}
	if tmq != nil {
		tasks = append(tasks, Task{Name: "outbox", Run: func(ctx context.Context, ready func(bool)) error { return runOutbox(ctx, db, tmq, ready) }})
		if redisClient != nil {
			tasks = append(tasks, consumerTask(rmq, mq.TimelineTopic.Queue, 0, func(ctx context.Context, d amqp.Delivery) { handleTimeline(ctx, redisClient, d) }))
		}
	}
	for _, topic := range mq.NotificationTopics {
		tasks = append(tasks, consumerTask(rmq, topic.Queue, 0, NewNotificationWorker(nil, db, topic.Queue, hub).handleDelivery))
	}
	return tasks
}

func runOutbox(ctx context.Context, db *gorm.DB, tmq *mq.TimelineMQ, ready func(bool)) error {
	ready(true)
	defer ready(false)
	for ctx.Err() == nil {
		var messages []video.OutboxMsg
		err := db.WithContext(ctx).Where("status = ?", "pending").Order("create_time ASC").Limit(100).Find(&messages).Error
		if err != nil {
			logging.Sugar.Warnf("outbox query failed: %v", err)
		}
		for _, msg := range messages {
			if ctx.Err() != nil {
				return nil
			}
			if err := tmq.PublishVideo(ctx, msg.VideoID, msg.CreateTime); err != nil {
				logging.Sugar.Warnf("outbox publish failed: %v", err)
				continue
			}
			if err := db.WithContext(ctx).Delete(&msg).Error; err != nil {
				logging.Sugar.Warnf("outbox delete failed: %v", err)
			}
		}
		if !waitContext(ctx, time.Second) {
			break
		}
	}
	return nil
}

func handleTimeline(ctx context.Context, client *cache.Client, msg amqp.Delivery) {
	var event mq.TimelineEvent
	if json.Unmarshal(msg.Body, &event) != nil {
		_ = msg.Ack(false)
		return
	}
	opCtx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	key := client.Key("feed:global_timeline")
	if err := client.ZAdd(opCtx, key, redis.Z{Score: float64(event.CreateTime), Member: fmt.Sprint(event.VideoID)}); err != nil {
		_ = msg.Nack(false, true)
		return
	}
	if err := client.ZRemRangeByRank(opCtx, key, 0, -1001); err != nil {
		logging.Sugar.Warnf("timeline trim failed: %v", err)
	}
	_ = msg.Ack(false)
}
