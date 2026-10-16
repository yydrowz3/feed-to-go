package persistence

import (
	"feed-to-go/internal/config"
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
	// &account.Account{}, &video.Video{}, &video.Like{}, &video.Comment{},
	// &social.Social{}, &video.OutboxMsg{}, &video.Tag{}, &video.VideoTag{},
	// &message.Message{}, &worker.Notification{},
	)
}

func CloseDB(db *gorm.DB) error {
	sqlDB, err := db.DB()

	if err != nil {
		return err
	}

	return sqlDB.Close()
}
