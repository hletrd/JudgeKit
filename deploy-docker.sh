#!/usr/bin/env bash
# =============================================================================
# JudgeKit Docker Deployment Script
#
# Syncs source code to the target VM and builds Docker images on the server,
# then starts the production stack with nginx reverse proxy.
#
# Usage:
#   ./deploy-docker.sh                    # Full deployment
#   ./deploy-docker.sh --skip-build       # Skip image build (reuse existing)
#   ./deploy-docker.sh --skip-languages   # Skip building judge language images
#   ./deploy-docker.sh --languages=core   # Build only core language images
#   ./deploy-docker.sh --languages=cpp,python,jvm  # Build specific languages
#
# Environment:
#   SSH_PASSWORD          — SSH password for the remote host (password auth)
#   SSH_KEY               — Path to SSH private key (key auth, e.g. key.pem)
#   REMOTE_HOST           — Target host IP or hostname (required, see .env)
#   REMOTE_USER           — Target SSH user (required, see .env)
#   DOMAIN                — Target domain name (required, see .env)
#   AUTH_URL_OVERRIDE     — Override AUTH_URL written to .env.production (optional)
#   SKIP_BUILD            — "1"/"true" to reuse existing Docker images (default off)
#   SKIP_LANGUAGES        — "1"/"true" to skip building judge language images
#   LANGUAGE_FILTER       — Comma-separated language IDs or "core" to scope builds
#   BUILD_WORKER_IMAGE    — "1"/"true" to build the dedicated judge worker image
#                            (default false on the app server; see CLAUDE.md)
#   INCLUDE_WORKER        — "1"/"true" to start the worker container in the
#                            production stack (default false on the app server)
#   SKIP_PREDEPLOY_BACKUP — "1"/"true" to skip the pg_dump pre-deploy backup
#                            (escape hatch when DB host is unreachable; use with care)
#   DRIZZLE_PUSH_FORCE    — "1" to allow drizzle-kit push --force on destructive
#                            schema diffs. Reserved for explicit user authorization
#                            with quoted-text consent; never set preemptively.
#   DEPLOY_INSTANCE       — Optional human-readable host label (e.g. "algo" or
#                            "worker-0"). When set, prepended to every info/
#                            success/warn/error log line as "[host=...]" so
#                            parallel deploys to different targets remain
#                            disambiguable in shared log streams (cycle 5).
#   SUDO_PASSWORD         — Optional sudo password used by remote_sudo. When
#                            unset, falls back to SSH_PASSWORD (preserves the
#                            current behavior on every existing target).
#                            Set this when the target rotates the OS sudo
#                            password independently of SSH credentials so the
#                            two rotations stay decoupled (cycle 6: closes
#                            C3-AGG-2).
#   DEPLOY_SSH_RETRY_MAX  — Optional integer override for the
#                            _initial_ssh_check retry attempt count (default
#                            4). Useful for slow-to-boot remote hosts where
#                            the default 4-attempt × exponential-backoff
#                            window (~30s) is too short. Non-integer or <1
#                            values fall back to 4 with a warn line. Values
#                            above 100 are soft-capped at 100 with a warn
#                            line to prevent operator-typo retry storms
#                            (cycle 8: closes C7-DB-2-upper-bound). (cycle 6:
#                            closes C3-AGG-3).
#
# Deploy hardening (cycle-1/2/3/5 fixes — see AGENTS.md "Deploy hardening"):
#   - .env.production is chmod 0600 by this script (cycle 2).
#   - SSH connections are multiplexed via ControlMaster + ControlPersist=60
#     using a /tmp socket dir (cycle 2; macOS $TMPDIR exceeds 104-byte UNIX
#     socket path limit).
#   - _initial_ssh_check retries 4 times with exponential backoff (cycle 2).
#   - Destructive drizzle-kit push diffs halt the deploy and escalate to
#     the operator instead of auto-forcing (cycle 1 policy).
#
# C3-AGG-5 modular-extraction trigger (TRIPPED at cycle 8):
#   - Touch counter on the SSH-helpers area is at 3 (cycles 5/6/8 modified
#     `_initial_ssh_check` and adjacent helpers). Per `_aggregate.md`
#     carry-forward registry (cycle-9 plan Task A), the next modification
#     to SSH-helpers MUST schedule the modular extraction (split helpers
#     into a separate sourced file) or document the deferral with a fresh
#     exit criterion. The 1500-line file-size trigger is not yet hit
#     (currently ~1100), but the touch-count trigger has been met. Do
#     NOT silently bypass this when editing SSH-helpers in future cycles.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Save caller-provided overrides before sourcing defaults
_CALLER_REMOTE_HOST="${REMOTE_HOST:-}"
_CALLER_REMOTE_USER="${REMOTE_USER:-}"
_CALLER_DOMAIN="${DOMAIN:-}"
_CALLER_SSH_PASSWORD="${SSH_PASSWORD:-}"
_CALLER_SUDO_PASSWORD="${SUDO_PASSWORD:-}"
_CALLER_SSH_KEY="${SSH_KEY:-}"
_CALLER_AUTH_URL_OVERRIDE="${AUTH_URL_OVERRIDE:-}"

