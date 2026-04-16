#!/usr/bin/env bash
# =============================================================================
# deploy-algo.sh — Master deployment for algo.xylolabs.com
#
# Deploys the full JudgeKit stack:
#   - Web server (ARM64): app + db + services + local worker
#   - Worker (x86):       judge worker + ALL language images
#
# Usage:
#   ./scripts/deploy-algo.sh                  # Full deploy (web + worker)
#   ./scripts/deploy-algo.sh web              # Web server only
#   ./scripts/deploy-algo.sh worker           # Worker only
#   ./scripts/deploy-algo.sh bootstrap        # Bootstrap both instances only
#   ./scripts/deploy-algo.sh bootstrap-web    # Bootstrap web instance only
#   ./scripts/deploy-algo.sh bootstrap-worker # Bootstrap worker instance only
#   ./scripts/deploy-algo.sh worker-languages # Build language images on worker only
#
# Options:
#   --skip-bootstrap    Skip instance setup (Docker/swap/nginx already done)
#   --skip-languages    Skip building language images on worker
#   --web-languages=<preset>  Language preset for web server (default: popular)
#   --help              Show this help
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WEB_HOST="algo.xylolabs.com"
WEB_USER="ubuntu"
WEB_DOMAIN="algo.xylolabs.com"
SSH_KEY="${HOME}/.ssh/xylolabs-algo.pem"

WORKER_HOST="worker-0.algo.xylolabs.com"
WORKER_USER="ubuntu"
WORKER_DIR="/opt/judgekit-worker"
REMOTE_RUNNER_URL="http://172.17.0.1:3001"

SWAP_SIZE="8G"
WEB_LANGUAGE_PRESET="popular"

# Full language list (mirrors deploy-docker.sh)
ALL_LANGS="cpp clang python node jvm rust go swift csharp r perl php ruby lua haskell dart zig nim ocaml elixir julia d racket v fortran pascal cobol brainfuck scala erlang commonlisp bash esoteric ada clojure prolog tcl awk scheme groovy octave crystal powershell postscript fsharp apl freebasic smalltalk b nasm bqn lolcode forth algol68 umjunsik haxe raku shakespeare snobol4 icon uiua odin objective-c deno bun gleam sml micropython squirrel rexx hy arturo janet c3 vala nelua hare koka lean picat mercury wat purescript modula2 factor minizinc curry clean roc carp grain pony chapel elm flix idris2 moonbit rescript"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
PHASE="all"
SKIP_BOOTSTRAP=false
SKIP_LANGUAGES=false

for arg in "$@"; do
  case "$arg" in
    web|worker|bootstrap|bootstrap-web|bootstrap-worker|worker-languages)
      PHASE="$arg" ;;
    --skip-bootstrap)    SKIP_BOOTSTRAP=true ;;
    --skip-languages)    SKIP_LANGUAGES=true ;;
    --web-languages=*)   WEB_LANGUAGE_PRESET="${arg#*=}" ;;
    --help|-h)
      sed -n '2,/^# =====/{ /^# =====/d; s/^# //; s/^#//; p; }' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
phase()   { echo -e "\n${CYAN}━━━ $* ━━━${NC}\n"; }
die()     { error "$*"; exit 1; }

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR -i ${SSH_KEY}"

web_ssh()  { ssh $SSH_OPTS "${WEB_USER}@${WEB_HOST}" "$@"; }
web_sudo() {
  local cmd="$1"
  ssh $SSH_OPTS "${WEB_USER}@${WEB_HOST}" "sudo bash -c $(printf '%q' "$cmd")"
}
web_rsync() { rsync -e "ssh $SSH_OPTS" "$@"; }

worker_ssh()  { ssh $SSH_OPTS "${WORKER_USER}@${WORKER_HOST}" "$@"; }
worker_sudo() {
  local cmd="$1"
  ssh $SSH_OPTS "${WORKER_USER}@${WORKER_HOST}" "sudo bash -c $(printf '%q' "$cmd")"
}
worker_rsync() { rsync -e "ssh $SSH_OPTS" "$@"; }

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
info "Pre-flight checks..."

if [[ ! -f "${SSH_KEY}" ]]; then
  die "SSH key not found: ${SSH_KEY}"
fi

