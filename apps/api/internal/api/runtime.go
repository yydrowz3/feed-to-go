package api

import (
	"context"
	"errors"
	"fmt"

	"feed-to-go/internal/worker"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Runtime owns publisher channels and API tasks, but not the shared connections.
type Runtime struct {
	Handler      *gin.Engine
	Hub          *worker.SSEHub
	Runner       *worker.Runner
	popularityMQ *mq.PopularityMQ
	likeMQ       *mq.LikeMQ
	commentMQ    *mq.CommentMQ
	socialMQ     *mq.SocialMQ
	closers      []func() error
}

func NewRuntime(db *gorm.DB, cache *cache.Client, rmq *mq.RabbitMQ, webURL, appEnv string, strict bool) (_ *Runtime, err error) {
	if db == nil {
		return nil, errors.New("API requires PostgreSQL")
	}
	r := &Runtime{Hub: worker.NewSSEHub(db)}
	defer func() {
		if err != nil {
			_ = r.Close()
		}
	}()
	check := func(name string, initErr error, close func() error) error {
		if initErr != nil {
			if strict {
				return fmt.Errorf("%s initialization: %w", name, initErr)
			}
			logging.Sugar.Warnf("%s disabled: %v", name, initErr)
		} else {
			r.closers = append(r.closers, close)
		}
		return nil
	}
	r.popularityMQ, err = mq.NewPopularityMQ(rmq)
	if err = check("popularity publisher", err, func() error { return r.popularityMQ.Close() }); err != nil {
		return nil, err
	}
	r.likeMQ, err = mq.NewLikeMQ(rmq)
	if err = check("like publisher", err, func() error { return r.likeMQ.Close() }); err != nil {
		return nil, err
	}
	r.commentMQ, err = mq.NewCommentMQ(rmq)
	if err = check("comment publisher", err, func() error { return r.commentMQ.Close() }); err != nil {
		return nil, err
	}
	r.socialMQ, err = mq.NewSocialMQ(rmq)
	if err = check("social publisher", err, func() error { return r.socialMQ.Close() }); err != nil {
		return nil, err
	}
	timeline, initErr := mq.NewTimelineMQ(rmq)
	if err = check("timeline publisher", initErr, func() error { return timeline.Close() }); err != nil {
		return nil, err
	}
	r.Runner, err = worker.NewAPIRunner(db, cache, rmq, timeline, r.Hub)
	if err != nil {
		if strict {
			return nil, err
		}
		logging.Sugar.Warnf("API background tasks disabled: %v", err)
		r.Runner = worker.NewRunner()
	}
	r.Handler, err = buildRouter(db, cache, r, webURL, appEnv)
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (r *Runtime) Run(ctx context.Context) error { return r.Runner.Run(ctx) }
func (r *Runtime) Ready() bool                   { return r.Runner.Ready() }
func (r *Runtime) Close() error {
	var err error
	for i := len(r.closers) - 1; i >= 0; i-- {
		err = errors.Join(err, r.closers[i]())
	}
	r.closers = nil
	return err
}