# Source deployment env vars from .env.deploy (defaults)
if [[ -f "${SCRIPT_DIR}/.env.deploy" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/.env.deploy"
    set +a
fi

# Restore caller overrides (explicit env vars take precedence)
[[ -n "$_CALLER_REMOTE_HOST" ]] && REMOTE_HOST="$_CALLER_REMOTE_HOST"
[[ -n "$_CALLER_REMOTE_USER" ]] && REMOTE_USER="$_CALLER_REMOTE_USER"
[[ -n "$_CALLER_DOMAIN" ]] && DOMAIN="$_CALLER_DOMAIN"
[[ -n "$_CALLER_SSH_PASSWORD" ]] && SSH_PASSWORD="$_CALLER_SSH_PASSWORD"
[[ -n "$_CALLER_SUDO_PASSWORD" ]] && SUDO_PASSWORD="$_CALLER_SUDO_PASSWORD"
[[ -n "$_CALLER_SSH_KEY" ]] && SSH_KEY="$_CALLER_SSH_KEY"
[[ -n "$_CALLER_AUTH_URL_OVERRIDE" ]] && AUTH_URL_OVERRIDE="$_CALLER_AUTH_URL_OVERRIDE"

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required (see .env)}"
REMOTE_USER="${REMOTE_USER:?REMOTE_USER is required (see .env)}"
REMOTE_DIR="/home/${REMOTE_USER}/judgekit"
DOMAIN="${DOMAIN:?DOMAIN is required (see .env)}"
APP_PORT=3100

# Language presets
CORE_LANGS="cpp python jvm"
POPULAR_LANGS="$CORE_LANGS node rust go"
EXTENDED_LANGS="$POPULAR_LANGS ruby lua bash csharp php perl swift r haskell dart zig"
ALL_LANGS="cpp clang python pypy node jvm rust go swift csharp r perl php ruby lua haskell dart zig nim ocaml elixir julia d racket v fortran pascal cobol brainfuck scala erlang commonlisp bash esoteric ada clojure prolog tcl awk scheme groovy octave crystal powershell postscript fsharp apl freebasic smalltalk b nasm bqn lolcode forth algol68 umjunsik haxe raku shakespeare snobol4 icon uiua odin objective-c deno bun gleam sml micropython squirrel rexx hy arturo janet c3 vala nelua hare koka lean picat mercury wat purescript modula2 factor minizinc curry clean roc carp grain pony chapel elm flix idris2 moonbit rescript"

resolve_languages() {
  local spec="$1"
  case "$spec" in
    core)     echo "$CORE_LANGS" ;;
    popular)  echo "$POPULAR_LANGS" ;;
    extended) echo "$EXTENDED_LANGS" ;;
    all)      echo "$ALL_LANGS" ;;
    none)     echo "" ;;
    *)        echo "$spec" | tr ',' ' ' ;;
  esac
}

# Parse arguments. Env-var overrides are honored first, then CLI flags.
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_LANGUAGES="${SKIP_LANGUAGES:-false}"
LANGUAGE_FILTER="${LANGUAGE_FILTER:-}"
INCLUDE_WORKER="${INCLUDE_WORKER:-true}"
BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-auto}"
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-languages) SKIP_LANGUAGES=true ;;
    --languages=*) LANGUAGE_FILTER="${arg#--languages=}" ;;
    --no-worker) INCLUDE_WORKER=false ;;
    --with-worker) INCLUDE_WORKER=true ;;
    --skip-worker-build) BUILD_WORKER_IMAGE=false ;;
    --build-worker) BUILD_WORKER_IMAGE=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--skip-languages] [--languages=<preset|lang,lang,...>] [--no-worker|--with-worker] [--skip-worker-build|--build-worker]"
      echo ""
      echo "Options:"
      echo "  --no-worker    — Do not start a local judge worker (use when workers run on separate machines)"
      echo "  --with-worker  — Force starting a local judge worker"
      echo "  --skip-worker-build — Skip building the judge-worker image"
      echo "  --build-worker      — Force building the judge-worker image"
      echo ""
      echo "Environment:"
      echo "  INCLUDE_WORKER=false  — Persistently disable the local worker for this target"
      echo "  BUILD_WORKER_IMAGE=false — Persistently skip the judge-worker image build"
      echo ""
      echo "Language presets: core, popular, extended, all, none"
      echo "  core     — C/C++, Python, Java/Kotlin (~1.2 GB)"
      echo "  popular  — Core + Node.js, Rust, Go (~4 GB)"
      echo "  extended — Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig (~12 GB)"
      echo "  all      — All supported language images (~30 GB)"
      echo "  none     — Skip language image builds"
      exit 0
      ;;
  esac
done

if [[ "${BUILD_WORKER_IMAGE}" == "auto" ]]; then
  BUILD_WORKER_IMAGE="${INCLUDE_WORKER}"
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Optional deploy-instance prefix: when DEPLOY_INSTANCE is set, every log line
# is prefixed "[host=$DEPLOY_INSTANCE]" so parallel deploys to different targets
# can be disambiguated in shared log streams (cycle 5: closes C3-AGG-8). When
# unset, the prefix expands to the empty string and behavior is unchanged.
_log_prefix() {
  if [[ -n "${DEPLOY_INSTANCE:-}" ]]; then
    printf '[host=%s] ' "${DEPLOY_INSTANCE}"
  fi
}
info()    { echo -e "${BLUE}[INFO]${NC} $(_log_prefix)$*"; }
success() { echo -e "${GREEN}[OK]${NC} $(_log_prefix)$*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $(_log_prefix)$*"; }
error()   { echo -e "${RED}[ERROR]${NC} $(_log_prefix)$*" >&2; }
die()     { error "$*"; exit 1; }

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR"
if [[ -n "${SSH_KEY:-}" ]]; then
    SSH_OPTS="$SSH_OPTS -i ${SSH_KEY}"
fi

# SSH connection multiplexing: reuse one TCP/SSH session for all subsequent
# remote calls. Critical for password-auth targets (oj-internal at
# 10.50.1.116 via sshpass) where rapid-fire short-lived sessions trip sshd
# MaxStartups / fail2ban / PAM throttling and intermittently reject correct
# credentials. sshpass only authenticates the master; multiplexed sessions
# skip auth entirely. Helps key-auth targets too (faster handshake).
# Hardcode /tmp (do NOT use $TMPDIR): macOS sets $TMPDIR to a long
# /var/folders/.../T/ path which combined with the 40-char %C hash exceeds
# the 104-byte Unix-domain socket path limit and breaks every SSH attempt.
# /tmp is short and present on every Unix; mktemp -d still gives us a
# unique 0700 directory so the socket is not world-accessible.
SSH_CONTROL_DIR="$(mktemp -d /tmp/judgekit-ssh.XXXXXX)"
# defense-in-depth — mktemp -d already creates 0700; this guards against an
# unset/loose umask or a future maintainer changing the mktemp path
chmod 700 "$SSH_CONTROL_DIR"
SSH_OPTS="$SSH_OPTS -o ControlMaster=auto -o ControlPath=${SSH_CONTROL_DIR}/cm-%C -o ControlPersist=60 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=15"