KEY_PERMS=$(stat -f '%Lp' "${SSH_KEY}" 2>/dev/null || stat -c '%a' "${SSH_KEY}" 2>/dev/null)
if [[ "${KEY_PERMS}" != "600" && "${KEY_PERMS}" != "400" ]]; then
  info "Fixing SSH key permissions (${KEY_PERMS} → 600)..."
  chmod 600 "${SSH_KEY}"
fi

command -v rsync >/dev/null 2>&1 || die "rsync is not installed locally"

echo ""
info "Deployment plan:"
info "  Web:    ${WEB_USER}@${WEB_HOST} (ARM64)"
info "  Worker: ${WORKER_USER}@${WORKER_HOST} (x86_64)"
info "  Domain: ${WEB_DOMAIN}"
info "  Phase:  ${PHASE}"
echo ""

# =====================================================================
# PHASE: Bootstrap Web Instance
# =====================================================================
do_bootstrap_web() {
  phase "Phase 1: Bootstrap Web Instance (${WEB_HOST})"

  "${SCRIPT_DIR}/bootstrap-instance.sh" \
    --host="${WEB_HOST}" \
    --ssh-key="${SSH_KEY}" \
    --ssh-user="${WEB_USER}" \
    --swap="${SWAP_SIZE}" \
    --nginx \
    --certbot --domain="${WEB_DOMAIN}"
}

# =====================================================================
# PHASE: Deploy Web Stack
# =====================================================================
do_deploy_web() {
  phase "Phase 2: Deploy Web Stack (${WEB_HOST})"

  info "Deploying JudgeKit web stack to ${WEB_HOST}..."
  info "Judge execution is delegated to ${WORKER_HOST}; disabling local worker build on ${WEB_HOST}"

  if web_ssh "test -f /home/${WEB_USER}/judgekit/.env.production" 2>/dev/null; then
    info "Ensuring remote COMPILER_RUNNER_URL points at the host-level runner tunnel (${REMOTE_RUNNER_URL})..."
    web_ssh "python3 - <<'PY'
from pathlib import Path
path = Path('/home/${WEB_USER}/judgekit/.env.production')
text = path.read_text()
line = 'COMPILER_RUNNER_URL=${REMOTE_RUNNER_URL}'
if 'COMPILER_RUNNER_URL=' in text:
    import re
    text = re.sub(r'^COMPILER_RUNNER_URL=.*$', line, text, flags=re.M)
else:
    if text and not text.endswith('\\n'):
        text += '\\n'
    text += line + '\\n'
path.write_text(text)
PY
chmod 600 /home/${WEB_USER}/judgekit/.env.production"
  else
    warn "Remote .env.production does not exist yet; deploy-docker.sh will require it to be provisioned before INCLUDE_WORKER=false deploys."
  fi

  # Use deploy-docker.sh with algo env vars
  cd "${PROJECT_DIR}"
  INCLUDE_WORKER=false \
  BUILD_WORKER_IMAGE=false \
  REMOTE_HOST="${WEB_HOST}" \
  REMOTE_USER="${WEB_USER}" \
  DOMAIN="${WEB_DOMAIN}" \
  SSH_KEY="${SSH_KEY}" \
    "${PROJECT_DIR}/deploy-docker.sh" \
      --skip-languages \
      --no-worker \
      --skip-worker-build

  success "Web stack deployed to ${WEB_HOST}"
}

# =====================================================================
# PHASE: Bootstrap Worker Instance
# =====================================================================
do_bootstrap_worker() {
  phase "Phase 3: Bootstrap Worker Instance (${WORKER_HOST})"

  "${SCRIPT_DIR}/bootstrap-instance.sh" \
    --host="${WORKER_HOST}" \
    --ssh-key="${SSH_KEY}" \
    --ssh-user="${WORKER_USER}" \
    --swap="${SWAP_SIZE}"
}

