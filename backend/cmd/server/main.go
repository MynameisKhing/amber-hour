package main

import (
	"bufio"
	"log"
	"net/http"
	"os"
	"strings"

	"amber-hour/internal/handler"
	"amber-hour/internal/hub"
	"amber-hour/internal/store"
)

func main() {
	loadDotEnv(".env")

	db, err := store.NewPostgres(getenv("DATABASE_URL", "postgres://amber:amber@localhost:5432/amber_hour?sslmode=disable"))
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer db.Close()

	rdb := store.NewRedis(getenv("REDIS_URL", "redis://localhost:6379"))

	h := hub.New(rdb, db)
	go h.Run()

	uploadDir := getenv("UPLOAD_DIR", "./uploads")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatalf("create uploads dir: %v", err)
	}

	mux := http.NewServeMux()
	handler.Register(mux, h, db, rdb, uploadDir)

	addr := getenv("ADDR", ":8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
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