_cleanup_ssh_master() {
    if [[ -d "${SSH_CONTROL_DIR:-}" ]]; then
        if [[ -n "${REMOTE_USER:-}" && -n "${REMOTE_HOST:-}" ]]; then
            ssh -o ControlPath="${SSH_CONTROL_DIR}/cm-%C" -O exit "${REMOTE_USER}@${REMOTE_HOST}" 2>/dev/null || true
        fi
        rm -rf "$SSH_CONTROL_DIR"
    fi
}
trap _cleanup_ssh_master EXIT

_initial_ssh_check() {
    # Retry attempt count is overridable via DEPLOY_SSH_RETRY_MAX env var
    # for slow-to-boot remote hosts. Non-integer or <1 values fall back to
    # the safe default of 4 with a warn line so a typo doesn't disable
    # the retry. (cycle 6: closes C3-AGG-3.)
    local max_attempts="${DEPLOY_SSH_RETRY_MAX:-4}"
    if ! [[ "$max_attempts" =~ ^[0-9]+$ ]] || (( max_attempts < 1 )); then
        warn "DEPLOY_SSH_RETRY_MAX='${max_attempts}' is not a positive integer; falling back to 4"
        max_attempts=4
    fi
    # Soft upper-bound cap to mitigate operator-typo retry storms (e.g.
    # an extra digit turning 10 into 10000). 100 attempts at the current
    # 2..30s exponential-backoff schedule is already ~25min, well past
    # any realistic boot-window. Override is preserved up to the cap.
    # (cycle 8: closes C7-DB-2-upper-bound.)
    if (( max_attempts > 100 )); then
        warn "DEPLOY_SSH_RETRY_MAX='${max_attempts}' exceeds soft cap of 100; clamping to 100"
        max_attempts=100
    fi
    local delay=2
    local attempt=1
    while (( attempt <= max_attempts )); do
        if remote "echo ok" >/dev/null 2>&1; then
            # Surface retry-recovery so a slowly-degrading host is observable
            # before it hard-fails a future deploy. Silent on the happy path.
            if (( attempt > 1 )); then
                info "SSH connection succeeded after ${attempt} attempts"
            fi
            return 0
        fi
        if (( attempt == max_attempts )); then return 1; fi
        warn "Initial SSH connectivity attempt ${attempt}/${max_attempts} failed; retrying in ${delay}s..."
        sleep "$delay"
        delay=$(( delay * 2 ))
        attempt=$(( attempt + 1 ))
    done
    return 1
}

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

remote_rsync() {
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        SSHPASS="$SSH_PASSWORD" rsync -s -e "sshpass -e ssh $SSH_OPTS" "$@"
    else
        rsync -s -e "ssh $SSH_OPTS" "$@"
    fi
}

remote_sudo() {
    local cmd="$1"
    local quoted_cmd
    printf -v quoted_cmd '%q' "$cmd"

    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        # Sudo password decoupled from SSH password: when SUDO_PASSWORD is set,
        # use it for sudo; otherwise fall back to SSH_PASSWORD (preserves prior
        # behavior on every existing target). This lets operators rotate the
        # OS sudo password independently of SSH credentials (cycle 6: closes
        # C3-AGG-2). sshpass continues to authenticate the SSH layer.
        local sudo_pw="${SUDO_PASSWORD:-${SSH_PASSWORD}}"
        printf '%s\n' "$sudo_pw" | sshpass -p "$SSH_PASSWORD" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}"
    else
        ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo bash -lc ${quoted_cmd}"
    fi
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "Pre-flight checks..."

if [[ -n "${SSH_PASSWORD:-}" ]]; then
    command -v sshpass >/dev/null 2>&1 || die "sshpass is required when SSH_PASSWORD is set"
fi

if [[ -n "${SSH_KEY:-}" && ! -f "${SSH_KEY}" ]]; then
    die "SSH key not found: ${SSH_KEY}"
fi

command -v rsync >/dev/null 2>&1 || die "rsync is not installed locally"

# Test SSH connectivity
_initial_ssh_check || die "Cannot SSH to ${REMOTE_USER}@${REMOTE_HOST}"
success "SSH connection to ${REMOTE_HOST} verified"

# Verify docker is available on the remote host
remote "docker info >/dev/null 2>&1" || die "docker is not available on the remote host"
success "Remote docker verified"

# Detect remote architecture
REMOTE_ARCH=$(remote "uname -m")
case "$REMOTE_ARCH" in
    x86_64)  PLATFORM="linux/amd64" ;;
    aarch64) PLATFORM="linux/arm64" ;;
    *)       PLATFORM="linux/amd64" ; warn "Unknown arch '${REMOTE_ARCH}', defaulting to linux/amd64" ;;
esac
info "Detected remote architecture: ${REMOTE_ARCH} → ${PLATFORM}"

# ---------------------------------------------------------------------------
# Step 1: Generate .env.production if it does not exist
# ---------------------------------------------------------------------------
if [[ ! -f "${SCRIPT_DIR}/.env.production" ]]; then
    info "Generating .env.production with fresh secrets..."
    AUTH_SECRET=$(openssl rand -base64 32)
    JUDGE_AUTH_TOKEN=$(openssl rand -hex 32)
    PLUGIN_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
    AUTH_URL_VALUE="${AUTH_URL_OVERRIDE:-https://${DOMAIN}}"
    cat > "${SCRIPT_DIR}/.env.production" <<EOF
# Auto-generated by deploy-docker.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=${AUTH_URL_VALUE}
AUTH_TRUST_HOST=true
DB_DIALECT=postgresql
DATABASE_URL=postgres://judgekit:\${POSTGRES_PASSWORD}@db:5432/judgekit
POSTGRES_PASSWORD=$(openssl rand -hex 32)
PLUGIN_CONFIG_ENCRYPTION_KEY=${PLUGIN_CONFIG_ENCRYPTION_KEY}
JUDGE_AUTH_TOKEN=${JUDGE_AUTH_TOKEN}
JUDGE_CONCURRENCY=2
POLL_INTERVAL=3000
JUDGE_DISABLE_CUSTOM_SECCOMP=0
RATE_LIMIT_MAX_ATTEMPTS=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_BLOCK_MS=900000
SUBMISSION_RATE_LIMIT_MAX_PER_MINUTE=10
SUBMISSION_MAX_PENDING=5
SUBMISSION_GLOBAL_QUEUE_LIMIT=200
EOF
    chmod 0600 "${SCRIPT_DIR}/.env.production"
    success "Generated .env.production with fresh secrets (mode 0600)"
