package database

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Connection struct {
	db   *gorm.DB
	pool *sql.DB
}

func Open(dsn string) (*Connection, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		DisableAutomaticPing: true,
		Logger:               logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, errors.New("initialize PostgreSQL connection")
	}
	pool, err := db.DB()
	if err != nil {
		return nil, errors.New("initialize PostgreSQL connection pool")
	}
	pool.SetMaxOpenConns(10)
	pool.SetMaxIdleConns(5)
	pool.SetConnMaxIdleTime(5 * time.Minute)
	pool.SetConnMaxLifetime(30 * time.Minute)
	return &Connection{db: db, pool: pool}, nil
}

func (c *Connection) Check(ctx context.Context) error {
	return c.db.WithContext(ctx).Exec("SELECT 1").Error
}

func (c *Connection) Close() error {
	return c.pool.Close()
}