# =====================================================================
# PHASE: Deploy Worker
# =====================================================================
do_deploy_worker() {
  phase "Phase 4: Deploy Worker (${WORKER_HOST})"

  # 4a. Verify connectivity
  info "Testing worker SSH connectivity..."
  worker_ssh "echo ok" >/dev/null 2>&1 || die "Cannot SSH to ${WORKER_USER}@${WORKER_HOST}"
  success "Worker SSH connection verified"

  WORKER_ARCH=$(worker_ssh "uname -m")
  info "Worker architecture: ${WORKER_ARCH}"

  # 4b. Read JUDGE_AUTH_TOKEN from the web server's .env.production
  info "Reading JUDGE_AUTH_TOKEN from web server..."
  WEB_REMOTE_DIR="/home/${WEB_USER}/judgekit"
  JUDGE_AUTH_TOKEN=$(web_ssh "grep '^JUDGE_AUTH_TOKEN=' ${WEB_REMOTE_DIR}/.env.production | cut -d= -f2-" 2>/dev/null)
  if [[ -z "${JUDGE_AUTH_TOKEN}" ]]; then
    die "Could not read JUDGE_AUTH_TOKEN from ${WEB_HOST}:${WEB_REMOTE_DIR}/.env.production — deploy web first"
  fi
  success "Got JUDGE_AUTH_TOKEN from web server"

  # 4c. Sync source code to worker (needed for building images)
  info "Syncing source code to worker ${WORKER_HOST}:${WORKER_DIR}..."
  worker_sudo "mkdir -p ${WORKER_DIR} && chown ${WORKER_USER}:${WORKER_USER} ${WORKER_DIR}"
  worker_rsync -az --delete \
    --exclude='node_modules/' \
    --exclude='.next/' \
    --exclude='.git/' \
    --exclude='data/' \
    --exclude='.env*' \
    --exclude='*.db' \
    --exclude='judge-worker-rs/target/' \
    --exclude='rate-limiter-rs/target/' \
    --exclude='code-similarity-rs/target/' \
    --exclude='.omc/' \
    --exclude='.omx/' \
    --exclude='.claude/' \
    --exclude='.agent/' \
    --exclude='.sisyphus/' \
    --exclude='tests/' \
    --exclude='.playwright/' \
    --exclude='backups/' \
    --exclude='._*' \
    "${PROJECT_DIR}/" \
    "${WORKER_USER}@${WORKER_HOST}:${WORKER_DIR}/"
  success "Source synced to worker"

  # 4d. Build judge-worker image on the worker
  info "Building judge-worker image on ${WORKER_HOST} (${WORKER_ARCH})..."
  case "$WORKER_ARCH" in
    x86_64)  WORKER_PLATFORM="linux/amd64" ;;
    aarch64) WORKER_PLATFORM="linux/arm64" ;;
    *)       WORKER_PLATFORM="linux/amd64" ;;
  esac

  worker_ssh "cd ${WORKER_DIR} && docker build --no-cache --platform ${WORKER_PLATFORM} -t judgekit-judge-worker:latest -f Dockerfile.judge-worker ."
  success "Judge worker image built on worker"

  # 4e. Build ALL language images on the worker
  if [[ "${SKIP_LANGUAGES}" == "false" ]]; then
    do_worker_languages
  else
    info "Skipping language image builds (--skip-languages)"
  fi

  # 4f. Create .env file on the worker
  info "Creating worker environment file..."
  APP_URL="https://${WEB_DOMAIN}/api/v1"

  worker_ssh "cat > ${WORKER_DIR}/.env <<'ENVEOF'
JUDGE_BASE_URL=${APP_URL}
JUDGE_AUTH_TOKEN=${JUDGE_AUTH_TOKEN}
JUDGE_CONCURRENCY=4
JUDGE_WORKER_HOSTNAME=${WORKER_HOST}
RUST_LOG=info
ENVEOF
chmod 600 ${WORKER_DIR}/.env"
  success "Worker environment configured"

  # 4g. Copy compose file and start the worker
  info "Setting up docker-compose on worker..."
  worker_ssh "cp -f ${WORKER_DIR}/docker-compose.worker.yml ${WORKER_DIR}/docker-compose.yml"

  info "Starting worker containers..."
  worker_ssh "cd ${WORKER_DIR} && docker compose --env-file .env down --remove-orphans 2>/dev/null || true"
  worker_ssh "cd ${WORKER_DIR} && docker compose --env-file .env up -d"

  # Wait for health
  info "Waiting for worker to be healthy..."
  for i in $(seq 1 30); do
    if worker_ssh "docker inspect --format='{{.State.Health.Status}}' judgekit-judge-worker 2>/dev/null" | grep -q "healthy"; then
      break
    fi
    if [[ $i -eq 30 ]]; then
      warn "Worker did not become healthy in 30s — check logs"
    fi
    sleep 1
  done
  success "Worker deployed and running on ${WORKER_HOST}"

  # Clean up dangling images
  worker_ssh "docker image prune -f" >/dev/null 2>&1 || true
}