else
    # Defense-in-depth: enforce 0600 on existing .env.production too. Older
    # deploys may have created the file under default umask 0022 (-> 0644);
    # re-applying chmod is idempotent and harmless when already 0600.
    chmod 0600 "${SCRIPT_DIR}/.env.production" 2>/dev/null || true
    info "Using existing .env.production"
fi

# ---------------------------------------------------------------------------
# Step 1b: Backfill missing required secrets in the remote .env.production
#
# Some env vars were added after older deployments were first provisioned
# (notably PLUGIN_CONFIG_ENCRYPTION_KEY for API key / plugin secret
# encryption). Redeploys without a manual edit would leave the app running
# with a missing secret and crash at first use. Backfill a random value if
# the key is missing on the remote — the value is stable as long as it's
# not deleted, so an accidental re-run does NOT rotate it.
# ---------------------------------------------------------------------------
info "Ensuring required secrets exist in remote .env.production..."
REMOTE_ENV_FILE="${REMOTE_DIR}/.env.production"
ensure_env_secret() {
  local key="$1"
  local generator="$2"
  if remote "test -f ${REMOTE_ENV_FILE} && grep -q '^${key}=' ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  if ! remote "test -f ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  local value
  value=$(openssl rand -hex 32)
  if [[ "$generator" == "base64" ]]; then
    value=$(openssl rand -base64 32)
  fi
  info "Backfilling missing secret ${key} in ${REMOTE_ENV_FILE}"
  remote "printf '\n%s=%s\n' '${key}' '${value}' >> ${REMOTE_ENV_FILE} && chmod 600 ${REMOTE_ENV_FILE}" \
    || warn "Failed to backfill ${key} — please add it manually before the app starts"
}

# Ensure a non-secret env var exists in the remote .env.production with a
# specific literal value. Unlike ensure_env_secret (which generates random
# secrets), this writes the exact value provided — essential for config keys
# like AUTH_TRUST_HOST=true or COMPILER_RUNNER_URL=<url>.
ensure_env_literal() {
  local key="$1"
  local literal_value="$2"
  if remote "test -f ${REMOTE_ENV_FILE} && grep -q '^${key}=' ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  if ! remote "test -f ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  info "Backfilling missing ${key}=${literal_value} in ${REMOTE_ENV_FILE}"
  remote "printf '\n%s=%s\n' '${key}' '${literal_value}' >> ${REMOTE_ENV_FILE} && chmod 600 ${REMOTE_ENV_FILE}" \
    || warn "Failed to backfill ${key} — please add it manually before the app starts"
}
ensure_env_secret PLUGIN_CONFIG_ENCRYPTION_KEY hex
# CRON_SECRET authenticates Prometheus / cron callers of /api/metrics.
# Without it, the metrics endpoint returns 401 to all anonymous traffic and
# operator monitoring is silently broken. Backfill once; do not rotate during
# normal deploys (the scrape config on the operator side stays stable).
ensure_env_secret CRON_SECRET hex
# Sidecar auth tokens — the Rust code-similarity and rate-limiter sidecars
# refuse to start in production without these (compose uses ${VAR:?}). Backfill
# missing values automatically so a fresh deploy does not crash on first boot.
ensure_env_secret CODE_SIMILARITY_AUTH_TOKEN hex
ensure_env_secret RATE_LIMITER_AUTH_TOKEN hex
# AUTH_TRUST_HOST must be true in production when behind a reverse proxy.
# Without it, validateTrustedAuthHost() rejects auth callbacks with UntrustedHost
# because the Host header may be the internal container hostname (e.g., localhost:3000)
# rather than the external domain.
ensure_env_literal AUTH_TRUST_HOST true

# When the local judge worker is disabled, the app container needs to reach the
# external worker via COMPILER_RUNNER_URL. Auto-inject the default Docker host
# URL if the key is missing — the operator can override it in .env.production
# with a custom URL (e.g., pointing at a remote worker host).
if [[ "${INCLUDE_WORKER}" != "true" ]]; then
    COMPILER_RUNNER_DEFAULT="http://host.docker.internal:3001"
    ensure_env_literal COMPILER_RUNNER_URL "${COMPILER_RUNNER_DEFAULT}"
fi

# ---------------------------------------------------------------------------
# Step 2: Sync source code to remote host
# ---------------------------------------------------------------------------
info "Syncing source code to ${REMOTE_HOST}:${REMOTE_DIR}..."
remote "mkdir -p ${REMOTE_DIR}"

remote_rsync -az --delete \
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
    --exclude='.context/' \
    --exclude='tests/' \
    --exclude='.playwright/' \
    --exclude='backups/' \
    --exclude='._*' \
    "${SCRIPT_DIR}/" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

# Remove any legacy escaped route-group directories that may have been created
# by earlier deploys on macOS (e.g. "\u005c(public)"), as they can confuse
# Next.js route type generation during remote builds.
remote "python3 - <<'PY'
from pathlib import Path
import shutil
root = Path('${REMOTE_DIR}') / 'src' / 'app'
for path in list(root.iterdir()) if root.exists() else []:
    if '\\\\' in path.name:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
PY"

# Only transfer .env.production if the remote does not already have one.
# Each target has its own secrets (AUTH_SECRET, JUDGE_AUTH_TOKEN, AUTH_URL).
# Overwriting would break the target's auth configuration.
if remote "test -f ${REMOTE_DIR}/.env.production" 2>/dev/null; then
    info "Remote .env.production exists — preserving (delete it manually to regenerate)"
else
    info "Transferring .env.production (first deploy)..."
    remote_copy "${SCRIPT_DIR}/.env.production" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.env.production"
fi

success "Source code synced to remote"

