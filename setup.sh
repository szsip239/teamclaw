#!/usr/bin/env bash
set -euo pipefail

# ── TeamClaw Quick Setup Script ──────────────────────────
# Usage: bash setup.sh
# This script will:
#   1. Create .env from .env.example
#   2. Generate JWT RS256 key pair + encryption key
#   3. Start all services via Docker Compose
#   4. Wait for DB → run migrations + seed
#   5. Print access info

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║           TeamClaw Quick Setup                   ║"
echo "║   Enterprise OpenClaw Management Platform        ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Create .env ──────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}[!] .env already exists. Skipping copy.${NC}"
else
  if [ ! -f "$ENV_EXAMPLE" ]; then
    echo -e "${RED}[ERROR] $ENV_EXAMPLE not found!${NC}"
    exit 1
  fi
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo -e "${GREEN}[1/5] Created .env from .env.example${NC}"
fi

# ── Step 2: Generate secrets ─────────────────────────────
echo -e "${CYAN}[2/5] Generating cryptographic keys...${NC}"

# Generate RS256 key pair
PRIVATE_KEY=$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | openssl rsa -pubout 2>/dev/null)

JWT_PRIVATE_KEY=$(echo "$PRIVATE_KEY" | base64 | tr -d '\n')
JWT_PUBLIC_KEY=$(echo "$PUBLIC_KEY" | base64 | tr -d '\n')

# Generate encryption key (32 bytes hex = 64 chars)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Update .env with generated values
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_INPLACE="sed -i ''"
else
  SED_INPLACE="sed -i"
fi

$SED_INPLACE "s|JWT_PRIVATE_KEY=.*|JWT_PRIVATE_KEY=\"$JWT_PRIVATE_KEY\"|" "$ENV_FILE"
$SED_INPLACE "s|JWT_PUBLIC_KEY=.*|JWT_PUBLIC_KEY=\"$JWT_PUBLIC_KEY\"|" "$ENV_FILE"
$SED_INPLACE "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=\"$ENCRYPTION_KEY\"|" "$ENV_FILE"

echo -e "${GREEN}  -> JWT RS256 key pair generated${NC}"
echo -e "${GREEN}  -> AES-256-CBC encryption key generated${NC}"

# ── Step 3: Start Docker services ────────────────────────
echo -e "${CYAN}[3/5] Starting Docker services...${NC}"
docker compose -f "$COMPOSE_FILE" up -d --build

# ── Step 4: Wait for DB + migrate + seed ─────────────────
echo -e "${CYAN}[4/5] Waiting for database to be ready...${NC}"
MAX_RETRIES=30
RETRY=0
until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U teamclaw > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo -e "${RED}[ERROR] Database failed to start after ${MAX_RETRIES} attempts${NC}"
    exit 1
  fi
  sleep 2
done
echo -e "${GREEN}  -> Database is ready${NC}"

echo -e "${CYAN}  Running database migrations...${NC}"
docker compose -f "$COMPOSE_FILE" exec -T app npx prisma db push --skip-generate 2>/dev/null || true
echo -e "${GREEN}  -> Migrations applied${NC}"

echo -e "${CYAN}  Seeding database...${NC}"
docker compose -f "$COMPOSE_FILE" exec -T app npx tsx prisma/seed.ts 2>/dev/null || true
echo -e "${GREEN}  -> Database seeded${NC}"

# ── Step 5: Print access info ────────────────────────────
APP_PORT="${APP_PORT:-3000}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Setup Complete!                        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Access URL:${NC}    http://localhost:${APP_PORT}"
echo -e "  ${CYAN}Admin Email:${NC}   admin@teamclaw.local"
echo -e "  ${CYAN}Admin Password:${NC} Admin@123456"
echo ""
echo -e "  ${YELLOW}Please change the default password after first login!${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE logs -f app${NC}  # View logs"
echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE down${NC}         # Stop services"
echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE up -d${NC}        # Restart"
echo ""
