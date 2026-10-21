package main

import (
	"context"
	"feed-to-go/internal/config"
	"feed-to-go/internal/services/comment"
	"feed-to-go/internal/services/like"
	"feed-to-go/internal/services/social"
	"feed-to-go/internal/services/video"
	"feed-to-go/internal/worker"
	"feed-to-go/pkg/cache"
	"feed-to-go/pkg/logging"
	"feed-to-go/pkg/mq"
	"feed-to-go/pkg/observability"
	"feed-to-go/pkg/persistence"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"
)

const (
	socialExchange   = "social.events"
	socialQueue      = "social.events"
	socialBindingKey = "social.*"

	likeExchange   = "like.events"
	likeQueue      = "like.events"
	likeBindingKey = "like.*"

	commentExchange   = "comment.events"
	commentQueue      = "comment.events"
	commentBindingKey = "comment.*"

	popularityExchange   = "video.popularity.events"
	popularityQueue      = "video.popularity.events"
	popularityBindingKey = "video.popularity.*"
)

func connectWithRetry(name string, maxRetries int, fn func() error) {
	for i := 0; i < maxRetries; i++ {
		if err := fn(); err == nil {
			return
		}
		wait := time.Duration(1<<i) * time.Second
		if wait > 30*time.Second {
			wait = 30 * time.Second
		}
		logging.Sugar.Warnf("%s 不可用，%v 后重试 (%d/%d)...", name, wait, i+1, maxRetries)
		time.Sleep(wait)
	}
	logging.Sugar.Fatalf("%s: 超过最大重试次数", name)
}

// runWorkerWithRetry 为每个 Worker 创建独立 Channel，断开后自动重连
func runWorkerWithRetry(ctx context.Context, name string, conn *amqp.Connection, fn func(*amqp.Channel) error) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		ch, err := conn.Channel()
		if err != nil {
			logging.Sugar.Warnf("%s: 创建 Channel 失败: %v, 5秒后重试", name, err)
			time.Sleep(5 * time.Second)
			continue
		}
		if err := ch.Qos(50, 0, false); err != nil {
			logging.Sugar.Warnf("%s: QoS 设置失败: %v", name, err)
		}

		logging.Sugar.Infof("%s started, consuming", name)
		if err := fn(ch); err != nil {
			if ctx.Err() != nil {
				ch.Close()
				return
			}
			logging.Sugar.Warnf("%s: %v, 5秒后重连...", name, err)
		}
		ch.Close()
		time.Sleep(5 * time.Second)
	}
}

func declareSocialTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(
		socialExchange, "topic", true, false, false, false, nil,
	); err != nil {
		return err
	}

	q, err := ch.QueueDeclare(
		socialQueue, true, false, false, false,
		amqp.Table{"x-dead-letter-exchange": mq.DLXExchange},
	)
	if err != nil {
		return err
	}

	if err := ch.QueueBind(
		q.Name, socialBindingKey, socialExchange, false, nil,
	); err != nil {
		return err
	}

	return nil
}

func declarePopularityTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(
		popularityExchange, "topic", true, false, false, false, nil,
	); err != nil {
		return err
	}

	q, err := ch.QueueDeclare(
		popularityQueue, true, false, false, false,
		amqp.Table{"x-dead-letter-exchange": mq.DLXExchange},
	)
	if err != nil {
		return err
	}

	return ch.QueueBind(
		q.Name, popularityBindingKey, popularityExchange, false, nil,
	)

}

func declareLikeTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(
		likeExchange, "topic", true, false, false, false, nil,
	); err != nil {
		return err
	}

	q, err := ch.QueueDeclare(
		likeQueue, true, false, false, false,
		amqp.Table{"x-dead-letter-exchange": mq.DLXExchange},
	)
	if err != nil {
		return err
	}

	return ch.QueueBind(
		q.Name, likeBindingKey, likeExchange, false, nil,
	)
}

func declareCommentTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(
		commentExchange, "topic", true, false, false, false, nil,
	); err != nil {
		return err
	}

	q, err := ch.QueueDeclare(
		commentQueue, true, false, false, false,
		amqp.Table{"x-dead-letter-exchange": mq.DLXExchange},
	)
	if err != nil {
		return err
	}

	return ch.QueueBind(
		q.Name, commentBindingKey, commentExchange, false, nil,
	)
}