if [[ "${INCLUDE_WORKER}" != "true" ]]; then
    REMOTE_COMPILER_RUNNER_URL=$(remote "grep '^COMPILER_RUNNER_URL=' ${REMOTE_DIR}/.env.production 2>/dev/null | cut -d= -f2-" || true)
    REMOTE_COMPILER_RUNNER_URL="${REMOTE_COMPILER_RUNNER_URL:-http://judge-worker:3001}"
    if [[ -z "${REMOTE_COMPILER_RUNNER_URL}" || "${REMOTE_COMPILER_RUNNER_URL}" == "http://judge-worker:3001" ]]; then
        warn "COMPILER_RUNNER_URL is still the local default (${REMOTE_COMPILER_RUNNER_URL:-unset}) — the app may not reach the judge worker. Set it to the external worker URL in ${REMOTE_DIR}/.env.production."
    fi
fi

# ---------------------------------------------------------------------------
# Step 3: Build Docker images on the remote host
# ---------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == false ]]; then
    EXTRA_BUILD_ARGS=""
    if [[ "${DISABLE_MINIFY:-0}" == "1" ]]; then
        EXTRA_BUILD_ARGS="--build-arg DISABLE_MINIFY=1"
        info "Minification DISABLED (DISABLE_MINIFY=1)"
    fi
    if [[ -n "${NEXT_PUBLIC_GA_MEASUREMENT_ID:-}" ]]; then
        EXTRA_BUILD_ARGS="${EXTRA_BUILD_ARGS} --build-arg NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}"
        info "Google Analytics: ${NEXT_PUBLIC_GA_MEASUREMENT_ID}"
    fi

    info "Building app image on ${REMOTE_HOST} (judgekit-app:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} ${EXTRA_BUILD_ARGS} -t judgekit-app:latest -f Dockerfile ."
    success "App image built on remote"

    if [[ "${BUILD_WORKER_IMAGE}" == "true" ]]; then
        info "Building judge worker image on ${REMOTE_HOST} (judgekit-judge-worker:latest) [${PLATFORM}]..."
        remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} -t judgekit-judge-worker:latest -f Dockerfile.judge-worker ."
        success "Judge worker image built on remote"
    else
        info "Skipping judge worker image build (BUILD_WORKER_IMAGE=${BUILD_WORKER_IMAGE}, INCLUDE_WORKER=${INCLUDE_WORKER})"
    fi

    info "Building code-similarity image on ${REMOTE_HOST} (judgekit-code-similarity:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-code-similarity:latest -f Dockerfile.code-similarity ."
    success "Code similarity image built on remote"

    info "Building rate-limiter image on ${REMOTE_HOST} (judgekit-rate-limiter:latest) [${PLATFORM}]..."
    remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-rate-limiter:latest -f Dockerfile.rate-limiter-rs ."
    success "Rate limiter image built on remote"

    if [[ "$SKIP_LANGUAGES" == false ]]; then
        if [[ -n "$LANGUAGE_FILTER" ]]; then
            LANGS_TO_BUILD=$(resolve_languages "$LANGUAGE_FILTER")
            if [[ -z "$LANGS_TO_BUILD" ]]; then
                info "No languages selected (--languages=none), skipping language builds"
            else
                LANG_COUNT=$(echo $LANGS_TO_BUILD | wc -w | tr -d ' ')
                info "Building ${LANG_COUNT} judge language images on ${REMOTE_HOST} [${PLATFORM}]..."
                for lang in $LANGS_TO_BUILD; do
                    info "  Building judge-${lang}..."
                    remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judge-${lang} -f docker/Dockerfile.judge-${lang} ."
                done
                success "Selected judge language images built on remote"
            fi
        else
            info "Building all judge language images on ${REMOTE_HOST} [${PLATFORM}]..."
            remote "cd ${REMOTE_DIR} && (DOCKER_DEFAULT_PLATFORM=${PLATFORM} docker compose -f docker-compose.yml build || \
                DOCKER_DEFAULT_PLATFORM=${PLATFORM} docker-compose -f docker-compose.yml build)"
            success "Judge language images built on remote"
        fi
    fi
else
    info "Skipping image build (--skip-build)"
fi

# Clean up stale (dangling) images from previous builds — keeps :latest tagged images
info "Removing stale worker images from previous builds..."
remote "docker image prune -f" >/dev/null 2>&1 || true
success "Stale images cleaned up"

# ---------------------------------------------------------------------------
# Step 4: Set up docker-compose config on remote
# ---------------------------------------------------------------------------
info "Setting up docker-compose config on remote..."
remote "cp -f ${REMOTE_DIR}/docker-compose.production.yml ${REMOTE_DIR}/docker-compose.yml.deploy 2>/dev/null || true"
success "Config ready"

# ---------------------------------------------------------------------------
# Step 4b: Pre-deploy database backup (safety net against wipes)
#
# Every deploy captures a custom-format pg_dump of the current database before
# touching containers. Dumps land in ~/backups/ on the remote and are kept for
# BACKUP_RETAIN_DAYS days. Skipped automatically on first-time deploys when no
# container is running yet.
# ---------------------------------------------------------------------------
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
if remote "docker inspect judgekit-db >/dev/null 2>&1 && docker inspect --format='{{.State.Running}}' judgekit-db 2>/dev/null | grep -q true"; then
    info "Backing up existing database before deploy..."
    BACKUP_TS=$(date -u +%Y%m%d-%H%M%SZ)
    BACKUP_NAME="judgekit-predeploy-${BACKUP_TS}.dump"
    if remote "mkdir -p /home/${REMOTE_USER}/backups && \
        PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
        docker exec -e PGPASSWORD=\"\${PG_PASS}\" judgekit-db pg_dump -U judgekit -d judgekit --format=custom --compress=9 -f /tmp/${BACKUP_NAME} && \
        docker cp judgekit-db:/tmp/${BACKUP_NAME} /home/${REMOTE_USER}/backups/${BACKUP_NAME} && \
        docker exec judgekit-db rm -f /tmp/${BACKUP_NAME}"; then
        success "Pre-deploy backup saved: ~/backups/${BACKUP_NAME}"
        # Retention: delete dumps older than BACKUP_RETAIN_DAYS
        remote "find /home/${REMOTE_USER}/backups -maxdepth 1 -name 'judgekit-predeploy-*.dump' -mtime +${BACKUP_RETAIN_DAYS} -delete 2>/dev/null || true"
    else
        warn "Pre-deploy backup FAILED. Aborting deploy — run the deploy again once the database is reachable, or override with SKIP_PREDEPLOY_BACKUP=1"
        if [[ "${SKIP_PREDEPLOY_BACKUP:-0}" != "1" ]]; then
            die "Pre-deploy backup is required. Set SKIP_PREDEPLOY_BACKUP=1 to bypass at your own risk."
        fi
    fi
