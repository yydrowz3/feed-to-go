package persistence

import (
	"feed-to-go/internal/config"
	"feed-to-go/internal/services/account"
	"feed-to-go/internal/services/comment"
	"feed-to-go/internal/services/like"
	"feed-to-go/internal/services/message"
	"feed-to-go/internal/services/social"
	"feed-to-go/internal/services/video"
	"feed-to-go/internal/worker"
	"net"
	"net/url"
	"strconv"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func NewDB(dbcfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(dbcfg.User, dbcfg.Password),
		Host:   net.JoinHostPort(dbcfg.Host, strconv.Itoa(dbcfg.Port)),
		Path:   "/" + dbcfg.DBName,
	}
	params := url.Values{}
	if dbcfg.SSLMode != "" {
		params.Set("sslmode", dbcfg.SSLMode)
	}
	if dbcfg.ChannelBinding != "" {
		params.Set("channel_binding", dbcfg.ChannelBinding)
	}
	dsn.RawQuery = params.Encode()

	db, err := gorm.Open(postgres.Open(dsn.String()), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&account.Account{}, &video.Video{}, &like.Like{}, &comment.Comment{},
		&social.Social{}, &video.OutboxMsg{}, &video.Tag{}, &video.VideoTag{},
		&message.Message{}, &worker.Notification{},
	)
}

func CloseDB(db *gorm.DB) error {
	sqlDB, err := db.DB()

	if err != nil {
		return err
	}

	return sqlDB.Close()
}
