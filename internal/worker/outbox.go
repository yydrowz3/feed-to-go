package worker

import (
	"context"
	"encoding/json"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func StartOutboxPoller(db *gorm.DB, tmq *mq.TimelineMQ) {
	if db == nil || tmq == nil {
		logging.Sugar.Warnf("Outbox poller disabled: timeline mq is not initialized")
		return
	}

	go func() {
		for {
			var messages []video.OutboxMsg
			err := db.Where("status = ?", "pending").Order("create_time ASC").Limit(100).Find(&messages).Error
			if err != nil || len(messages) == 0 {
				time.Sleep(1 * time.Second)
				continue
			}
			for _, msg := range messages {
				err := tmq.PublishVideo(context.Background(), msg.VideoID, msg.CreateTime)
				if err == nil {
					if err := db.Delete(&msg).Error; err != nil {
						logging.Sugar.Warnf("删除 outbox 消息失败: id=%d, err=%v", msg.ID, err)
					}
				} else {
					logging.Sugar.Warnf("投递MQ失败: VideoID: %d, err: %v", msg.VideoID, err)
				}
			}
		}
	}()
}

func StartComsumer(tmq *mq.TimelineMQ, queueName string, redisClient *cache.Client, rmq *mq.RabbitMQ) {
	if tmq == nil || rmq == nil || rmq.Conn == nil {
		logging.Sugar.Warnf("Timeline consumer disabled: rabbitmq is not initialized")
		return
	}
	if redisClient == nil {
		logging.Sugar.Warnf("Timeline consumer disabled: redis is not initialized")
		return
	}

	go func() {
		for {
			// 每次重连创建独立的 Channel，不与发布者共用
			ch, err := rmq.NewChannel()
			if err != nil {
				logging.Sugar.Warnf("Timeline consumer: 创建 Channel 失败: %v, 5秒后重试", err)
				time.Sleep(5 * time.Second)
				continue
			}
			msgs, err := ch.Consume(queueName, "", false, false, false, false, nil)
			if err != nil {
				logging.Sugar.Warnf("Timeline consumer: 注册消费失败: %v, 5秒后重试", err)
				ch.Close()
				time.Sleep(5 * time.Second)
				continue
			}
			logging.Sugar.Infof("Timeline consumer 已启动, queue=%s", queueName)

			// msgs 是 channel
			for msg := range msgs {
				var event mq.TimelineEvent
				if err := json.Unmarshal(msg.Body, &event); err != nil {
					logging.Sugar.Warnf("Timeline consumer: 反序列化失败: %v", err)
					msg.Ack(false)
					continue
				}
				ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
				timelineKey := redisClient.Key("feed:global_timeline")
				err = redisClient.ZAdd(ctx, timelineKey, redis.Z{
					Score:  float64(event.CreateTime),
					Member: fmt.Sprintf("%d", event.VideoID),
				})

				if err != nil {
					logging.Sugar.Warnf("Timeline consumer: 写入Zset失败: %v", err)
					msg.Nack(false, true)
					cancel()
					continue
				}
				// 删除 旧纪录，保留 最新 1000 条
				if err := redisClient.ZRemRangeByRank(ctx, timelineKey, 0, -1001); err != nil {
					logging.Sugar.Warnf("Timeline consumer: ZRem失败: %v", err)
				}

				msg.Ack(false)
				cancel()
			}

			// msgs channel 关闭说明 AMQP Channel 断开，关闭并重连
			ch.Close()
			logging.Sugar.Warnf("Timeline consumer: Channel 断开, 5秒后重连...")
			time.Sleep(5 * time.Second)
		}
	}()
}
