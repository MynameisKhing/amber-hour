# Amber Hour — Architecture & Handoff

> A cozy‑bar themed **realtime chat** app (Go + React) used as a hands‑on lab for
> **Kubernetes / Rancher** deployment practice. This document explains how the
> system fits together and records what changed in the most recent work session,
> so a person *or another AI model* can pick the project up cold.

---

## 1. Overview

Amber Hour is a single‑room realtime chat styled like a late‑night bar ("The Amber
Hour"). Patrons log in, chat over WebSockets, react/reply/edit/delete messages,
order drinks from a menu, earn and spend a play‑money wallet (฿), whisper privately,
sign a guestbook, and queue songs in a shared jukebox. Staff get moderation powers.

```
┌────────────┐   WS /ws (chat, presence, jukebox, wallet)   ┌──────────────┐
│  Browser   │ ───────────────────────────────────────────▶ │   Go backend │
│ React/Vite │   REST /api/* (auth, menu, orders, wallet…)   │  net/http    │
│  (SPA)     │ ◀─────────────────────────────────────────── │   + Hub      │
└────────────┘                                                └──────┬───────┘
                                                          pub/sub │   │ SQL
                                                         ┌────────▼─┐ ┌▼─────────┐
                                                         │  Redis   │ │ Postgres │
                                                         │ fan‑out  │ │ persist  │
                                                         └──────────┘ └──────────┘
```

The Redis pub/sub channel lets **multiple backend replicas** broadcast to every
connected client regardless of which pod holds the socket — which is the whole
point for K8s scaling practice.

---

## 2. Stack & versions

| Layer     | Tech |
|-----------|------|
| Backend   | **Go 1.23**, stdlib `net/http`; `jackc/pgx` v5 (Postgres), `redis/go-redis` v9, `gorilla/websocket`, `golang-jwt/jwt` v5, `prometheus/client_golang`, `golang.org/x/crypto/bcrypt` |
| Frontend  | **React 18** + **Vite 5** + **TypeScript 5**; `@mdi/react` icons; no CSS framework — styling is inline styles + CSS variables |
| Data      | **Postgres 16**, **Redis 7** |
| Runtime   | Docker (multi‑stage); `docker-compose` for local full stack |

The Go backend has **no CGO** dependency (pgx is pure Go), so it compiles to a
fully static binary — ideal for tiny container images and distroless/scratch.

---

## 3. Repository layout

```
amber-hour/
├── ARCHITECTURE.md          ← you are here
├── docker-compose.yml       ← postgres, redis, migrate, backend, frontend
├── .env.example             ← DATABASE_URL / REDIS_URL / ADDR
├── backend/
│   ├── Dockerfile           ← multi‑stage Go build → alpine runtime
│   ├── .dockerignore
│   ├── go.mod / go.sum
│   ├── cmd/server/main.go   ← entrypoint: loads .env, wires db/redis/hub, serves
│   ├── internal/
│   │   ├── handler/         ← http.go (routes) + ws.go (WebSocket upgrade)
│   │   ├── hub/             ← hub.go: client registry + Redis pub/sub + jukebox + wallet ticker
│   │   ├── store/           ← postgres.go (pgxpool), redis.go
│   │   └── metrics/         ← prometheus counters/gauges
│   ├── migrations/          ← 001..005 *.up.sql / *.down.sql (NOT auto‑applied)
│   └── uploads/             ← user file uploads (runtime data; gitignored)
└── frontend/
    ├── Dockerfile           ← node build → nginx runtime
    ├── nginx.conf           ← SPA + reverse proxy to backend (prod replacement for Vite proxy)
    ├── .dockerignore
    ├── index.html           ← loads Google Font (Noto Sans)
    ├── vite.config.ts       ← dev proxy: /api /ws /uploads → :8080
    └── src/
        ├── main.tsx, App.tsx
        ├── pages/           ← Login, Bar (main chat), Lounge
        ├── components/      ← MessageList, ChatHeader, ChatInput, sidebars, panels, overlays…
        ├── hooks/useWebSocket.ts
        ├── types/index.ts   ← shared TS types (ChatMessage, Role, …)
        └── index.css        ← global styles + the CSS‑variable theme (`:root`)
```

---

## 4. Backend architecture

### Entrypoint — `cmd/server/main.go`
1. `loadDotEnv(".env")` — reads `KEY=VALUE` lines; real env vars win over the file.
2. Connects Postgres via `store.NewPostgres(DATABASE_URL)` (returns a `*pgxpool.Pool`).
3. Connects Redis via `store.NewRedis(REDIS_URL)`.
4. Creates the `hub.Hub`, runs `go h.Run()`.
5. Ensures `UPLOAD_DIR` exists, registers routes, listens on `ADDR` (default `:8080`).

Config (all have sane defaults matching `docker-compose`):

| Env | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | `postgres://amber:amber@localhost:5432/amber_hour?sslmode=disable` | Postgres DSN |
| `REDIS_URL`    | `redis://localhost:6379` | Redis |
| `ADDR`         | `:8080` | listen address |
| `UPLOAD_DIR`   | `./uploads` | upload storage |

### HTTP routes — `internal/handler/http.go`

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /healthz` | – | liveness (DB ping) |
| `GET /readyz`  | – | readiness (DB + Redis) |
| `GET /metrics` | – | Prometheus |
| `POST /api/signup`, `POST /api/login` | – | returns JWT |
| `GET/POST /api/menu`, `/api/menu/…` | JWT | drink menu (staff edits) |
| `GET /api/wallet`, `/api/leaderboard` | JWT | play‑money balance & ranking |
| `POST /api/upload` | JWT | image/file upload → `/uploads/…` |
| `/api/orders`, `/api/orders/me`, `/api/orders/…` | JWT | drink orders / tabs |
| `/api/invite`, `/api/ai/bartender`, `/api/guestbook` | mixed | invites, AI bartender, guestbook |
| `GET /uploads/…` | – | static file server |
| `GET /ws` | token | WebSocket upgrade |

Auth is JWT (`withAuth` middleware); passwords hashed with bcrypt.

### The Hub — `internal/hub/hub.go`
- Holds the set of connected `*Client`s with `register` / `unregister` / `inbound` channels (classic gorilla pattern).
- **Fan‑out via Redis**: outgoing broadcasts are published to the Redis channel
  `amber:broadcast`; every backend instance subscribes and relays to its own
  clients. This is what makes horizontal scaling (multiple pods) work.
- Owns app features that need shared realtime state: the **jukebox** queue /
  now‑playing / skip votes, and a **passive wallet ticker** (every connected
  patron earns `25฿` every `30s`).
- Inbound WS messages are JSON, dispatched by a `type` field (chat send, react,
  reply, edit, delete, typing, jukebox add/skip, whisper, etc.).

### Persistence
- `store.NewPostgres` → `pgxpool.New` (pooled). SQL lives inline in handlers/hub.
- Schema is in `backend/migrations/` (`001_init` … `005_wallet`). **Important:**
  the app does **not** run migrations on boot — they must be applied separately
  (the compose `migrate` service does this; in K8s you'd use an init container or Job).

---

## 5. Frontend architecture

- **Pages**: `Login` (JWT auth, branding panel), `Bar` (the main chat screen),
  `Lounge` (ambient backdrop) + `LoungePopup` (a little animated patron scene).
- **`hooks/useWebSocket.ts`**: opens `/ws`, parses inbound JSON, exposes message
  state + a `send()`; auto‑reconnect.
- **Components**: `ChatHeader`, `ChatInput`, `MessageList`, `LeftSidebar` /
  `RightSidebar`, `TabBar` / `TabPanel`, `MenuPanel`, `WhisperPanel`,
  `GuestbookPanel`, `SuggestPanel`, overlays (`CheersOverlay`, `QueueOverlay`,
  `NowPlayingBanner`, `TypingIndicator`, `DmToast`), `BarStatusBadge`, `Icons`.
- **Dev networking**: `vite.config.ts` proxies `/api`, `/ws`, `/uploads`,
  `/health` to `localhost:8080`, so `npm run dev` talks to the Go server directly.
  In production this proxy is replaced by **nginx** (see `frontend/nginx.conf`).

### Theming (important for future re‑skins)
The UI has **no component library**; colors come almost entirely from **CSS
variables** declared once in `src/index.css` `:root`. Components reference
`var(--bg)`, `var(--surface)`, `var(--amber)` (accent), `var(--text)`, etc. ~280
times. **To re‑theme the whole app you mostly edit that one `:root` block** — a
handful of status colors (online/offline/last‑call badges) are hard‑coded in a few
components and are the only other place colors live.

---

## 6. Running locally (without Docker)

```powershell
# 1. Infra (Postgres + Redis)
docker compose up -d postgres redis

# 2. Apply migrations once (fresh DB only) — e.g. with the migrate tool or psql

# 3. Backend  (from backend/)
go run ./cmd/server            # serves :8080

# 4. Frontend (from frontend/)
npm install                    # first time
npm run dev                    # Vite :5173, proxies to :8080
```

Open http://localhost:5173. If the backend says *"bind: address already in use"*,
a previous `server.exe` is still running — kill it and re‑run.

---

## 7. Docker / deployment

Three artifacts make the whole stack reproducible (and K8s‑ready):

- **`backend/Dockerfile`** — multi‑stage: `golang:1.23-alpine` builds a static
  binary (`CGO_ENABLED=0`), copied into a minimal `alpine` runtime that runs as a
  non‑root user, exposes `8080`, and `HEALTHCHECK`s `/healthz`.
- **`frontend/Dockerfile`** — multi‑stage: `node:20-alpine` runs `npm ci && npm run
  build`, then `nginx:alpine` serves the static `dist/`. `nginx.conf` does SPA
  fallback and reverse‑proxies `/api`, `/uploads`, `/healthz` and the `/ws`
  WebSocket to the `backend` service.
- **`docker-compose.yml`** — `postgres` + `redis` + a one‑shot **`migrate`** service
  (applies `backend/migrations` before the backend starts) + `backend` + `frontend`.
  Ports: frontend `:8081`, backend host `:8082`→container `:8080` (8082 avoids
  clashing with a local `go run` on :8080; override via `BACKEND_PORT`). The
  frontend reaches the backend internally as `http://backend:8080`, so the host
  port is only for direct debugging.

```powershell
docker compose up --build      # whole app; open http://localhost:8081
```

> **Gotcha — "Dirty database version N".** The `migrate` service applies the
> SQL migrations against a *fresh* database. If your Postgres volume already has
> the schema (e.g. you previously ran the app's `go run` against the same DB
> out‑of‑band), `001_init` will fail with *relation already exists* and mark the
> DB dirty. Fix it once by telling migrate the schema is already current:
> `UPDATE schema_migrations SET version = <N>, dirty = false;` (or
> `migrate ... force <N>`), then `docker compose up` re‑runs cleanly. A truly
> fresh volume (`docker compose down -v`) never hits this.

**K8s/Rancher mapping** (the point of this lab): the `migrate` service ↔ an init
container or `Job`; `/healthz` ↔ livenessProbe; `/readyz` ↔ readinessProbe;
`/metrics` ↔ a Prometheus `ServiceMonitor`; backend is stateless and scales
horizontally thanks to the Redis pub/sub fan‑out; `uploads/` needs a
`PersistentVolume` (or object storage) if you scale the backend.

---

## 8. Session changelog (handoff)

What changed in the most recent work session — **a Discord re‑skin plus Docker/Git
prep**. No backend code or product features were modified; the chat, menu, wallet,
jukebox, etc. all behave exactly as before.

### A. Discord theme (visual only)
- **`frontend/src/index.css`** — rewrote the `:root` palette from the warm
  "parchment" theme to **Discord dark** (blurple `#5865f2` accent, `#313338`/
  `#2b2d31`/`#383a40` surfaces, `#dbdee1` text). Variable **names were kept**, so
  ~280 usages flipped at once. `--amber-lt` is now a *lighter* blurple for readable
  emphasis text, so the single `button:hover` rule was changed to darken explicitly
  (`#4752c4`). Warm‑brown shadows → neutral dark.
- **Typography** — swapped the Google Font from Pixelify Sans/Mitr to **Noto Sans**
  (a close free stand‑in for Discord's "gg sans") in `index.html`, `:root`, and the
  Login brand title.
- **`frontend/src/components/MessageList.tsx`** — **rewrote chat bubbles into flat
  Discord‑style rows**: left‑aligned, avatar in a fixed gutter, role‑colored
  username + timestamp header, full‑width text (no bubble), grouped consecutive
  messages with a hover‑timestamp gutter, restyled reply reference, reaction pills,
  and hover action popover. All handlers/props (react/reply/edit/delete) unchanged.
- **Flat dark backgrounds** — removed the cozy‑bar GIF + CRT scanlines from
  `pages/Lounge.tsx` and `components/LoungePopup.tsx`, replaced with flat
  Discord‑dark gradients.
- **Status colors** — mapped the few hard‑coded hexes (online/offline/last‑call
  badges, "served" button, sprite colors, login gradient) to Discord green
  `#23a55a` / red `#f23f43` / gold `#f0b232` across `BarStatusBadge`, `LeftSidebar`,
  `RightSidebar`, `ChatHeader`, `TabPanel`, `LoungePopup`, `Login`.

### B. Documentation
- Added this **`ARCHITECTURE.md`** (system overview + this changelog).

### C. Docker / Git
- Added **`backend/Dockerfile`**, **`frontend/Dockerfile`** + **`frontend/nginx.conf`**,
  and **`.dockerignore`** files.
- Extended **`docker-compose.yml`** with `migrate`, `backend`, and `frontend` services.
- Initialized the git repo and made the first commit (no remote configured yet —
  add your own and push).

### D. Follow‑up session — image, menu, AI
- **Image lightbox** — clicking an image in chat now opens an in‑app full‑screen
  lightbox (dark backdrop, Esc / click‑to‑close, "Open original" link) instead of a
  new browser tab. `frontend/src/components/MessageList.tsx`.
- **Bigger menu** — added migration **`006_more_menu`** (+13 items): more cocktails,
  light drinks and snacks, plus two new categories **mocktail** and **shot**. Menu
  went 7 → 20 items. (The compose `migrate` service applies it; see the "Dirty
  database" gotcha in §7 — the existing dev volume needed a one‑time
  `force 5` before `006` applied.)
- **Smarter AI bartender** — both AI paths now get richer menu context. `recommend`
  previously sent only drink *names* capped at 10; it now sends every available
  item with **category, description and price** and a sharper instruction.
  `pick_for_me` also includes category and a clearer "match mood/flavor/strength/
  budget, drinks **or** snacks, valid IDs only" prompt. `backend/internal/handler/http.go`
  (response shapes unchanged, so `MenuPanel` / `SuggestPanel` are untouched).
- **Compose backend host port** moved to `8082` (override `BACKEND_PORT`) so the
  container stack runs alongside a local `go run` on :8080.

### Known follow‑ups / not done
- No Kubernetes manifests or Rancher config yet (only Dockerfiles + compose).
- Discord *dark* only — no light mode.
- Sidebars use the Discord palette but keep their original layout (not restyled into
  Discord's server‑rail/channel‑list chrome).
- Migrations are still applied out‑of‑band (compose `migrate` service / manual), not
  by the app itself.