# =====================================================================
# PHASE: Build language images on worker
# =====================================================================
do_worker_languages() {
  phase "Building ALL language images on worker (${WORKER_HOST})"

  WORKER_ARCH=$(worker_ssh "uname -m")
  case "$WORKER_ARCH" in
    x86_64)  WORKER_PLATFORM="linux/amd64" ;;
    aarch64) WORKER_PLATFORM="linux/arm64" ;;
    *)       WORKER_PLATFORM="linux/amd64" ;;
  esac

  LANG_COUNT=$(echo $ALL_LANGS | wc -w | tr -d ' ')
  info "Building ${LANG_COUNT} language images on ${WORKER_HOST} [${WORKER_PLATFORM}]..."
  info "This will take a long time — grab some coffee."
  echo ""

  BUILT=0
  FAILED=0
  FAILED_LANGS=""
  for lang in $ALL_LANGS; do
    BUILT=$((BUILT + 1))
    info "[${BUILT}/${LANG_COUNT}] Building judge-${lang}..."
    if worker_ssh "cd ${WORKER_DIR} && docker build --platform ${WORKER_PLATFORM} -t judge-${lang} -f docker/Dockerfile.judge-${lang} . 2>&1 | tail -1"; then
      success "  judge-${lang} built"
    else
      FAILED=$((FAILED + 1))
      FAILED_LANGS="${FAILED_LANGS} ${lang}"
      warn "  judge-${lang} FAILED — continuing with remaining languages"
    fi
  done

  echo ""
  success "Language images: ${BUILT} attempted, $((BUILT - FAILED)) succeeded, ${FAILED} failed"
  if [[ ${FAILED} -gt 0 ]]; then
    warn "Failed languages:${FAILED_LANGS}"
    warn "Retry with: ssh ${WORKER_USER}@${WORKER_HOST} 'cd ${WORKER_DIR} && docker build -t judge-<lang> -f docker/Dockerfile.judge-<lang> .'"
  fi
}

# =====================================================================
# Phase Router
# =====================================================================
case "$PHASE" in
  all)
    if [[ "$SKIP_BOOTSTRAP" == "false" ]]; then
      do_bootstrap_web
      do_bootstrap_worker
    else
      info "Skipping bootstrap phases (--skip-bootstrap)"
    fi
    do_deploy_web
    do_deploy_worker
    ;;
  web)
    if [[ "$SKIP_BOOTSTRAP" == "false" ]]; then
      do_bootstrap_web
    fi
    do_deploy_web
    ;;
  worker)
    if [[ "$SKIP_BOOTSTRAP" == "false" ]]; then
      do_bootstrap_worker
    fi
    do_deploy_worker
    ;;
  bootstrap)
    do_bootstrap_web
    do_bootstrap_worker
    ;;
  bootstrap-web)
    do_bootstrap_web
    ;;
  bootstrap-worker)
    do_bootstrap_worker
    ;;
  worker-languages)
    # Ensure source is synced before building
    info "Ensuring source is synced to worker..."
    worker_ssh "test -d ${WORKER_DIR}/docker" 2>/dev/null || \
      die "Source not found on worker. Run 'deploy-algo.sh worker' first."
    do_worker_languages
    ;;
  *)
    die "Unknown phase: ${PHASE}"
    ;;
esac

# =====================================================================
# Final Summary
# =====================================================================
echo ""
echo "==========================================================================="
success "algo.xylolabs.com deployment complete!"
echo "==========================================================================="
info "Web:           https://${WEB_DOMAIN}"
info "Web SSH:       ssh -i ${SSH_KEY} ${WEB_USER}@${WEB_HOST}"
info "Web logs:      ssh -i ${SSH_KEY} ${WEB_USER}@${WEB_HOST} 'cd ~/judgekit && docker compose -f docker-compose.production.yml logs -f'"
info "Worker SSH:    ssh -i ${SSH_KEY} ${WORKER_USER}@${WORKER_HOST}"
info "Worker logs:   ssh -i ${SSH_KEY} ${WORKER_USER}@${WORKER_HOST} 'cd ${WORKER_DIR} && docker compose logs -f'"
info "Seed admin:    ssh -i ${SSH_KEY} ${WEB_USER}@${WEB_HOST} 'docker exec -it judgekit-app node scripts/seed.ts'"
echo "==========================================================================="
