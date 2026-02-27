#!/usr/bin/env bash
set -euo pipefail

# ── TeamClaw Quick Setup Script ──────────────────────────
# Usage: bash setup.sh
# This script will:
#   1. Create .env from .env.example
#   2. Generate JWT RS256 key pair + encryption key
#   3. (Optional) Configure Nginx HTTPS reverse proxy
#   4. Start all services via Docker Compose
#      (init container handles DB migration + seed automatically)
#   5. Verify the app is running

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
ENABLE_NGINX=false
NGINX_DOMAIN="_"
NGINX_HTTPS="443"
NGINX_HTTP="80"

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

# ── Step 3: Nginx HTTPS Configuration (optional) ─────────
echo ""
echo -e "${CYAN}[3/5] Nginx HTTPS Configuration${NC}"
read -rp "  Enable Nginx reverse proxy with HTTPS? (y/N): " nginx_answer
if [[ "$nginx_answer" =~ ^[Yy]([Ee][Ss])?$ ]]; then
  ENABLE_NGINX=true
  echo ""

  # Domain name
  read -rp "  Domain name (default: _): " input_domain
  NGINX_DOMAIN="${input_domain:-_}"

  # SSL certificate detection
  CERT_DIR="nginx/cert"
  mkdir -p "$CERT_DIR"

  # Find existing cert files
  CERT_FILES=()
  KEY_FILES=()
  if [ -d "$CERT_DIR" ]; then
    while IFS= read -r -d '' f; do
      CERT_FILES+=("$(basename "$f")")
    done < <(find "$CERT_DIR" -maxdepth 1 \( -name "*.crt" -o -name "*.pem" \) -type f -print0 2>/dev/null)
    while IFS= read -r -d '' f; do
      KEY_FILES+=("$(basename "$f")")
    done < <(find "$CERT_DIR" -maxdepth 1 -name "*.key" -type f -print0 2>/dev/null)
  fi

  if [ ${#CERT_FILES[@]} -gt 0 ] && [ ${#KEY_FILES[@]} -gt 0 ]; then
    echo ""
    echo -e "  ${GREEN}Found certificate files in ${CERT_DIR}/:${NC}"
    echo -e "  ${CYAN}Certificates:${NC} ${CERT_FILES[*]}"
    echo -e "  ${CYAN}Keys:${NC}         ${KEY_FILES[*]}"
    echo ""
    read -rp "  SSL certificate filename (default: ${CERT_FILES[0]}): " input_cert
    SSL_CERT="${input_cert:-${CERT_FILES[0]}}"
    read -rp "  SSL private key filename (default: ${KEY_FILES[0]}): " input_key
    SSL_KEY="${input_key:-${KEY_FILES[0]}}"
  else
    echo ""
    echo -e "  ${RED}No SSL certificates found in ${CERT_DIR}/${NC}"
    echo -e "  ${YELLOW}Please place your certificate (.crt/.pem) and private key (.key) in ${CERT_DIR}/ and re-run setup.${NC}"
    echo ""
    echo -e "  ${CYAN}Example:${NC}"
    echo -e "    cp your-domain.crt your-domain.key ${CERT_DIR}/"
    echo -e "    bash setup.sh"
    exit 1
  fi

  # Ports
  echo ""
  read -rp "  HTTPS port (default: 443): " input_https
  NGINX_HTTPS="${input_https:-443}"
  read -rp "  HTTP port (default: 80): " input_http
  NGINX_HTTP="${input_http:-80}"

  # Write nginx config to .env
  $SED_INPLACE "s|NGINX_SERVER_NAME=.*|NGINX_SERVER_NAME=\"$NGINX_DOMAIN\"|" "$ENV_FILE"
  $SED_INPLACE "s|NGINX_HTTPS_PORT=.*|NGINX_HTTPS_PORT=\"$NGINX_HTTPS\"|" "$ENV_FILE"
  $SED_INPLACE "s|NGINX_HTTP_PORT=.*|NGINX_HTTP_PORT=\"$NGINX_HTTP\"|" "$ENV_FILE"
  $SED_INPLACE "s|NGINX_SSL_CERT=.*|NGINX_SSL_CERT=\"$SSL_CERT\"|" "$ENV_FILE"
  $SED_INPLACE "s|NGINX_SSL_KEY=.*|NGINX_SSL_KEY=\"$SSL_KEY\"|" "$ENV_FILE"

  echo ""
  echo -e "${GREEN}  -> Nginx HTTPS configured${NC}"
  echo -e "     Domain: ${NGINX_DOMAIN} | HTTPS: ${NGINX_HTTPS} | HTTP: ${NGINX_HTTP}"
  echo -e "     Cert: ${SSL_CERT} | Key: ${SSL_KEY}"
else
  echo -e "  ${YELLOW}Skipped. Using HTTP only.${NC}"
fi

# ── Step 4: Start Docker services ────────────────────────
# The init container automatically runs DB migration + seed
# before the app starts (via depends_on + service_completed_successfully)
echo ""
echo -e "${CYAN}[4/5] Starting Docker services (build + migrate + seed)...${NC}"

COMPOSE_CMD="docker compose -f $COMPOSE_FILE"
if [ "$ENABLE_NGINX" = true ]; then
  COMPOSE_CMD="$COMPOSE_CMD --profile nginx"
fi

if ! $COMPOSE_CMD up -d --build 2>&1; then
  echo -e "${RED}[ERROR] Docker Compose failed to start services${NC}"
  echo -e "${YELLOW}Check logs: docker compose -f $COMPOSE_FILE logs${NC}"
  exit 1
fi

# Verify init container completed successfully
INIT_EXIT=$(docker inspect teamclaw-init --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
if [ "$INIT_EXIT" != "0" ]; then
  echo -e "${RED}[ERROR] Database initialization failed (exit code: $INIT_EXIT)${NC}"
  echo -e "${YELLOW}Check init logs: docker compose -f $COMPOSE_FILE logs init${NC}"
  exit 1
fi
echo -e "${GREEN}  -> Database migrated and seeded${NC}"

# ── Step 5: Verify app is running ────────────────────────
# Source port settings from .env (docker compose reads .env automatically,
# but we also need them in the shell for health checks and output)
APP_PORT=$(grep '^APP_PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '"' || true)
APP_PORT="${APP_PORT:-3100}"

echo -e "${CYAN}[5/5] Verifying app is running...${NC}"
MAX_RETRIES=15
RETRY=0
until curl -sf -o /dev/null "http://localhost:${APP_PORT}"; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo -e "${RED}[ERROR] App failed to respond after ${MAX_RETRIES} attempts${NC}"
    echo -e "${YELLOW}Check logs: docker compose -f $COMPOSE_FILE logs app${NC}"
    exit 1
  fi
  sleep 2
done
echo -e "${GREEN}  -> App is running${NC}"

# Verify nginx if enabled
if [ "$ENABLE_NGINX" = true ]; then
  RETRY=0
  until curl -skf -o /dev/null "https://localhost:${NGINX_HTTPS}"; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
      echo -e "${YELLOW}[WARN] Nginx HTTPS not responding. Check: docker compose -f $COMPOSE_FILE logs nginx${NC}"
      break
    fi
    sleep 2
  done
  if [ $RETRY -lt $MAX_RETRIES ]; then
    echo -e "${GREEN}  -> Nginx HTTPS is running${NC}"
  fi
fi

# ── Print access info ────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Setup Complete!                        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$ENABLE_NGINX" = true ]; then
  if [ "$NGINX_DOMAIN" = "_" ]; then
    DISPLAY_DOMAIN="localhost"
  else
    DISPLAY_DOMAIN="$NGINX_DOMAIN"
  fi
  HTTPS_URL="https://${DISPLAY_DOMAIN}"
  [ "$NGINX_HTTPS" != "443" ] && HTTPS_URL="${HTTPS_URL}:${NGINX_HTTPS}"
  HTTP_URL="http://${DISPLAY_DOMAIN}"
  [ "$NGINX_HTTP" != "80" ] && HTTP_URL="${HTTP_URL}:${NGINX_HTTP}"

  echo -e "  ${CYAN}HTTPS URL:${NC}     ${HTTPS_URL}"
  echo -e "  ${CYAN}HTTP URL:${NC}      ${HTTP_URL} (-> redirects to HTTPS)"
  echo -e "  ${CYAN}Direct URL:${NC}    http://localhost:${APP_PORT} (bypasses Nginx)"
else
  echo -e "  ${CYAN}Access URL:${NC}    http://localhost:${APP_PORT}"
fi

echo -e "  ${CYAN}Admin Email:${NC}   admin@teamclaw.local"
echo -e "  ${CYAN}Admin Password:${NC} Admin@123456"
echo ""
echo -e "  ${YELLOW}Please change the default password after first login!${NC}"
echo ""
echo -e "  Useful commands:"
if [ "$ENABLE_NGINX" = true ]; then
  echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE --profile nginx logs -f${NC}  # View logs"
  echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE --profile nginx down${NC}     # Stop services"
  echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE --profile nginx up -d${NC}    # Restart"
else
  echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE logs -f app${NC}  # View logs"
  echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE down${NC}         # Stop services"
  echo -e "    ${CYAN}docker compose -f $COMPOSE_FILE up -d${NC}        # Restart"
fi
echo ""
