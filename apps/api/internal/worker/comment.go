package worker

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"feed-to-go/internal/services/comment"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/mq"

	amqp "github.com/rabbitmq/amqp091-go"
)

type CommentWorker struct {
	ch       *amqp.Channel
	comments *comment.CommentRepository
	videos   *video.VideoRepository
	queue    string
}

func NewCommentWorker(ch *amqp.Channel, comments *comment.CommentRepository, videos *video.VideoRepository, queue string) *CommentWorker {
	return &CommentWorker{ch: ch, comments: comments, videos: videos, queue: queue}
}

func (w *CommentWorker) Run(ctx context.Context) error {
	if w == nil || w.ch == nil || w.comments == nil || w.videos == nil {
		return errors.New("comment worker is not initialized")
	}
	if w.queue == "" {
		return errors.New("queue is required")
	}

	return consume(ctx, w.ch, w.queue, w.handleDelivery, nil)
}

func (w *CommentWorker) handleDelivery(ctx context.Context, d amqp.Delivery) {
	retryDelivery(ctx, d, func() error { return w.process(ctx, d.Body) })
}

func (w *CommentWorker) process(ctx context.Context, body []byte) error {
	var evt mq.CommentEvent
	if err := json.Unmarshal(body, &evt); err != nil {
		return nil
	}

	switch evt.Action {
	case "publish":
		return w.applyPublish(ctx, &evt)
	case "delete":
		return w.applyDelete(ctx, &evt)
	default:
		return nil
	}
}

func (w *CommentWorker) applyPublish(ctx context.Context, evt *mq.CommentEvent) error {
	if evt == nil || evt.VideoID == 0 || evt.AuthorID == 0 || strings.TrimSpace(evt.Content) == "" {
		return nil
	}

	ok, err := w.videos.IsExist(ctx, evt.VideoID)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	c := &comment.Comment{
		Username: strings.TrimSpace(evt.Username),
		VideoID:  evt.VideoID,
		AuthorID: evt.AuthorID,
		Content:  strings.TrimSpace(evt.Content),
	}
	if err := w.comments.CreateComment(ctx, c); err != nil {
		return err
	}

	return w.videos.ChangePopularity(ctx, evt.VideoID, 1) // 评论 增加 热度 1
}

func (w *CommentWorker) applyDelete(ctx context.Context, evt *mq.CommentEvent) error {
	if evt == nil || evt.CommentID == 0 {
		return nil
	}
	c, err := w.comments.GetByID(ctx, evt.CommentID)
	if err != nil {
		return err
	}
	if c == nil {
		return nil
	}
	return w.comments.DeleteComment(ctx, c)

}