else
    info "No running judgekit-db detected — skipping pre-deploy backup (first deploy or db already stopped)"
fi

# ---------------------------------------------------------------------------
# Step 4c: PG volume safety check (see scripts/pg-volume-safety-check.sh)
#
# Detects the "anonymous pgdata volume" orphan-data scenario before we stop
# the database container. If the real cluster is in an anonymous volume (old
# compose behavior) and the named volume is empty, the next `docker compose
# up` would silently initdb a fresh cluster and lose all data. Set
# SKIP_PG_VOLUME_CHECK=1 to bypass; AUTO_MIGRATE_ORPHANED_PGDATA=1 to auto-
# migrate (after taking a tar + pg_dump snapshot).
# ---------------------------------------------------------------------------
if [[ "${SKIP_PG_VOLUME_CHECK:-0}" == "1" ]]; then
    warn "SKIP_PG_VOLUME_CHECK=1 set — skipping orphan-volume safety check"
else
    SAFETY_ARGS=""
    if [[ "${AUTO_MIGRATE_ORPHANED_PGDATA:-0}" == "1" ]]; then
        SAFETY_ARGS="--auto-migrate"
    fi
    info "Running PostgreSQL volume safety check on remote..."
    # The script is already rsynced to the remote in step 2. Run it there so
    # it can inspect docker on the actual host. Non-zero exit (except 2 = no
    # db container) aborts the deploy.
    set +e
    remote "bash ${REMOTE_DIR}/scripts/pg-volume-safety-check.sh ${SAFETY_ARGS}"
    SAFETY_RC=$?
    set -e
    case "$SAFETY_RC" in
      0) success "Safety check passed (named volume is authoritative)" ;;
      2) info "Safety check: no existing db container (first deploy)" ;;
      1)
        die "PG volume safety check FAILED — deploy aborted to protect the data. \
Read the recovery instructions printed above, re-run with \
AUTO_MIGRATE_ORPHANED_PGDATA=1 to auto-migrate, or \
SKIP_PG_VOLUME_CHECK=1 to bypass at your own risk."
        ;;
      *)
        die "PG volume safety check exited with unexpected code ${SAFETY_RC} — aborting"
        ;;
    esac
fi

# ---------------------------------------------------------------------------
# Step 5: Stop old containers, start DB first, migrate, then start all
#
# The `judge-worker` service used to be gated behind `profiles: ["worker"]`,
# which required every `docker compose` invocation to pass `--profile worker`
# or the worker would silently be skipped. The profile was removed (Apr 2026)
# after an incident where a manual `docker compose up` forgot the flag and
# the worker vanished on two targets at once. The worker is now always part
# of the stack; deployments that run dedicated workers elsewhere can stop
# the local worker with `docker compose stop judge-worker` after `up -d`.
# ---------------------------------------------------------------------------
info "Stopping existing containers (if any)..."
remote "cd ${REMOTE_DIR} && cp -f .env.production .env && (docker compose -f docker-compose.production.yml down --remove-orphans || docker-compose -f docker-compose.production.yml down --remove-orphans || true)"

# 5a. Start only the database container
info "Starting database container..."
remote "cd ${REMOTE_DIR} && (docker compose -f docker-compose.production.yml --env-file .env.production up -d db || docker-compose -f docker-compose.production.yml --env-file .env.production up -d db)"

info "Waiting for database to be healthy..."
DB_BECAME_HEALTHY=0
for i in $(seq 1 30); do
    if remote "docker inspect --format='{{.State.Health.Status}}' judgekit-db 2>/dev/null" | grep -q "healthy"; then
        DB_BECAME_HEALTHY=1
        break
    fi
    sleep 1
done
if [[ "${DB_BECAME_HEALTHY}" != "1" ]]; then
    die "Database did not become healthy in 30s — aborting deploy before migrations"
fi
success "Database is ready"

# ---------------------------------------------------------------------------
# Step 5b: Pre-drop secret_token backfill (idempotent, MUST run before push)
#
# Why this runs BEFORE drizzle-kit push:
#   The journal SQL file drizzle/pg/0020_drop_judge_workers_secret_token.sql
#   contains both a safety backfill DO-block AND the destructive DROP COLUMN.
#   But `drizzle-kit push` synthesizes its own DDL from schema.pg.ts and
#   IGNORES SQL files in the journal — so the safety backfill is dead under
#   the current deploy strategy. With DRIZZLE_PUSH_FORCE=1 the destructive
#   drop is applied AND the backfill is skipped, which would silently lock
#   out any judge_worker row with secret_token IS NOT NULL AND
#   secret_token_hash IS NULL (src/lib/judge/auth.ts:75-82 rejects them).
#
# Solution: inline the same DO-block here so it runs on every deploy via
# psql, regardless of the drizzle-kit push mode. The information_schema
# guard makes it a no-op when the column has already been dropped, so this
# can run safely on every deploy.
#
# Hash semantics: encode(sha256(secret_token::bytea), 'hex') matches the
# hashToken() function at src/lib/judge/auth.ts:21-23 (Node createHash().
# update(token).digest('hex')). Both produce the SHA-256 of the UTF-8 byte
# sequence of the raw token. Do not change one without the other.
#
# See cycle-6 plan (plans/done/2026-04-26-rpf-cycle-6-review-remediation.md
# Task A) and .context/reviews/_aggregate-cycle-5.md AGG5-1 for context.
#
# SUNSET CRITERION (cycle-7 AGG7-1, 2026-04-26):
#   This Step 5b can be REMOVED when BOTH conditions hold:
#     (a) The secret_token column is verified ABSENT from ALL deploy
#         environments. Verification command (run in each env):
#           psql ... -c "\d judge_workers" | grep -c secret_token
#         The grep result must be 1 (only `secret_token_hash`, NOT
#         `secret_token`).
#     (b) At least 6 months have passed since the cycle-6 fix was
#         deployed (commit 18d93273 on 2026-04-26).
#   Target re-evaluation: 2026-10-26.
#   See AGENTS.md "Database migration recovery (DRIZZLE_PUSH_FORCE)" >
#   "Sunset criteria" subsection for the operator-facing version.
# ---------------------------------------------------------------------------
info "Running pre-drop secret_token backfill (idempotent)..."

