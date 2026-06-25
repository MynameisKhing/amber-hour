package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"amber-hour/internal/handler"
	"amber-hour/internal/hub"
	"amber-hour/internal/store"
)

func main() {
	loadDotEnv(".env")

	dbURL := getenv("DATABASE_URL", "postgres://amber:amber@localhost:5432/amber_hour?sslmode=disable")

	// Create the pool (pgxpool.New is lazy — it does NOT connect yet).
	db, err := store.NewPostgres(dbURL)
	if err != nil {
		log.Fatalf("postgres: failed to create pool: %v", err)
	}
	defer db.Close()

	// Actually connect by pinging, with retries. This surfaces the REAL
	// reason a connection fails (auth, network, missing DB) in the logs
	// instead of silently starting and dying on the first /healthz probe.
	maxRetries := 15
	var pingErr error
	for i := 1; i <= maxRetries; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pingErr = db.Ping(ctx)
		cancel()
		if pingErr == nil {
			log.Printf("database connected OK")
			break
		}
		log.Printf("database ping failed (attempt %d/%d): %v", i, maxRetries, pingErr)
		if i < maxRetries {
			time.Sleep(2 * time.Second)
		}
	}
	if pingErr != nil {
		log.Fatalf("database unreachable after %d attempts — last error: %v", maxRetries, pingErr)
	}

	rdb := store.NewRedis(getenv("REDIS_URL", "redis://localhost:6379"))

	// Ping Redis too, so a Redis problem is logged clearly rather than
	// only showing up later on /readyz.
	rctx, rcancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := rdb.Ping(rctx).Err(); err != nil {
		log.Printf("WARNING: redis ping failed: %v", err)
	} else {
		log.Printf("redis connected OK")
	}
	rcancel()

	h := hub.New(rdb, db)
	go h.Run()

	uploadDir := getenv("UPLOAD_DIR", "./uploads")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatalf("create uploads dir: %v", err)
	}

	mux := http.NewServeMux()
	handler.Register(mux, h, db, rdb, uploadDir)

	// Graceful shutdown on SIGTERM/SIGINT
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
		<-sigCh
		log.Printf("shutdown signal received, draining...")
		h.Shutdown()
	}()

	addr := getenv("ADDR", ":8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, handler.Instrument(mux)))
}

func getenv(key, fallback string) string {
	// TrimSpace guards against a trailing newline/whitespace sneaking into a
	// value (e.g. when a Secret is edited via the Rancher UI textarea) — a
	// stray "\n" makes a URL DSN fail to parse with "invalid control character".
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv reads KEY=VALUE lines from path into the environment.
// Existing real environment variables take precedence over file values.
// Missing file is fine (no-op).
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
}
