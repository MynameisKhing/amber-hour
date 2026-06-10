package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPostgres(dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(context.Background(), dsn)
}