# Determine the Docker network name (compose project name + _default)
NETWORK_NAME=$(remote "docker network ls --format '{{.Name}}' | grep judgekit | head -1" 2>/dev/null)
NETWORK_NAME="${NETWORK_NAME:-judgekit_default}"

remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    docker run --rm \
    --network ${NETWORK_NAME} \
    -e POSTGRES_PASSWORD -e PGPASSWORD \
    postgres:18-alpine \
    psql -h db -U judgekit -d judgekit <<'SQL'
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'judge_workers' AND column_name = 'secret_token') THEN
    EXECUTE \$sql\$
      UPDATE judge_workers
      SET secret_token_hash = encode(sha256(secret_token::bytea), 'hex')
      WHERE secret_token_hash IS NULL AND secret_token IS NOT NULL
    \$sql\$;
  END IF;
END\$\$;
SQL" >/dev/null || die "secret_token backfill failed — aborting deploy"
success "secret_token backfill complete"

# ---------------------------------------------------------------------------
# Step 6: Run database migrations before starting the app
#
# Strategy choice: we use `drizzle-kit push` (live schema-vs-DB diff, no
# journal replay) instead of `drizzle-kit migrate` (apply numbered SQL
# files from drizzle/pg/*.sql in order). Push is more flexible against
# manual DB tweaks, BUT it prompts interactively on destructive changes
# (e.g. DROP COLUMN). In a non-interactive deploy shell, the prompt is
# left unanswered — drizzle-kit prints a warning, exits 0, and the
# destructive change is NOT applied. To keep deploy honest, the block
# below CAPTURES the push output, then scans for the data-loss prompt
# markers; when detected, it downgrades the success log to a warning.
#
# To force-apply destructive changes via push, set DRIZZLE_PUSH_FORCE=1
# (passes --force to drizzle-kit push). The Step 5b backfill above runs
# regardless of this flag, so push --force will not orphan workers.
# For journal-driven migrations instead, change `drizzle-kit push` to
# `drizzle-kit migrate` here AND verify drizzle/pg/meta/_journal.json +
# meta/<NN>_snapshot.json files stay in sync with src/lib/db/schema.pg.ts.
#
# See .context/reviews/_aggregate-cycle-5.md AGG5-1 for the prior failure
# mode where the success log was printed even though the destructive change
# was unapplied, masking schema drift across deploys.
# ---------------------------------------------------------------------------
info "Running database migrations (drizzle-kit push)..."

# NETWORK_NAME was determined in Step 5b above (same network for both psql
# and the drizzle-kit push container). Re-using here.

# Run drizzle-kit push via a temporary Node container connected to the DB network.
# This uses the source code already synced to the remote host (has drizzle.config.ts + schema).
# Output is CAPTURED so we can scan for the data-loss prompt below.
PUSH_FORCE_FLAG=""
if [[ "${DRIZZLE_PUSH_FORCE:-0}" == "1" ]]; then
  PUSH_FORCE_FLAG=" --force"
  info "DRIZZLE_PUSH_FORCE=1 set — destructive schema changes WILL be applied"
fi
PUSH_OUT=$(remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    export DATABASE_URL=\"postgres://judgekit:\${PG_PASS}@db:5432/judgekit\" && \
    docker run --rm \
      --network ${NETWORK_NAME} \
      -v ${REMOTE_DIR}:/app -w /app \
      -e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL \
      node:24-alpine \
      sh -c 'npm install --no-save drizzle-kit drizzle-orm nanoid 2>&1 | tail -1 && npx drizzle-kit push${PUSH_FORCE_FLAG}'" 2>&1) || \
  { printf '%s\n' "$PUSH_OUT"; die "drizzle-kit push failed — aborting deploy"; }
# Re-emit captured output so operators see what drizzle-kit reported.
printf '%s\n' "$PUSH_OUT"
# Detect the data-loss / interactive-prompt markers. drizzle-kit emits these
# when it finds a destructive diff and there's no TTY to answer the prompt.
if grep -qiE "data loss|are you sure|warning:.*destructive|please confirm" <<<"$PUSH_OUT"; then
  warn "drizzle-kit push detected a destructive schema change but did NOT apply it (interactive prompt unanswered or declined). Manual intervention required: review the diff above, then re-run with DRIZZLE_PUSH_FORCE=1 to apply, or use the journal-driven migrate strategy. See AGENTS.md \"Database migration recovery (DRIZZLE_PUSH_FORCE)\" section for details."
else
  success "Database migrated"
fi

# Apply additive schema repairs for columns that may be missing on older
# PostgreSQL deployments even when drizzle-kit push reports no diff.
info "Applying additive PostgreSQL schema repairs..."
remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    export DATABASE_URL=\"postgres://judgekit:\${PG_PASS}@db:5432/judgekit\" && \
    docker run --rm \
    --network ${NETWORK_NAME} \
    -e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL \
    postgres:18-alpine \
    psql -h db -U judgekit -d judgekit <<'SQL'
ALTER TABLE problems ADD COLUMN IF NOT EXISTS default_language text;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS default_language text;
SQL" >/dev/null
success "Schema repairs applied"

# Run ANALYZE to ensure query planner has fresh statistics
info "Running ANALYZE on database..."
remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
    export POSTGRES_PASSWORD=\"\${PG_PASS}\" && \
    export PGPASSWORD=\"\${PG_PASS}\" && \
    export DATABASE_URL=\"postgres://judgekit:\${PG_PASS}@db:5432/judgekit\" && \
    docker run --rm \
    --network ${NETWORK_NAME} \
    -e POSTGRES_PASSWORD -e PGPASSWORD -e DATABASE_URL \
    postgres:18-alpine \
    psql -h db -U judgekit -d judgekit -c 'ANALYZE;'" 2>&1 || true
