package worker

import (
	"context"
	"encoding/json"
	"errors"
	"feed-to-go/internal/services/social"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	amqp "github.com/rabbitmq/amqp091-go"
)

type SocialWorker struct {
	ch    *amqp.Channel
	repo  *social.SocialRepository
	queue string
}

func NewSocialWorker(ch *amqp.Channel, repo *social.SocialRepository, queue string) *SocialWorker {
	return &SocialWorker{ch: ch, repo: repo, queue: queue}
}

func (w *SocialWorker) Run(ctx context.Context) error {
	if w == nil || w.ch == nil || w.repo == nil {
		return errors.New("social worker is not initialized")
	}
	if w.queue == "" {
		return errors.New("queue is required")
	}
	deliveries, err := w.ch.Consume(w.queue, "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case d, ok := <-deliveries:
			if !ok {
				return errors.New("deliveries channel closed")
			}
			w.handleDelivery(ctx, d)
		}
	}
}

func (w *SocialWorker) handleDelivery(ctx context.Context, d amqp.Delivery) {
	const maxRetries = 3
	for i := 0; i <= maxRetries; i++ {
		select {
		case <-ctx.Done():
			_ = d.Nack(false, true)
			return
		default:
		}
		if err := w.process(ctx, d.Body); err != nil {
			if i >= maxRetries {
				logging.Sugar.Warnf("social worker: 重试 %d 次后仍失败, 丢弃: %v", maxRetries, err)
				_ = d.Ack(false)
				return
			}
			wait := time.Duration(1<<uint(i)) * time.Second
			logging.Sugar.Warnf("social worker: 处理失败, %v 后重试 (%d/%d): %v", wait, i+1, maxRetries, err)
			time.Sleep(wait)
			continue
		}
		_ = d.Ack(false)
		return
	}
}

func (w *SocialWorker) process(ctx context.Context, body []byte) error {
	var evt mq.SocialEvent
	if err := json.Unmarshal(body, &evt); err != nil {
		// 解析事件失败，直接丢弃
		return nil
	}
	if evt.FollowerID == 0 || evt.FollowingID == 0 {
		return nil
	}
	switch evt.Action {
	case "follow":
		err := w.repo.Follow(ctx, &social.Social{
			FollowerID:  evt.FollowerID,
			FollowingID: evt.FollowingID,
		})
		if err == nil {
			return nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil
		}
		return err
	case "unfollow":
		return w.repo.Unfollow(ctx, &social.Social{
			FollowerID:  evt.FollowerID,
			FollowingID: evt.FollowingID,
		})
	default:
		return nil
	}
}
