package database

import (
	"context"
	"gorm.io/gorm"
)

type txKey struct{ connection *Connection }

func (c *Connection) DB(ctx context.Context) *gorm.DB {
	if tx, ok := ctx.Value(txKey{c}).(*gorm.DB); ok {
		return tx.WithContext(ctx)
	}
	return c.db.WithContext(ctx)
}

func (c *Connection) WithTx(ctx context.Context, fn func(context.Context) error) error {
	if _, ok := ctx.Value(txKey{c}).(*gorm.DB); ok {
		return fn(ctx)
	}
	return c.DB(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(context.WithValue(ctx, txKey{c}, tx))
	})
}
