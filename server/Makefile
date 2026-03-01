.PHONY: dev build test lint migrate swagger clean \
        gen-env docker-up docker-down docker-logs docker-build docker-restart

GO ?= go
COMPOSE = docker compose -f docker-compose.dev.yml

# ── Development (local) ───────────────────────────────────
dev:
	$(GO) run ./cmd/server

build:
	$(GO) build -o bin/teamclaw-server ./cmd/server

test:
	$(GO) test ./... -v -count=1

lint:
	golangci-lint run ./...

migrate:
	$(GO) run ./cmd/server --migrate-only

swagger:
	swag init -g cmd/server/main.go -o api

clean:
	rm -rf bin/

deps:
	$(GO) mod tidy
	$(GO) mod download

# ── Key / env generation ─────────────────────────────────
gen-env:
	@echo "Generating .env with fresh RSA and AES keys..."
	@$(GO) run ./cmd/keygen > .env
	@echo ".env written. Do NOT commit this file."

# ── Docker (dev stack: postgres + redis + api) ───────────
docker-build:
	$(COMPOSE) build api

docker-up:
	$(COMPOSE) up -d --build
	@echo ""
	@echo "Services started:"
	@echo "  API  → http://localhost:3200"
	@echo "  DB   → 127.0.0.1:5432 (teamclaw / devpass)"
	@echo "  Redis→ 127.0.0.1:6379"
	@echo ""
	@echo "Run 'make docker-logs' to follow API logs."

docker-down:
	$(COMPOSE) down

docker-restart:
	$(COMPOSE) restart api

docker-logs:
	$(COMPOSE) logs -f api

docker-ps:
	$(COMPOSE) ps

# Full reset (removes volumes)
docker-reset:
	$(COMPOSE) down -v
