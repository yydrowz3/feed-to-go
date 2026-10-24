package worker

import (
	"errors"
	"time"

	"feed-to-go/internal/services/comment"
	"feed-to-go/internal/services/like"
	"feed-to-go/internal/services/social"
	"feed-to-go/internal/services/video"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/mq"

	"gorm.io/gorm"
)

func consumerTask(rmq *mq.RabbitMQ, queue string, prefetch int, handle deliveryHandler) Task {
	c := consumer{queue: queue, prefetch: prefetch, retryDelay: 5 * time.Second,
		open:   func() (consumerChannel, error) { return rmq.NewChannel() },
		closed: func() bool { return rmq.Conn.IsClosed() }, handle: handle}
	return Task{Name: queue, Run: c.run}
}

// NewBusinessRunner declares the same topology as the API publishers.
func NewBusinessRunner(db *gorm.DB, redis *cache.Client, rmq *mq.RabbitMQ) (*Runner, error) {
	if db == nil || rmq == nil || rmq.Conn == nil {
		return nil, errors.New("business workers require PostgreSQL and RabbitMQ")
	}
	ch, err := rmq.NewChannel()
	if err != nil {
		return nil, err
	}
	defer ch.Close()
	topics := []mq.Topic{mq.SocialTopic, mq.LikeTopic, mq.CommentTopic}
	if redis != nil {
		topics = append(topics, mq.PopularityTopic)
	}
	for _, topic := range topics {
		if err := mq.DeclareTopic(ch, topic.Exchange, topic.Queue, topic.Binding); err != nil {
			return nil, err
		}
	}
	return NewRunner(businessTasks(db, redis, rmq)...), nil
}

func businessTasks(db *gorm.DB, redis *cache.Client, rmq *mq.RabbitMQ) []Task {
	vr := video.NewVideoRepository(db)
	tasks := []Task{
		consumerTask(rmq, mq.SocialTopic.Queue, 50, NewSocialWorker(nil, social.NewSocialRepository(db), "").handleDelivery),
		consumerTask(rmq, mq.LikeTopic.Queue, 50, NewLikeWorker(nil, like.NewLikeRepository(db), vr, "").handleDelivery),
		consumerTask(rmq, mq.CommentTopic.Queue, 50, NewCommentWorker(nil, comment.NewCommentRepository(db), vr, "").handleDelivery),
	}
	if redis != nil {
		tasks = append(tasks, consumerTask(rmq, mq.PopularityTopic.Queue, 50, NewPopularityWorker(nil, redis, "").handleDelivery))
	}
	return tasks
}
