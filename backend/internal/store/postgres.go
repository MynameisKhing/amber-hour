package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPostgres(dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}

	// REQUIRED for PgBouncer (transaction pooling): disable prepared statements.
	// pgx's default extended protocol prepares statements on one server
	// connection, but PgBouncer rotates connections per query — so a follow-up
	// query lands on a connection without that statement and hangs/fails.
	// Simple protocol makes every query self-contained. Set here in code so it
	// applies regardless of the DSN format (URL or keyword/value).
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	// Recycle connections so a long-idle pod never holds a connection that
	// PgBouncer/the network has already dropped (which manifests as requests
	// hanging on the first query after a long idle period).
	cfg.MaxConnIdleTime = 1 * time.Minute    // close idle conns after 1m
	cfg.MaxConnLifetime = 30 * time.Minute   // recycle conns every 30m
	cfg.HealthCheckPeriod = 30 * time.Second // probe idle conns periodically

	return pgxpool.NewWithConfig(context.Background(), cfg)
}
