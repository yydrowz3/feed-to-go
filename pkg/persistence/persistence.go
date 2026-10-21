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
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func NewDB(dbcfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=disable",
		dbcfg.Host, dbcfg.User, dbcfg.Password, dbcfg.DBName, dbcfg.Port)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
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