func main() {
	// 加载 .env（本地开发）
	if err := godotenv.Load(); err != nil {
		logging.Sugar.Warnf(".env not found; continuing")
	}
	// 加载配置
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "configs/config.yaml"
	}
	logging.Sugar.Infof("Loading config from %s", configPath)
	cfg, usedDefault, err := config.LoadLocalDev(configPath)
	if err != nil {
		logging.Sugar.Fatalf("Failed to load config: %v", err)
	}
	if usedDefault {
		logging.Sugar.Warnf("Config File %s not found, using default local config", configPath)
	} else {
		logging.Sugar.Infof("Config loaded from file: %s", configPath)
	}

	// 连接数据库（带重试）
	var db *gorm.DB
	connectWithRetry("database", 10, func() error {
		var err error
		db, err = persistence.NewDB(cfg.Database)
		return err
	})
	defer persistence.CloseDB(db)

	// 连接 Redis（用于流行度更新）
	cache, err := cache.NewFromCfg(&cfg.Redis)
	if err != nil {
		logging.Sugar.Warnf("Redis config error (popularity worker disabled): %v", err)
		cache = nil
	} else {
		pingCtx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
		defer cancel()
		if err := cache.Ping(pingCtx); err != nil {
			logging.Sugar.Warnf("Redis not available (popularity worker disabled): %v", err)
			_ = cache.Close()
			cache = nil
		} else {
			defer cache.Close()
			logging.Sugar.Infof("Redis connected (popularity worker enabled)")
		}
	}

	// 连接 RabbitMQ（带重试）
	url := "amqp://" + cfg.RabbitMQ.Username + ":" + cfg.RabbitMQ.Password + "@" + cfg.RabbitMQ.Host + ":" + strconv.Itoa(cfg.RabbitMQ.Port) + "/"
	var conn *amqp.Connection
	connectWithRetry("RabbitMQ", 10, func() error {
		var err error
		conn, err = amqp.Dial(url)
		return err
	})
	defer conn.Close()

	// 用临时 Channel 声明拓扑（持久化队列，声明一次即可）
	topoCh, err := conn.Channel()
	if err != nil {
		logging.Sugar.Fatalf("Failed to open topology channel: %v", err)
	}
	if err := declareSocialTopology(topoCh); err != nil {
		logging.Sugar.Fatalf("Failed to declare social topology: %v", err)
	}
	if err := declareLikeTopology(topoCh); err != nil {
		logging.Sugar.Fatalf("Failed to declare like topology: %v", err)
	}
	if err := declareCommentTopology(topoCh); err != nil {
		logging.Sugar.Fatalf("Failed to declare comment topology: %v", err)
	}
	if cache != nil {
		if err := declarePopularityTopology(topoCh); err != nil {
			logging.Sugar.Fatalf("Failed to declare popularity topology: %v", err)
		}
	}
	topoCh.Close()

	// 准备 repo
	socialRepo := social.NewSocialRepository(db)
	videoRepo := video.NewVideoRepository(db)
	likeRepo := like.NewLikeRepository(db)
	commentRepo := comment.NewCommentRepository(db)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 启动 pprof 服务器
	pprofServer, err := observability.NewPprofServer(
		"Worker",
		cfg.Observability.Pprof.Enabled,
		cfg.Observability.Pprof.WorkerAddr,
	)
	if err != nil {
		logging.Sugar.Warnf("Failed to start worker pprof server: %v", err)
	}
	if pprofServer != nil {
		defer pprofServer.Close()
	}

	// 每个 Worker 独立 Channel + 自动重连
	go runWorkerWithRetry(ctx, "SocialWorker", conn, func(ch *amqp.Channel) error {
		return worker.NewSocialWorker(ch, socialRepo, socialQueue).Run(ctx)
	})
	go runWorkerWithRetry(ctx, "LikeWorker", conn, func(ch *amqp.Channel) error {
		return worker.NewLikeWorker(ch, likeRepo, videoRepo, likeQueue).Run(ctx)
	})
	go runWorkerWithRetry(ctx, "CommentWorker", conn, func(ch *amqp.Channel) error {
		return worker.NewCommentWorker(ch, commentRepo, videoRepo, commentQueue).Run(ctx)
	})

	if cache != nil {
		go runWorkerWithRetry(ctx, "PopularityWorker", conn, func(ch *amqp.Channel) error {
			return worker.NewPopularityWorker(ch, cache, popularityQueue).Run(ctx)
		})
	}

	// 等待退出信号
	<-ctx.Done()
	logging.Sugar.Infof("Worker shutting down...")
	time.Sleep(2 * time.Second) // 等待正在处理的消息完成
	logging.Sugar.Infof("Worker stopped")
}
