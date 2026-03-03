# ── Stage 1: Build ───────────────────────────────────────
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git

WORKDIR /build

COPY go.mod go.sum ./
COPY vendor ./vendor

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -ldflags="-s -w" -o teamclaw-server ./cmd/server

# ── Stage 2: Runtime ─────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /build/teamclaw-server .
COPY --from=builder /build/configs ./configs

EXPOSE 3200

CMD ["./teamclaw-server"]