success "Database statistics updated"

# 6b. Now start all remaining containers.
# The judge-worker service is always in the compose file (no profile gate).
# For targets that outsource judging to remote workers, INCLUDE_WORKER=false
# will stop the local worker immediately after it starts so the app and
# sidecars still come up cleanly.
if [[ "${INCLUDE_WORKER}" == "true" ]]; then
    info "Starting all containers (with local judge worker)..."
else
    info "Starting all containers (local judge worker will be stopped after startup)..."
fi
remote "cd ${REMOTE_DIR} && (docker compose -f docker-compose.production.yml --env-file .env.production up -d || docker-compose -f docker-compose.production.yml --env-file .env.production up -d)"

if [[ "${INCLUDE_WORKER}" != "true" ]]; then
    info "Stopping local judge-worker per INCLUDE_WORKER=${INCLUDE_WORKER}..."
    remote "cd ${REMOTE_DIR} && (docker compose -f docker-compose.production.yml --env-file .env.production stop judge-worker || docker-compose -f docker-compose.production.yml --env-file .env.production stop judge-worker 2>/dev/null || true)"
fi

info "Waiting for app container to be healthy..."
for i in $(seq 1 60); do
    if remote "docker inspect --format='{{.State.Health.Status}}' judgekit-app 2>/dev/null" | grep -q "healthy"; then
        break
    fi
    if [[ $i -eq 60 ]]; then
        warn "App container did not become healthy in 60s — check logs"
    fi
    sleep 1
done
success "All containers started"

# ---------------------------------------------------------------------------
# Step 7: Set up nginx reverse proxy
# ---------------------------------------------------------------------------
info "Configuring nginx reverse proxy for ${DOMAIN}..."
USE_TLS=false
if remote_sudo "test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem -a -f /etc/letsencrypt/live/${DOMAIN}/privkey.pem" 2>/dev/null; then
    USE_TLS=true
    info "Detected existing TLS certificate for ${DOMAIN}; generating HTTPS nginx config"
else
    info "No TLS certificate detected for ${DOMAIN}; generating HTTP-only nginx config"
fi

AUTH_URL_TARGET="${AUTH_URL_OVERRIDE:-$([ "${USE_TLS}" = "true" ] && echo "https://${DOMAIN}" || echo "http://${DOMAIN}")}"
remote "sed -i 's|^AUTH_URL=.*|AUTH_URL=${AUTH_URL_TARGET}|' ${REMOTE_DIR}/.env.production" 2>/dev/null || true

# Write nginx config to /tmp first (avoids heredoc + sudo + tee issues)
if [[ "${USE_TLS}" == "true" ]]; then
cat > /tmp/judgekit-nginx.conf <<NGINX_EOF
server_tokens off;

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

limit_req_zone \$binary_remote_addr zone=judgekit_login:10m rate=5r/s;
limit_req_zone \$binary_remote_addr zone=judgekit_judge:1m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    return 301 https://${DOMAIN}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    location /api/auth/ {
        limit_req zone=judgekit_login burst=10 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    # Final judge result reports can legitimately exceed 1 MiB because the
    # worker includes per-test outputs in the JSON payload. Keep the wider
    # body limit scoped to the report endpoint instead of the whole judge API.
    location = /api/v1/judge/poll {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
else
cat > /tmp/judgekit-nginx.conf <<NGINX_EOF
server_tokens off;

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

limit_req_zone \$binary_remote_addr zone=judgekit_login:10m rate=5r/s;
limit_req_zone \$binary_remote_addr zone=judgekit_judge:1m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location /api/auth/ {
        limit_req zone=judgekit_login burst=10 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    # Final judge result reports can legitimately exceed 1 MiB because the
    # worker includes per-test outputs in the JSON payload. Keep the wider
    # body limit scoped to the report endpoint instead of the whole judge API.
    location = /api/v1/judge/poll {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
fi

# Transfer nginx config via scp, then sudo copy into place
remote_copy /tmp/judgekit-nginx.conf "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/nginx-judgekit.conf"
remote_sudo "cp ${REMOTE_DIR}/nginx-judgekit.conf /etc/nginx/sites-available/judgekit"
remote_sudo "ln -sf /etc/nginx/sites-available/judgekit /etc/nginx/sites-enabled/judgekit"
rm -f /tmp/judgekit-nginx.conf

# Test and reload nginx
if remote_sudo "nginx -t 2>&1"; then
    remote_sudo "systemctl reload nginx"
    success "Nginx configured and reloaded for ${DOMAIN}"
else
    warn "Nginx config test failed — check manually on the remote host"
fi

# ---------------------------------------------------------------------------
# Step 8: Verify deployment
# ---------------------------------------------------------------------------
info "Verifying deployment..."
sleep 3

HTTP_CODE=$(remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${APP_PORT}" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" =~ ^(200|302|308)$ ]]; then
    success "JudgeKit is responding (HTTP ${HTTP_CODE})"
else
    warn "App returned HTTP ${HTTP_CODE} — it may still be starting up"
    warn "Check logs: ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml logs -f'"
fi

if [[ "${USE_TLS}" == "true" ]]; then
    HTTPS_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/login" || true)
    if [[ "${HTTPS_CODE}" =~ ^(200|302|308)$ ]]; then
        success "HTTPS endpoint verified (HTTP ${HTTPS_CODE})"
    else
        warn "HTTPS endpoint returned HTTP ${HTTPS_CODE} — check TLS/nginx configuration"
    fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================================================="
success "Deployment complete!"
echo "==========================================================================="
if [[ "${USE_TLS}" == "true" ]]; then
    info "URL:        https://${DOMAIN}"
else
    info "URL:        http://${DOMAIN}"
fi
info "Remote dir: ${REMOTE_DIR}"
info "Logs:       ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml logs -f'"
info "Seed admin: ssh ${REMOTE_USER}@${REMOTE_HOST} 'docker exec -it judgekit-app node scripts/seed.ts'"
info "Restart:    ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.production.yml --env-file .env.production restart'"
echo "==========================================================================="
