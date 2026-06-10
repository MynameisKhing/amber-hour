# 🍸 Amber Hour

A cozy late-night **bar-themed realtime chat** app with a **Discord-style dark UI** —
built as a hands-on lab for **Docker / Kubernetes / Rancher** deployment practice.

Go (WebSocket) backend · React + Vite frontend · Postgres + Redis · fully containerized.

> 📖 For the full system explanation and a change log, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Features

- **Realtime chat** over WebSockets with presence, typing indicators, and Redis
  pub/sub fan-out (scales across multiple backend replicas).
- **Discord-style messages** — flat rows, avatars, role-colored names, reactions,
  reply / edit / delete, mentions, and an **in-app image lightbox**.
- **Bar economy** — drink **menu**, play-money **wallet** (฿) with passive earning,
  **orders / tabs**, and a **leaderboard**.
- **AI bartender** (Google Gemini) — suggests menu items from your mood.
- Whispers (DMs), a guestbook, a shared YouTube **jukebox**, and staff moderation.

## Tech stack

| Layer    | Tech |
|----------|------|
| Backend  | Go 1.23 · `net/http` · pgx · go-redis · gorilla/websocket · JWT · Prometheus |
| Frontend | React 18 · Vite 5 · TypeScript (inline styles + CSS variables, no UI framework) |
| Data     | Postgres 16 · Redis 7 |
| Runtime  | Docker (multi-stage) · docker-compose · nginx |

---

## Quick start (Docker — whole stack)

```bash
docker compose up --build
```

Then open **http://localhost:8081**. This starts Postgres, Redis, a one-shot
migration job, the backend, and the nginx-served frontend.

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:8081 |
| Backend  | http://localhost:8082 (host) → `:8080` in-container |
| Postgres | localhost:5432 · Redis: localhost:6379 |

> The backend host port is **8082** so the container won't clash with a local
> `go run` on `:8080`. Override with `BACKEND_PORT`.

**Log in** with a seeded access code: `amber2024` (customer) or `staff-secret` (staff).

## Local development (without Docker)

```bash
# 1. Infra
docker compose up -d postgres redis

# 2. Backend  (from backend/)   → serves :8080
go run ./cmd/server

# 3. Frontend (from frontend/)  → Vite :5173, proxies to :8080
npm install
npm run dev
```

Open **http://localhost:5173**.

## Configuration

Copy `.env.example` → `.env` (or set env vars). Defaults match docker-compose:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://amber:amber@localhost:5432/amber_hour?sslmode=disable` | Postgres DSN |
| `REDIS_URL` | `redis://localhost:6379` | Redis |
| `ADDR` | `:8080` | listen address |
| `JWT_SECRET` | `change-me-in-production` | token signing key |
| `GOOGLE_AI_KEY` | _(unset)_ | enables the AI bartender (optional) |

## Database migrations

SQL migrations live in [`backend/migrations/`](backend/migrations/) and are **not**
applied automatically by the app. The compose `migrate` service applies them; in
Kubernetes use an init container or `Job`. See the migrate **"dirty database"**
note in [ARCHITECTURE.md](ARCHITECTURE.md#7-docker--deployment) if you reuse an
existing Postgres volume.

## Project layout

```
backend/   Go API + WebSocket hub (cmd/server, internal/{handler,hub,store}, migrations)
frontend/  React SPA (src/{pages,components,hooks}); theme lives in src/index.css
docker-compose.yml   full local stack
ARCHITECTURE.md      deep dive + change log
```

---

_Built with [Claude Code](https://claude.com/claude-code)._
