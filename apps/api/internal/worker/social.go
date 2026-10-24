package worker

import (
	"context"
	"encoding/json"
	"errors"

	"feed-to-go/internal/services/social"
	"feed-to-go/pkg/mq"

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
	return consume(ctx, w.ch, w.queue, w.handleDelivery, nil)
}

func (w *SocialWorker) handleDelivery(ctx context.Context, d amqp.Delivery) {
	retryDelivery(ctx, d, func() error { return w.process(ctx, d.Body) })
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
