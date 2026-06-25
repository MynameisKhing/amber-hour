# syntax=docker/dockerfile:1

# ── Stage 1: build a static Go binary ──────────────────────────────
FROM golang:1.23-alpine AS build
WORKDIR /src

# Cache deps first
COPY go.mod go.sum ./
RUN go mod download

# Vet + test, then build (pgx is pure Go → no CGO needed → fully static binary).
# Running these here keeps validation in the streamed build context, so it works
# regardless of how the Docker daemon is provided (dind sidecar or node socket).
COPY . .
RUN go vet ./... && go test ./... -count=1
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ── Stage 2: minimal runtime ───────────────────────────────────────
FROM alpine:3.20
WORKDIR /app

# wget (for HEALTHCHECK) + CA certs; create a non-root user
RUN apk add --no-cache wget ca-certificates \
    && adduser -D -u 10001 amber \
    && mkdir -p /data/uploads \
    && chown -R amber:amber /data

COPY --from=build /out/server /app/server

ENV ADDR=:8080 \
    UPLOAD_DIR=/data/uploads

EXPOSE 8080
VOLUME ["/data/uploads"]
USER amber

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/app/server"]
