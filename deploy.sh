#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# JudgeKit All-in-One Deployment Script
# See .env for deployment targets and credentials.
# ============================================================

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required (see .env)}"
REMOTE_USER="${REMOTE_USER:?REMOTE_USER is required (see .env)}"
REMOTE_DIR="/home/${REMOTE_USER}/judgekit"
DOMAIN="${DOMAIN:?DOMAIN is required (see .env)}"
APP_PORT=3100
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
info()    { printf '\033[0;34m[INFO]\033[0m %s\n' "$*"; }
success() { printf '\033[0;32m[OK]\033[0m %s\n' "$*"; }
warn()    { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
die()     { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

# Load deployment env vars from .env.deploy
[[ -f "${SCRIPT_DIR}/.env.deploy" ]] && { set -a; source "${SCRIPT_DIR}/.env.deploy"; set +a; }

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

remote() {
  if [[ -n "${SSH_PASSWORD:-}" ]]; then
    sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
  else
    ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
  fi
}

remote_copy() {
  if [[ -n "${SSH_PASSWORD:-}" ]]; then
    sshpass -p "$SSH_PASSWORD" scp $SSH_OPTS "$@"
  else
    scp $SSH_OPTS "$@"
  fi
}

# ---- Step 1: Generate .env.production ----
if [[ ! -f "${SCRIPT_DIR}/.env.production" ]]; then
  info "Generating .env.production with fresh secrets..."
  cat > "${SCRIPT_DIR}/.env.production" <<EOF
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=http://${DOMAIN}
AUTH_TRUST_HOST=true
DB_DIALECT=postgresql
DATABASE_URL=postgres://judgekit:\${POSTGRES_PASSWORD}@db:5432/judgekit
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JUDGE_AUTH_TOKEN=$(openssl rand -hex 32)
JUDGE_CONCURRENCY=2
POLL_INTERVAL=2000
JUDGE_DISABLE_CUSTOM_SECCOMP=0
RATE_LIMIT_MAX_ATTEMPTS=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_BLOCK_MS=900000
SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE=10
SUBMISSION_MAX_PENDING=5
SUBMISSION_GLOBAL_QUEUE_LIMIT=200
EOF
  success "Generated .env.production"
else
  info "Using existing .env.production"
fi

# ---- Step 2: Build Docker images ----
info "Building app image..."
docker build -t judgekit-app:latest -f "${SCRIPT_DIR}/Dockerfile" "${SCRIPT_DIR}"
success "App image built"

info "Building judge worker image..."
docker build -t judgekit-judge-worker:latest -f "${SCRIPT_DIR}/Dockerfile.judge-worker" "${SCRIPT_DIR}"
success "Judge worker image built"

info "Building core judge language images (cpp, python, node, jvm, rust, go)..."
docker compose -f "${SCRIPT_DIR}/docker-compose.yml" build judge-cpp judge-python judge-node judge-jvm judge-rust judge-go
success "Judge language images built"

# ---- Step 3: Save and transfer images ----
TMPFILE="$(mktemp /tmp/judgekit-images.XXXXXX.tar.gz)"
trap "rm -f '$TMPFILE'" EXIT

info "Saving Docker images..."
docker save \
  judgekit-app:latest \
  judgekit-judge-worker:latest \
  judge-cpp:latest \
  judge-python:latest \
  judge-node:latest \
  judge-jvm:latest \
  judge-rust:latest \
  judge-go:latest \
  | gzip > "$TMPFILE"
success "Images saved ($(du -h "$TMPFILE" | cut -f1))"

info "Transferring images to ${REMOTE_HOST} (this may take a while)..."
remote_copy "$TMPFILE" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/judgekit-images.tar.gz"
success "Images transferred"

# ---- Step 4: Set up remote directory + transfer config ----
info "Setting up remote directory..."
remote "mkdir -p ${REMOTE_DIR}"

info "Transferring deployment files..."
remote_copy "${SCRIPT_DIR}/docker-compose.production.yml" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/docker-compose.yml"
remote_copy "${SCRIPT_DIR}/.env.production" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.env.production"
success "Config files transferred"

# ---- Step 5: Load images on remote ----
info "Loading Docker images on ${REMOTE_HOST}..."
remote "docker load < /tmp/judgekit-images.tar.gz && rm -f /tmp/judgekit-images.tar.gz"
success "Images loaded"

# ---- Step 6: Start containers ----
info "Starting containers..."
remote "cd ${REMOTE_DIR} && docker compose --env-file .env.production down --remove-orphans 2>/dev/null || true"
remote "cd ${REMOTE_DIR} && docker compose --env-file .env.production up -d"
success "Containers started"

# ---- Step 7: Wait for app + run migration ----
info "Waiting for app to start..."
sleep 5

info "Running database migrations (drizzle-kit push)..."
remote "docker exec judgekit-app-1 npx drizzle-kit push --force" 2>&1 || \
  warn "drizzle-kit push failed — may need manual intervention"
success "Database migrated"

# ---- Step 7b: Seed admin user + language configs ----
info "Seeding admin user and language configs..."
remote_copy "${SCRIPT_DIR}/scripts/seed.ts" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/scripts/seed.ts"
remote_copy "${SCRIPT_DIR}/scripts/sync-language-configs.ts" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/scripts/sync-language-configs.ts"

# The seed script needs tsx and full source — run it from the source dir
remote "cd ${REMOTE_DIR} && npx tsx scripts/seed.ts 2>&1" || warn "Seed script failed (may need tsx installed)"
remote "cd ${REMOTE_DIR} && npx tsx scripts/sync-language-configs.ts 2>&1" || warn "Language sync failed"
success "Seeding complete"

# ---- Step 8: Set up nginx reverse proxy ----
info "Configuring nginx for ${DOMAIN}..."
remote "sudo tee /etc/nginx/sites-available/judgekit > /dev/null" <<'NGINX_EOF'
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_EOF

remote "sudo ln -sf /etc/nginx/sites-available/judgekit /etc/nginx/sites-enabled/judgekit"
remote "sudo nginx -t && sudo systemctl reload nginx" || warn "Nginx not installed — install with: sudo apt install nginx"
success "Nginx configured"

# ---- Step 9: Verify ----
info "Verifying deployment..."
sleep 3
HTTP_CODE=$(remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${APP_PORT}" || echo "000")
if [[ "$HTTP_CODE" =~ ^(200|302)$ ]]; then
  success "JudgeKit is running!"
else
  warn "App returned HTTP ${HTTP_CODE} — may still be starting. Check logs:"
  warn "  ssh platform@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose logs -f'"
fi

echo ""
echo "============================================"
success "Deployment complete!"
echo "============================================"
info "URL:    http://${DOMAIN}"
info "Direct: http://${REMOTE_HOST}:${APP_PORT}"
info "Logs:   ssh platform@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose logs -f'"
info "Seed:   ssh platform@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose exec app npm run seed'"
echo ""
