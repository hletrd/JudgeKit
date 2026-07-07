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
#   ./deploy-docker.sh --dry-run          # Generate nginx config locally without deploying
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
#                            (default follows INCLUDE_WORKER; set false on
#                            app-only targets; see CLAUDE.md)
#   INCLUDE_WORKER        — "1"/"true" to start the worker container in the
#                            production stack (default true unless disabled by
#                            the target deploy env)
#   SKIP_PREDEPLOY_BACKUP — "1"/"true" to skip the pg_dump pre-deploy backup
#                            (escape hatch when DB host is unreachable; use with care)
#   SKIP_POST_DEPLOY_PRUNE — "1"/"true" to skip the default post-deploy
#                            Docker artifact cleanup (stopped containers,
#                            dangling images, BuildKit cache). Volumes are
#                            never pruned by automated deploy cleanup.
#                            Cleanup is on by default — every judge-image
#                            rebuild leaves the prior tag dangling and the
#                            disk fills up without it. Set this only when
#                            you need to keep old images for debugging.
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
#   LANGUAGE_BUILD_STRATEGY — "sequential" (default) or "compose" for the
#                            all-languages build (no LANGUAGE_FILTER set).
#                            Sequential per-language `docker build` is the
#                            default because the one-shot parallel compose
#                            bake of ~90 targets corrupted the BuildKit
#                            history store twice on a cold cache (auraedu,
#                            Docker 29.1.3/buildx 0.20.0 — "unknown blob ...
#                            in history"; RPF cycle-2, closes DEFERRED-OPS-1).
#   COMPOSE_PARALLEL_LIMIT — Build-parallelism cap for the opt-in
#                            LANGUAGE_BUILD_STRATEGY=compose path (default 4).
#                            Ignored by the sequential strategy.
#   E2E_HOME_HEADING       — Expected homepage h1 pattern for the post-deploy
#                            smoke (regex source, case-insensitive). Set per
#                            target when the instance brands its hero via
#                            system_settings.homePageContent (e.g.
#                            E2E_HOME_HEADING='AuraEdu' for oj.auraedu.me).
#                            Empty/unset keeps the stock en/ko default
#                            (RPF cycle-3 AGG3-3).
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
_CALLER_SKIP_BUILD="${SKIP_BUILD:-}"
_CALLER_SKIP_LANGUAGES="${SKIP_LANGUAGES:-}"
_CALLER_LANGUAGE_FILTER="${LANGUAGE_FILTER:-}"
_CALLER_INCLUDE_WORKER="${INCLUDE_WORKER:-}"
_CALLER_BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-}"
_CALLER_WORKER_HOSTS="${WORKER_HOSTS:-}"
_CALLER_COMPILER_RUNNER_URL="${COMPILER_RUNNER_URL:-}"
_CALLER_E2E_HOME_HEADING="${E2E_HOME_HEADING:-}"

# Detect --dry-run early so missing remote env vars do not abort generation.
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

DEPLOY_TARGET="${DEPLOY_TARGET:-}"
if [[ "${DEPLOY_TARGET}" == "oj" ]]; then
    DEPLOY_TARGET="auraedu"
fi
# test.worv.ai ('worv') was retired from the deployment roster on 2026-07-06
# (user directive). Refuse it explicitly — a stale local .env.deploy.worv may
# still exist on disk and must never be deployed to again.
if [[ "${DEPLOY_TARGET}" == "worv" ]]; then
    echo "[FATAL] DEPLOY_TARGET='worv' (test.worv.ai) was retired on 2026-07-06 and is no longer a deploy target." >&2
    exit 1
fi
TARGET_ENV_FILE=""
if [[ -n "${DEPLOY_TARGET}" ]]; then
    case "${DEPLOY_TARGET}" in
        algo|auraedu) ;;
        *)
            echo "[FATAL] Unknown DEPLOY_TARGET='${DEPLOY_TARGET}'. Expected one of: algo, auraedu (alias: oj)." >&2
            exit 1
            ;;
    esac
    TARGET_ENV_FILE="${SCRIPT_DIR}/.env.deploy.${DEPLOY_TARGET}"
    if [[ ! -f "${TARGET_ENV_FILE}" ]]; then
        echo "[FATAL] Missing target profile '${TARGET_ENV_FILE}' for DEPLOY_TARGET='${DEPLOY_TARGET}'." >&2
        exit 1
    fi
fi

secure_local_env_profile() {
    local env_file="$1"
    if [[ ! -f "${env_file}" ]]; then
        return 0
    fi
    if ! chmod 600 "${env_file}" 2>/dev/null; then
        echo "[FATAL] Could not chmod 600 ${env_file}; refusing to source deploy credentials." >&2
        exit 1
    fi
}

source_local_env_profile() {
    local env_file="$1"
    secure_local_env_profile "${env_file}"
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
}

# Source deployment env vars from .env.deploy (defaults)
if [[ -f "${SCRIPT_DIR}/.env.deploy" ]]; then
    source_local_env_profile "${SCRIPT_DIR}/.env.deploy"
fi

# Source per-target overrides (e.g. .env.deploy.algo) so
# `DEPLOY_TARGET=algo ./deploy-docker.sh` honours the CLAUDE.md app-server
# defaults (SKIP_LANGUAGES=true, BUILD_WORKER_IMAGE=false, INCLUDE_WORKER=false).
# Explicit caller env vars still win because the caller-override restoration
# block below re-applies them after this sourcing, then host safety assertions
# reject unsafe production target combinations.
if [[ -n "${TARGET_ENV_FILE}" ]]; then
    source_local_env_profile "${TARGET_ENV_FILE}"
fi

# Restore caller overrides (explicit env vars take precedence)
[[ -n "$_CALLER_REMOTE_HOST" ]] && REMOTE_HOST="$_CALLER_REMOTE_HOST"
[[ -n "$_CALLER_REMOTE_USER" ]] && REMOTE_USER="$_CALLER_REMOTE_USER"
[[ -n "$_CALLER_DOMAIN" ]] && DOMAIN="$_CALLER_DOMAIN"
[[ -n "$_CALLER_SSH_PASSWORD" ]] && SSH_PASSWORD="$_CALLER_SSH_PASSWORD"
[[ -n "$_CALLER_SUDO_PASSWORD" ]] && SUDO_PASSWORD="$_CALLER_SUDO_PASSWORD"
[[ -n "$_CALLER_SSH_KEY" ]] && SSH_KEY="$_CALLER_SSH_KEY"
[[ -n "$_CALLER_AUTH_URL_OVERRIDE" ]] && AUTH_URL_OVERRIDE="$_CALLER_AUTH_URL_OVERRIDE"
[[ -n "$_CALLER_SKIP_BUILD" ]] && SKIP_BUILD="$_CALLER_SKIP_BUILD"
[[ -n "$_CALLER_SKIP_LANGUAGES" ]] && SKIP_LANGUAGES="$_CALLER_SKIP_LANGUAGES"
[[ -n "$_CALLER_LANGUAGE_FILTER" ]] && LANGUAGE_FILTER="$_CALLER_LANGUAGE_FILTER"
[[ -n "$_CALLER_INCLUDE_WORKER" ]] && INCLUDE_WORKER="$_CALLER_INCLUDE_WORKER"
[[ -n "$_CALLER_BUILD_WORKER_IMAGE" ]] && BUILD_WORKER_IMAGE="$_CALLER_BUILD_WORKER_IMAGE"
[[ -n "$_CALLER_WORKER_HOSTS" ]] && WORKER_HOSTS="$_CALLER_WORKER_HOSTS"
[[ -n "$_CALLER_COMPILER_RUNNER_URL" ]] && COMPILER_RUNNER_URL="$_CALLER_COMPILER_RUNNER_URL"
[[ -n "$_CALLER_E2E_HOME_HEADING" ]] && E2E_HOME_HEADING="$_CALLER_E2E_HOME_HEADING"

# In dry-run mode we only generate artifacts locally; provide placeholder
# remote values so the rest of the script can run without a real target.
if [[ "${DRY_RUN}" == "1" ]]; then
  REMOTE_HOST="${REMOTE_HOST:-dry-run.local}"
  REMOTE_USER="${REMOTE_USER:-dryrun}"
  DOMAIN="${DOMAIN:-dry-run.local}"
fi

REMOTE_HOST="${REMOTE_HOST:?REMOTE_HOST is required (see .env)}"
REMOTE_USER="${REMOTE_USER:?REMOTE_USER is required (see .env)}"
REMOTE_DIR="/home/${REMOTE_USER}/judgekit"
DOMAIN="${DOMAIN:?DOMAIN is required (see .env)}"
APP_PORT=3100

# Language presets
CORE_LANGS="cpp python jvm"
POPULAR_LANGS="$CORE_LANGS node rust go"
EXTENDED_LANGS="$POPULAR_LANGS ruby lua bash csharp php perl swift r haskell dart zig"
# ALL_LANGS used to ship every language image we have a Dockerfile for.
# A handful of obscure functional/research languages have no prebuilt aarch64
# binaries, so building them on an ARM deploy target compiles their entire
# compiler + stdlib from source — none of them currently receive production
# submissions. They're excluded from "all" by default; build them
# deliberately with LANGUAGE_FILTER=cpp,carp,chapel,... when you need them,
# or LANGUAGE_FILTER=everything to include all of them.
#
# Mercury is the worst offender: its install script iterates through 13
# library "grades" (hlc.gc, hlc.par.gc, reg.gc.debug.stseg, ...) and
# rebuilds the entire stdlib + runtime for each one. The
# `--enable-libgrades=hlc.gc` configure flag does NOT short-circuit that
# loop — empirically (auraedu, May 2026) the install scripts still iterate
# through every grade name regardless. A full aarch64 mercury build runs
# ~3 hours wall time on a 3-core instance even with --enable-libgrades set.
# Worth revisiting later by patching Mercury's Mmakefile directly, but for
# now mercury stays in the prohibitive set.
ARM_PROHIBITIVE_LANGS="carp chapel clean curry elm factor flix grain idris2 mercury minizinc modula2 moonbit pony purescript rescript roc wat"
ALL_LANGS="cpp clang python pypy node jvm rust go swift csharp r perl php ruby lua haskell dart zig nim ocaml elixir julia d racket v fortran pascal cobol brainfuck scala erlang commonlisp bash esoteric ada clojure prolog tcl awk scheme groovy octave crystal powershell postscript fsharp apl freebasic smalltalk b nasm bqn lolcode forth algol68 umjunsik haxe raku shakespeare snobol4 icon uiua odin objective-c deno bun gleam sml micropython squirrel rexx hy arturo janet c3 vala nelua hare koka lean picat"

resolve_languages() {
  local spec="$1"
  case "$spec" in
    core)     echo "$CORE_LANGS" ;;
    popular)  echo "$POPULAR_LANGS" ;;
    extended) echo "$EXTENDED_LANGS" ;;
    all)      echo "$ALL_LANGS" ;;
    none)     echo "" ;;
    # Escape hatch for the rare case you really do want the ARM-prohibitive
    # set. Builds the (already huge) ALL_LANGS plus mercury/carp/chapel/...
    # on aarch64 this can take several hours and ~30 GB of disk per cycle.
    everything) echo "$ALL_LANGS $ARM_PROHIBITIVE_LANGS" ;;
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
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--skip-languages] [--languages=<preset|lang,lang,...>] [--no-worker|--with-worker] [--skip-worker-build|--build-worker] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --no-worker    — Do not start a local judge worker (use when workers run on separate machines)"
      echo "  --with-worker  — Force starting a local judge worker"
      echo "  --skip-worker-build — Skip building the judge-worker image"
      echo "  --build-worker      — Force building the judge-worker image"
      echo "  --dry-run           — Generate nginx config locally without deploying"
      echo ""
      echo "Environment:"
      echo "  INCLUDE_WORKER=false  — Persistently disable the local worker for this target"
      echo "  BUILD_WORKER_IMAGE=false — Persistently skip the judge-worker image build"
      echo ""
      echo "Language presets: core, popular, extended, all, everything, none"
      echo "  core       — C/C++, Python, Java/Kotlin (~1.2 GB)"
      echo "  popular    — Core + Node.js, Rust, Go (~4 GB)"
      echo "  extended   — Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig (~12 GB)"
      echo "  all        — Everything except the ARM-prohibitive set below (~30 GB)"
      echo "  everything — all + mercury/carp/chapel/clean/curry/elm/factor/flix/grain/idris2/"
      echo "                minizinc/modula2/moonbit/pony/purescript/rescript/roc/wat."
      echo "                These 18 have no prebuilt aarch64 binaries; mercury alone runs"
      echo "                13 build grades and pushes a typical aarch64 deploy past 3 hours."
      echo "                Use only when you actually need them — nothing on production"
      echo "                currently submits in these languages."
      echo "  none       — Skip language image builds"
      exit 0
      ;;
  esac
done

if [[ "${BUILD_WORKER_IMAGE}" == "auto" ]]; then
  BUILD_WORKER_IMAGE="${INCLUDE_WORKER}"
fi

# JUDGE_ALLOW_ANY_JUDGE_IP backfill value, by architecture. Integrated hosts
# run the worker over the docker network, so its register/claim requests carry
# no X-Forwarded-For and the IP allowlist can never match — the route must
# accept the token-authenticated worker (1). Separated hosts reach the app
# through nginx with a real client IP and rely on JUDGE_ALLOWED_IPS (0).
if [[ "${INCLUDE_WORKER}" == "true" ]]; then
  JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT=1
else
  JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT=0
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

if [[ "${REMOTE_HOST}" == "algo.xylolabs.com" ]]; then
    if [[ "${SKIP_LANGUAGES}" != "true" || "${BUILD_WORKER_IMAGE}" != "false" || "${INCLUDE_WORKER}" != "false" ]]; then
        die "algo.xylolabs.com is the app server only. Refusing deploy unless SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false (see CLAUDE.md)."
    fi
fi

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR"
if [[ -n "${SSH_KEY:-}" ]]; then
    SSH_KEY="${SSH_KEY/#\~/$HOME}"
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
    rm -f "${NGINX_TMPFILE:-}"
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
    if [[ "${DRY_RUN:-0}" == "1" ]]; then return 0; fi
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        SSHPASS="$SSH_PASSWORD" sshpass -e ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
    else
        ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "$@"
    fi
}

remote_copy() {
    if [[ "${DRY_RUN:-0}" == "1" ]]; then return 0; fi
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        SSHPASS="$SSH_PASSWORD" sshpass -e scp $SSH_OPTS "$@"
    else
        scp $SSH_OPTS "$@"
    fi
}

remote_rsync() {
    if [[ "${DRY_RUN:-0}" == "1" ]]; then return 0; fi
    local protect_args=""
    if rsync --help 2>&1 | grep -q -- '--protect-args'; then
        protect_args="-s"
    fi

    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        if [[ -n "$protect_args" ]]; then
            SSHPASS="$SSH_PASSWORD" rsync "$protect_args" -e "sshpass -e ssh $SSH_OPTS" "$@"
        else
            SSHPASS="$SSH_PASSWORD" rsync -e "sshpass -e ssh $SSH_OPTS" "$@"
        fi
    else
        if [[ -n "$protect_args" ]]; then
            rsync "$protect_args" -e "ssh $SSH_OPTS" "$@"
        else
            rsync -e "ssh $SSH_OPTS" "$@"
        fi
    fi
}

# DB-safe post-deploy cleanup. Removes stopped containers, dangling
# (untagged) images, and BuildKit cache. Volumes are never pruned here:
# detached Docker volumes can contain recoverable PostgreSQL or upload data.
#
# CRITICAL: this MUST NOT use `docker image prune -af`. Judge language
# images (judge-cpp, judge-python, judge-mercury, ...) are tagged but are
# *not* attached to any long-running container — the worker spawns a fresh
# container from them on demand for each submission and tears it down
# afterward. `-af` would therefore see them as "unused" and wipe them all,
# breaking judging across every target (this happened in the May 2026
# rollout of the prune step before this comment landed). `-f` alone keeps
# them: it only prunes images that have no tag, i.e. <none>:<none> layers
# left over from `docker build` rebuilds. Each rebuild of, say,
# judgekit-app:latest re-tags the new image with :latest and leaves the
# old image dangling, so `-f` is enough to keep disk usage bounded across
# repeated deploys.
#
# Honors SKIP_POST_DEPLOY_PRUNE=1 for opt-out (e.g., debugging a deploy
# where you want to inspect the old images before they go away).
#
# Usage:
#   prune_old_docker_artifacts <host_label> <remote-command-runner>
# where <remote-command-runner> is a shell function name that takes a
# command string and runs it on the target host. Defaults to "remote".
prune_old_docker_artifacts() {
    local host_label="${1:-remote}"
    local runner="${2:-remote}"
    if [[ "${SKIP_POST_DEPLOY_PRUNE:-}" == "1" || "${SKIP_POST_DEPLOY_PRUNE:-}" == "true" ]]; then
        info "SKIP_POST_DEPLOY_PRUNE set — leaving stale containers/images/build cache on ${host_label} (manual cleanup may be required to free disk)"
        return 0
    fi
    info "Post-deploy cleanup on ${host_label}: stopped containers older than 24h, dangling images, build cache..."
    "$runner" "docker container prune -f --filter 'until=24h' 2>&1 | tail -1" || true
    # -f (NOT -af): dangling only — preserves judge-* language images that
    # are tagged but not currently attached to any running container.
    "$runner" "docker image prune -f 2>&1 | tail -1" || true
    "$runner" "docker builder prune -af 2>&1 | tail -1" || true
    "$runner" "docker buildx history rm --all 2>&1 | tail -1" || true
    "$runner" "df -h / | tail -1" || true
    success "Cleanup complete on ${host_label}"
}

# BuildKit history-store corruption auto-recovery (RPF cycle 2, closes
# DEFERRED-OPS-1; see AGENTS.md "Deploy hardening" → BuildKit history
# corruption).
#
# CONFIRMED failure mode (auraedu, Docker 29.1.3 / buildx v0.20.0):
#   - Builds abort with `failed to solve: Internal: unknown blob sha256:...
#     in history`. The dangling reference lives in the BuildKit HISTORY
#     store, NOT the build cache: `docker builder prune -af` does NOT clear
#     it; `docker buildx history rm --all` does (metadata-only, zero
#     downtime, leaves every image and cache layer intact).
#   - The corruption is (re-)triggered by one parallel bake solve of ~90
#     language targets on a cold cache (history/GC race) — which is why the
#     all-languages build defaults to the sequential loop below.
#
# run_remote_build <host_label> <remote-runner-fn> <command-string>
# Runs the build via the runner, capturing output. On failure, if the output
# matches the corruption signature, clears the remote history store and
# retries the SAME command exactly once. Any other failure (or a second
# failure after recovery) propagates to the caller. No other signatures
# trigger the recovery — this is a targeted self-heal, not a generic retry.
BUILDKIT_HISTORY_CORRUPTION_REGEX='unknown blob sha256:[a-f0-9]+ in history'
run_remote_build() {
    local host_label="$1"
    local runner="$2"
    local cmd="$3"
    local out_file
    out_file=$(mktemp /tmp/judgekit-build-out.XXXXXX)
    if "$runner" "$cmd" 2>&1 | tee "$out_file"; then
        rm -f "$out_file"
        return 0
    fi
    if grep -qiE "$BUILDKIT_HISTORY_CORRUPTION_REGEX" "$out_file"; then
        warn "BuildKit history-store corruption detected on ${host_label} (signature: 'unknown blob ... in history')."
        warn "Auto-recovery: clearing the BuildKit history store on ${host_label} (docker buildx history rm --all — metadata only, zero downtime) and retrying the build once."
        "$runner" "docker buildx history rm --all 2>&1 | tail -1" \
            || warn "docker buildx history rm --all failed on ${host_label} (buildx too old?) — retrying the build anyway"
        if "$runner" "$cmd" 2>&1 | tee "$out_file"; then
            rm -f "$out_file"
            success "Build succeeded after BuildKit history recovery on ${host_label}"
            return 0
        fi
        rm -f "$out_file"
        error "Build still failing after BuildKit history recovery on ${host_label} — see docs/operator-incident-runbook.md (deploy build failure scenario)"
        return 1
    fi
    rm -f "$out_file"
    return 1
}

DISK_WARN_PCT="${DEPLOY_DISK_WARN_PCT:-85}"
DISK_HARD_PCT="${DEPLOY_DISK_HARD_PCT:-92}"

storage_usage_report() {
    local runner="$1"
    "$runner" "docker_root=\$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true); for p in / \"\$docker_root\" /judge-workspaces; do if [ -n \"\$p\" ] && [ -e \"\$p\" ]; then df -P \"\$p\" | awk -v p=\"\$p\" 'NR==2 {gsub(\"%\", \"\", \$5); print p \":\" \$5}'; fi; done" 2>/dev/null || true
}

safe_docker_storage_cleanup() {
    local host_label="$1"
    local runner="$2"
    info "Safe Docker cleanup on ${host_label}: stopped containers, dangling images, build cache, BuildKit history (no volumes)..."
    "$runner" "docker container prune -f --filter 'until=24h' 2>&1 | tail -1" || true
    "$runner" "docker image prune -f 2>&1 | tail -1" || true
    "$runner" "docker builder prune -af 2>&1 | tail -1" || true
    "$runner" "docker buildx history rm --all 2>&1 | tail -1" || true
}

preflight_docker_storage() {
    local host_label="$1"
    local runner="$2"
    local build_enabled="${3:-true}"
    local report max_pct max_path path pct

    report="$(storage_usage_report "$runner")"
    max_pct=""
    max_path=""
    while IFS=: read -r path pct; do
        [[ -n "$path" && "$pct" =~ ^[0-9]+$ ]] || continue
        if [[ -z "$max_pct" || "$pct" -gt "$max_pct" ]]; then
            max_pct="$pct"
            max_path="$path"
        fi
    done <<< "$report"

    if [[ -z "$max_pct" ]]; then
        warn "Could not determine Docker storage usage on ${host_label}; continuing without disk percentage"
        return 0
    fi

    if [[ "$max_pct" -ge "$DISK_WARN_PCT" ]]; then
        warn "${host_label} storage is ${max_pct}% full at ${max_path} (>= ${DISK_WARN_PCT}%). Reclaiming safe Docker artifacts before building..."
        safe_docker_storage_cleanup "$host_label" "$runner"
        report="$(storage_usage_report "$runner")"
        max_pct=""
        max_path=""
        while IFS=: read -r path pct; do
            [[ -n "$path" && "$pct" =~ ^[0-9]+$ ]] || continue
            if [[ -z "$max_pct" || "$pct" -gt "$max_pct" ]]; then
                max_pct="$pct"
                max_path="$path"
            fi
        done <<< "$report"
        info "${host_label} storage after cleanup: ${max_pct:-unknown}% used at ${max_path:-unknown}"
    fi

    if [[ -n "$max_pct" && "$max_pct" -ge "$DISK_HARD_PCT" && "$build_enabled" == "true" ]]; then
        die "${host_label} storage is still ${max_pct}% full at ${max_path} (>= ${DISK_HARD_PCT}%) after safe cleanup. Refusing to build. Free disk manually, but do NOT prune volumes or user-data."
    fi
    if [[ -n "$max_pct" && "$max_pct" -ge "$DISK_HARD_PCT" && "$build_enabled" != "true" ]]; then
        warn "${host_label} storage is still ${max_pct}% full at ${max_path} (>= ${DISK_HARD_PCT}%), but no build is scheduled."
    fi
    success "Docker storage preflight OK on ${host_label} (${max_pct}% used at ${max_path})"
}

remote_sudo() {
    if [[ "${DRY_RUN:-0}" == "1" ]]; then return 0; fi
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
        printf '%s\n' "$sudo_pw" | SSHPASS="$SSH_PASSWORD" sshpass -e ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo -S -p '' bash -lc ${quoted_cmd}"
    else
        ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "sudo bash -lc ${quoted_cmd}"
    fi
}

# Returns 0 if the given nginx version supports the modern `http2 on;`
# directive (>= 1.25.1), 1 otherwise.
nginx_version_supports_http2_on() {
    local version="$1"
    local major minor patch
    major="$(printf '%s' "$version" | cut -d. -f1)"
    minor="$(printf '%s' "$version" | cut -d. -f2)"
    patch="$(printf '%s' "$version" | cut -d. -f3)"
    # Strip any non-numeric suffix from patch (e.g. "-2ubuntu7.13").
    patch="${patch%%[^0-9]*}"
    [[ "$major" -gt 1 ]] ||
    { [[ "$major" -eq 1 && "$minor" -gt 25 ]]; } ||
    { [[ "$major" -eq 1 && "$minor" -eq 25 && "$patch" -ge 1 ]]; }
}

# Detect the remote nginx version and choose the HTTP/2 syntax it supports.
# nginx 1.25.1+ accepts the modern `http2 on;` directive inside a server
# block; older versions require `listen ... ssl http2`. Emits "modern" or
# "legacy" so the generated config is loadable on the target host.
detect_nginx_http2_mode() {
    local nginx_version_line
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
        # Dry-run has no remote host; prefer locally installed nginx, otherwise
        # default to the modern syntax so the generated config can be inspected.
        if command -v nginx >/dev/null 2>&1; then
            nginx_version_line="$(nginx -v 2>&1 | head -n1 || true)"
        else
            echo "modern"
            return
        fi
    else
        nginx_version_line="$(remote "nginx -v 2>&1" | head -n1 || true)"
    fi
    local nginx_version
    nginx_version="$(printf '%s\n' "$nginx_version_line" | sed -n 's/.*nginx\/\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')"

    if [[ -z "$nginx_version" ]]; then
        warn "Could not detect remote nginx version; falling back to legacy listen ... http2 syntax"
        echo "legacy"
        return
    fi

    if nginx_version_supports_http2_on "$nginx_version"; then
        echo "modern"
    else
        echo "legacy"
    fi
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "Pre-flight checks..."

command -v rsync >/dev/null 2>&1 || die "rsync is not installed locally"

if [[ "${DRY_RUN}" == "1" ]]; then
    info "Dry-run mode: skipping remote SSH, docker, and storage pre-flight checks"
    # Provide sensible defaults so the nginx generation path can run locally.
    PLATFORM="linux/amd64"
else
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        command -v sshpass >/dev/null 2>&1 || die "sshpass is required when SSH_PASSWORD is set"
    fi

    if [[ -n "${SSH_KEY:-}" && ! -f "${SSH_KEY}" ]]; then
        die "SSH key not found: ${SSH_KEY}"
    fi

    # Test SSH connectivity
    _initial_ssh_check || die "Cannot SSH to ${REMOTE_USER}@${REMOTE_HOST}"
    success "SSH connection to ${REMOTE_HOST} verified"

    # Verify docker is available on the remote host
    remote "docker info >/dev/null 2>&1" || die "docker is not available on the remote host"
    success "Remote docker verified"

    # Pre-build Docker storage guard.
    # A full image build needs several GB. If Docker's data root or the shared
    # workspace mount is already near-full, builds die mid-layer and leave more
    # cache behind. Reclaim safe artifacts first (never volumes), then abort before
    # starting a doomed build when a build is scheduled.
    if [[ "$SKIP_BUILD" == false ]]; then
        preflight_docker_storage "app ${REMOTE_HOST}" remote true
    else
        preflight_docker_storage "app ${REMOTE_HOST}" remote false
    fi

    # Detect remote architecture
    REMOTE_ARCH=$(remote "uname -m")
    case "$REMOTE_ARCH" in
        x86_64)  PLATFORM="linux/amd64" ;;
        aarch64) PLATFORM="linux/arm64" ;;
        *)       PLATFORM="linux/amd64" ; warn "Unknown arch '${REMOTE_ARCH}', defaulting to linux/amd64" ;;
    esac
    info "Detected remote architecture: ${REMOTE_ARCH} → ${PLATFORM}"
fi

# ---------------------------------------------------------------------------
# Step 1: Generate .env.production if it does not exist
# ---------------------------------------------------------------------------
if [[ "${DRY_RUN}" == "1" ]]; then
    # Backfill helpers touch the remote host; stub them for dry-run so the
    # post-backfill production assertions (AUTH_TRUST_HOST, COMPILER_RUNNER_URL)
    # can still be evaluated without failing on undefined functions.
    ensure_env_secret() { :; }
    ensure_env_literal() { :; }
    upsert_env_literal() { :; }
    info "Dry-run mode: skipping local .env.production generation and remote backfill"
else
if [[ ! -f "${SCRIPT_DIR}/.env.production" ]]; then
    info "Generating .env.production with fresh secrets..."
    AUTH_SECRET=$(openssl rand -base64 32)
    JUDGE_AUTH_TOKEN=$(openssl rand -hex 32)
    RUNNER_AUTH_TOKEN=$(openssl rand -hex 32)
    PLUGIN_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
    NODE_ENCRYPTION_KEY=$(openssl rand -hex 32)
    CRON_SECRET=$(openssl rand -hex 32)
    CODE_SIMILARITY_AUTH_TOKEN=$(openssl rand -hex 32)
    RATE_LIMITER_AUTH_TOKEN=$(openssl rand -hex 32)
    AUTH_URL_VALUE="${AUTH_URL_OVERRIDE:-https://${DOMAIN}}"
    cat > "${SCRIPT_DIR}/.env.production" <<EOF
# Auto-generated by deploy-docker.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=${AUTH_URL_VALUE}
AUTH_TRUST_HOST=true
TRUST_HOST_OVERRIDE=1
DB_DIALECT=postgresql
DATABASE_URL=postgres://judgekit:\${POSTGRES_PASSWORD}@db:5432/judgekit
POSTGRES_PASSWORD=$(openssl rand -hex 32)
PLUGIN_CONFIG_ENCRYPTION_KEY=${PLUGIN_CONFIG_ENCRYPTION_KEY}
NODE_ENCRYPTION_KEY=${NODE_ENCRYPTION_KEY}
JUDGE_AUTH_TOKEN=${JUDGE_AUTH_TOKEN}
RUNNER_AUTH_TOKEN=${RUNNER_AUTH_TOKEN}
CRON_SECRET=${CRON_SECRET}
CODE_SIMILARITY_AUTH_TOKEN=${CODE_SIMILARITY_AUTH_TOKEN}
RATE_LIMITER_AUTH_TOKEN=${RATE_LIMITER_AUTH_TOKEN}
JUDGE_CONCURRENCY=2
POLL_INTERVAL=500
JUDGE_DISABLE_CUSTOM_SECCOMP=0
# Judge API network-layer isolation. In production judge routes fail closed
# unless JUDGE_ALLOWED_IPS is set or JUDGE_ALLOW_ANY_JUDGE_IP=1.
JUDGE_ALLOWED_IPS=
JUDGE_ALLOW_ANY_JUDGE_IP=${JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT}
# Number of trusted reverse proxies in front of the app. The production nginx
# edge is one hop, so the default is 1. This value is required in production;
# the app refuses to start if it is unset.
TRUSTED_PROXY_HOPS=1
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
# like AUTH_TRUST_HOST=false or COMPILER_RUNNER_URL=<url>.
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

upsert_env_literal() {
  local key="$1"
  local literal_value="$2"
  if ! remote "test -f ${REMOTE_ENV_FILE}"; then
    return 0
  fi
  local q_key q_value q_file
  printf -v q_key '%q' "$key"
  printf -v q_value '%q' "$literal_value"
  printf -v q_file '%q' "$REMOTE_ENV_FILE"
  info "Ensuring ${key}=${literal_value} in ${REMOTE_ENV_FILE}"
  remote "KEY=${q_key} VALUE=${q_value} ENV_FILE=${q_file} python3 - <<'PY'
from pathlib import Path
import os

key = os.environ['KEY']
value = os.environ['VALUE']
path = Path(os.environ['ENV_FILE'])
line = f'{key}={value}'
lines = path.read_text().splitlines()
for i, existing in enumerate(lines):
    if existing.startswith(f'{key}='):
        lines[i] = line
        break
else:
    lines.append(line)
path.write_text('\n'.join(lines) + '\n')
PY
chmod 600 ${REMOTE_ENV_FILE}" \
    || warn "Failed to upsert ${key} — please update it manually before the app starts"
}

# Warn when judge API routes would deny all requests in production because
# neither an allowlist nor the explicit allow-any override is configured.
warn_judge_ip_allowlist() {
    local env_file="$1"
    if [[ ! -f "${env_file}" ]]; then
        return 0
    fi
    local allowed_ips allow_any
    allowed_ips=$(grep '^JUDGE_ALLOWED_IPS=' "${env_file}" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
    allow_any=$(grep '^JUDGE_ALLOW_ANY_JUDGE_IP=' "${env_file}" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
    if [[ -z "${allowed_ips}" && "${allow_any}" != "1" ]]; then
        warn "JUDGE_ALLOWED_IPS is not configured and JUDGE_ALLOW_ANY_JUDGE_IP is not 1. Judge API routes will deny all requests in production. Set JUDGE_ALLOWED_IPS to the worker IP/CIDR, or set JUDGE_ALLOW_ANY_JUDGE_IP=1 only if network isolation is handled elsewhere."
    fi
}

warn_judge_ip_allowlist "${SCRIPT_DIR}/.env.production"

ensure_env_secret PLUGIN_CONFIG_ENCRYPTION_KEY hex
ensure_env_secret NODE_ENCRYPTION_KEY hex
ensure_env_secret RUNNER_AUTH_TOKEN hex
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
# AUTH_TRUST_HOST must be true in production: current Auth.js rejects requests
# with UntrustedHost (breaking /api/auth/session and login) unless the host is
# trusted, even when AUTH_URL is set. The generated nginx below overwrites
# X-Forwarded-Host with the canonical $host on every route, so trusting the
# forwarded host is safe; TRUST_HOST_OVERRIDE=1 is the app's required explicit
# acknowledgement of that (see shouldTrustAuthHost + the startup guard).
ensure_env_literal AUTH_TRUST_HOST true
ensure_env_literal TRUST_HOST_OVERRIDE 1
# TRUSTED_PROXY_HOPS is required in production; backfill the standard one-hop
# default for deployments that predate the startup assertion.
ensure_env_literal TRUSTED_PROXY_HOPS 1
# JUDGE_ALLOW_ANY_JUDGE_IP: 1 for integrated hosts (docker-network worker with
# no X-Forwarded-For), 0 for separated hosts (real client IP + JUDGE_ALLOWED_IPS).
ensure_env_literal JUDGE_ALLOW_ANY_JUDGE_IP "${JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT}"
fi

# In dry-run mode we never probe the remote host for TLS certs; default to
# HTTP so the nginx generation path can proceed without side effects.
if [[ "${DRY_RUN}" == "1" ]]; then
    USE_TLS=false
fi

if [[ "${DRY_RUN}" != "1" ]]; then
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
    --exclude='target/' \
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

# After .env.production is guaranteed to exist, backfill target-specific overrides
# that may not be present in the repo's .env.production template.
if [[ "${INCLUDE_WORKER}" != "true" ]]; then
    COMPILER_RUNNER_DEFAULT="${COMPILER_RUNNER_URL:-http://host.docker.internal:3001}"
    if [[ -n "${COMPILER_RUNNER_URL:-}" ]]; then
        upsert_env_literal COMPILER_RUNNER_URL "${COMPILER_RUNNER_DEFAULT}"
    else
        ensure_env_literal COMPILER_RUNNER_URL "${COMPILER_RUNNER_DEFAULT}"
    fi
fi
upsert_env_literal AUTH_TRUST_HOST true
upsert_env_literal TRUST_HOST_OVERRIDE 1
upsert_env_literal TRUSTED_PROXY_HOPS 1
upsert_env_literal JUDGE_ALLOW_ANY_JUDGE_IP "${JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT}"

# Warn if the remote production config leaves judge routes fail-closed.
if remote "test -f ${REMOTE_DIR}/.env.production" 2>/dev/null; then
    REMOTE_JUDGE_ALLOWED_IPS=$(remote "grep '^JUDGE_ALLOWED_IPS=' ${REMOTE_DIR}/.env.production 2>/dev/null | cut -d= -f2- | tr -d '[:space:]'" 2>/dev/null || true)
    REMOTE_JUDGE_ALLOW_ANY=$(remote "grep '^JUDGE_ALLOW_ANY_JUDGE_IP=' ${REMOTE_DIR}/.env.production 2>/dev/null | cut -d= -f2- | tr -d '[:space:]'" 2>/dev/null || true)
    if [[ -z "${REMOTE_JUDGE_ALLOWED_IPS}" && "${REMOTE_JUDGE_ALLOW_ANY}" != "1" ]]; then
        warn "JUDGE_ALLOWED_IPS is not configured and JUDGE_ALLOW_ANY_JUDGE_IP is not 1. Judge API routes will deny all requests in production. Set JUDGE_ALLOWED_IPS to the worker IP/CIDR, or set JUDGE_ALLOW_ANY_JUDGE_IP=1 only if network isolation is handled elsewhere."
    fi
fi

# Compute AUTH_URL before the app starts so first boot uses the target domain.
if [[ "${DRY_RUN}" == "1" ]]; then
    USE_TLS=false
    AUTH_URL_TARGET="${AUTH_URL_OVERRIDE:-http://${DOMAIN}}"
    info "Dry-run mode: using HTTP AUTH_URL target ${AUTH_URL_TARGET}"
else
    USE_TLS=false
    if remote_sudo "test -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem -a -f /etc/letsencrypt/live/${DOMAIN}/privkey.pem" 2>/dev/null; then
        USE_TLS=true
        info "Detected existing TLS certificate for ${DOMAIN}; AUTH_URL will use HTTPS"
    else
        info "No TLS certificate detected for ${DOMAIN}; AUTH_URL will use HTTP until TLS is provisioned"
    fi
    AUTH_URL_TARGET="${AUTH_URL_OVERRIDE:-$([ "${USE_TLS}" = "true" ] && echo "https://${DOMAIN}" || echo "http://${DOMAIN}")}"
    upsert_env_literal AUTH_URL "${AUTH_URL_TARGET}"
fi

WORKER_JUDGE_BASE_URL=""
if [[ -n "${WORKER_HOSTS:-}" ]]; then
    WORKER_JUDGE_BASE_URL="${AUTH_URL_TARGET%/}/api/v1"
    if [[ "${WORKER_JUDGE_BASE_URL}" == http://* ]]; then
        case "${WORKER_JUDGE_BASE_URL}" in
            http://localhost/*|http://localhost:*|http://127.0.0.1/*|http://127.0.0.1:*|http://app/*|http://app:*) ;;
            *)
                die "Dedicated worker JUDGE_BASE_URL would use non-local HTTP (${WORKER_JUDGE_BASE_URL}). Provision TLS for ${DOMAIN} or set AUTH_URL_OVERRIDE=https://...; do not use JUDGE_ALLOW_INSECURE_HTTP on production workers."
                ;;
        esac
    fi
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
    run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} ${EXTRA_BUILD_ARGS} -t judgekit-app:latest -f Dockerfile ." \
        || die "App image build failed"
    success "App image built on remote"

    if [[ "${BUILD_WORKER_IMAGE}" == "true" ]]; then
        info "Building judge worker image on ${REMOTE_HOST} (judgekit-judge-worker:latest) [${PLATFORM}]..."
        run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && docker build --no-cache --platform ${PLATFORM} -t judgekit-judge-worker:latest -f Dockerfile.judge-worker ." \
            || die "Judge worker image build failed"
        success "Judge worker image built on remote"
    else
        info "Skipping judge worker image build (BUILD_WORKER_IMAGE=${BUILD_WORKER_IMAGE}, INCLUDE_WORKER=${INCLUDE_WORKER})"
    fi

    info "Building code-similarity image on ${REMOTE_HOST} (judgekit-code-similarity:latest) [${PLATFORM}]..."
    run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-code-similarity:latest -f Dockerfile.code-similarity ." \
        || die "Code similarity image build failed"
    success "Code similarity image built on remote"

    info "Building rate-limiter image on ${REMOTE_HOST} (judgekit-rate-limiter:latest) [${PLATFORM}]..."
    run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judgekit-rate-limiter:latest -f Dockerfile.rate-limiter-rs ." \
        || die "Rate limiter image build failed"
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
                    run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judge-${lang} -f docker/Dockerfile.judge-${lang} ." \
                        || die "Failed to build judge-${lang}"
                done
                success "Selected judge language images built on remote"
            fi
        elif [[ "${LANGUAGE_BUILD_STRATEGY:-sequential}" == "compose" ]]; then
            # Opt-in parallel bake with capped concurrency. The UNCAPPED bake
            # of ~90 targets corrupted the BuildKit history store twice
            # (DEFERRED-OPS-1); the cap reduces the history/GC race window
            # and run_remote_build self-heals if it still fires.
            info "Building all judge language images via compose (COMPOSE_PARALLEL_LIMIT=${COMPOSE_PARALLEL_LIMIT:-4}) on ${REMOTE_HOST} [${PLATFORM}]..."
            run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && (COMPOSE_PARALLEL_LIMIT=${COMPOSE_PARALLEL_LIMIT:-4} DOCKER_DEFAULT_PLATFORM=${PLATFORM} docker compose -f docker-compose.yml build || \
                COMPOSE_PARALLEL_LIMIT=${COMPOSE_PARALLEL_LIMIT:-4} DOCKER_DEFAULT_PLATFORM=${PLATFORM} docker-compose -f docker-compose.yml build)" \
                || die "Language image compose build failed"
            success "Judge language images built on remote"
        else
            # Default all-languages strategy: SEQUENTIAL per-language builds.
            # This is the empirically clean path that completed the auraedu +
            # algo deploys at 4cf01035 after the parallel bake corrupted the
            # history store twice (see header docs + AGENTS.md).
            LANGS_TO_BUILD=$(resolve_languages all)
            LANG_COUNT=$(echo $LANGS_TO_BUILD | wc -w | tr -d ' ')
            info "Building all ${LANG_COUNT} judge language images sequentially on ${REMOTE_HOST} [${PLATFORM}] (LANGUAGE_BUILD_STRATEGY=sequential)..."
            for lang in $LANGS_TO_BUILD; do
                info "  Building judge-${lang}..."
                run_remote_build "app ${REMOTE_HOST}" remote "cd ${REMOTE_DIR} && docker build --platform ${PLATFORM} -t judge-${lang} -f docker/Dockerfile.judge-${lang} ." \
                    || die "Failed to build judge-${lang}"
            done
            success "Judge language images built on remote"
        fi
    fi
else
    info "Skipping image build (--skip-build)"
fi

# Dangling images from the build step are cleaned up after compose up by
# prune_old_docker_artifacts (Step 6d) so we can also reclaim images the
# old containers were keeping alive. Nothing to do here.

# ---------------------------------------------------------------------------
# Step 4: Set up docker-compose config on remote
# ---------------------------------------------------------------------------
info "Setting up docker-compose config on remote..."
remote "cp -f ${REMOTE_DIR}/docker-compose.production.yml ${REMOTE_DIR}/docker-compose.yml.deploy 2>/dev/null || true"
COMPOSE_DEPLOY_FILES="-f docker-compose.production.yml"
if [[ "${INCLUDE_WORKER}" != "true" ]]; then
    info "Generating app-only compose override (INCLUDE_WORKER=${INCLUDE_WORKER})..."
    remote "cat > ${REMOTE_DIR}/docker-compose.app-only.yml <<'COMPOSE_APP_ONLY_YAML'
services:
  docker-proxy:
    profiles: ['local-worker']
  judge-worker:
    profiles: ['local-worker']
COMPOSE_APP_ONLY_YAML"
    COMPOSE_DEPLOY_FILES="-f docker-compose.production.yml -f docker-compose.app-only.yml"
else
    remote "rm -f ${REMOTE_DIR}/docker-compose.app-only.yml 2>/dev/null || true"
fi
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
        export PGPASSWORD=\"\${PG_PASS}\" && docker exec -e PGPASSWORD judgekit-db pg_dump -U judgekit -d judgekit --format=custom --compress=9 -f /tmp/${BACKUP_NAME} && \
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
# The base production compose keeps `judge-worker` unprofiled so integrated
# targets and manual recovery commands start it by default. App-only targets
# use the generated docker-compose.app-only.yml override above, which moves
# judge-worker and docker-proxy into an inactive `local-worker` profile before
# the deploy `up -d` runs.
# ---------------------------------------------------------------------------
info "Stopping existing containers (if any)..."
remote "cd ${REMOTE_DIR} && cp -f .env.production .env && (docker compose ${COMPOSE_DEPLOY_FILES} down --remove-orphans || docker-compose ${COMPOSE_DEPLOY_FILES} down --remove-orphans || true)"

if [[ "${INCLUDE_WORKER}" != "true" ]]; then
    remote "docker rm -f judgekit-judge-worker judgekit-docker-proxy 2>/dev/null || true"
fi

# 5a. Start only the database container
info "Starting database container..."
remote "cd ${REMOTE_DIR} && (docker compose ${COMPOSE_DEPLOY_FILES} --env-file .env.production up -d db || docker-compose ${COMPOSE_DEPLOY_FILES} --env-file .env.production up -d db)"

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
#
# Safety guard (B5): The raw SQL backfill/drop is gated by
# ALLOW_SECRET_TOKEN_BACKFILL=1. By default the block is skipped and a
# warning is emitted if the deprecated column is still present, preventing
# accidental destructive changes during routine deploys.
# ---------------------------------------------------------------------------
: "${ALLOW_SECRET_TOKEN_BACKFILL:=}"
NETWORK_NAME="${NETWORK_NAME:-judgekit_db}"
if [[ "${ALLOW_SECRET_TOKEN_BACKFILL}" == "1" ]]; then
    info "Running pre-drop secret_token backfill (idempotent)..."

    # Determine the Docker network name for the segmented DB network (compose
    # project name + _db). The migration and ANALYZE containers must attach to the
    # same network as the running judgekit-db container.
    NETWORK_NAME=$(remote "docker network ls --format '{{.Name}}' | grep -E '^judgekit_db$' | head -1" 2>/dev/null)
    NETWORK_NAME="${NETWORK_NAME:-judgekit_db}"

    # Run the backfill + drop directly inside the running judgekit-db container
    # (same pattern as the pre-deploy backup step) rather than via a throwaway
    # `postgres:*` container on ${NETWORK_NAME}. Hardening (2026-06, after the drop
    # silently failed on oj.auraedu.me and let drizzle-kit push abort on the
    # destructive secret_token diff):
    #   - `docker exec judgekit-db` avoids Docker-network/host-resolution ambiguity
    #     and the fragile nested-heredoc dollar-quoting that mangled the SQL.
    #   - The backfill UPDATE is guarded by a plain column-existence check instead
    #     of a DO/EXECUTE block (the UPDATE references secret_token, which only
    #     exists pre-drop), so the statements stay single-line and quote-safe.
    #   - `-v ON_ERROR_STOP=1` + no output suppression: a failed statement now
    #     aborts the deploy loudly instead of exiting 0 with the error hidden.
    #   - A post-drop verification re-reads the column and dies if it is still
    #     present — the real safety net against a silent no-op.
    HAS_SECRET_TOKEN=$(remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
        export PGPASSWORD=\"\${PG_PASS}\" && docker exec -e PGPASSWORD judgekit-db \
        psql -U judgekit -d judgekit -tAc \"SELECT count(*) FROM information_schema.columns WHERE table_name='judge_workers' AND column_name='secret_token'\"" 2>/dev/null | tr -d '[:space:]')

    if [[ "${HAS_SECRET_TOKEN}" == "1" ]]; then
        info "judge_workers.secret_token present — backfilling hash and dropping the deprecated column..."
        remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
            export PGPASSWORD=\"\${PG_PASS}\" && docker exec -e PGPASSWORD judgekit-db \
            psql -v ON_ERROR_STOP=1 -U judgekit -d judgekit \
            -c \"UPDATE judge_workers SET secret_token_hash = encode(sha256(secret_token::bytea), 'hex') WHERE secret_token_hash IS NULL AND secret_token IS NOT NULL\" \
            -c \"ALTER TABLE judge_workers DROP COLUMN IF EXISTS secret_token\"" \
            || die "secret_token backfill/drop failed — aborting deploy (review the psql error above)"
    else
        info "judge_workers.secret_token already absent — nothing to backfill or drop"
    fi

    # Verify the column is actually gone before drizzle-kit push runs. A silent
    # failure here would let push detect the destructive diff and abort the whole
    # migration (the original failure mode on oj.auraedu.me).
    REMAINING_SECRET_TOKEN=$(remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
        export PGPASSWORD=\"\${PG_PASS}\" && docker exec -e PGPASSWORD judgekit-db \
        psql -U judgekit -d judgekit -tAc \"SELECT count(*) FROM information_schema.columns WHERE table_name='judge_workers' AND column_name='secret_token'\"" 2>/dev/null | tr -d '[:space:]')
    if [[ "${REMAINING_SECRET_TOKEN}" != "0" ]]; then
        die "secret_token column still present after drop (count=${REMAINING_SECRET_TOKEN:-unknown}) — drizzle-kit push would abort on the destructive diff. Investigate manually before retrying."
    fi
    success "secret_token backfill + idempotent column drop complete (column verified absent)"
else
    warn "Skipping secret_token backfill/drop block because ALLOW_SECRET_TOKEN_BACKFILL is not set to 1."

    HAS_SECRET_TOKEN=$(remote "PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-) && \
        export PGPASSWORD=\"\${PG_PASS}\" && docker exec -e PGPASSWORD judgekit-db \
        psql -U judgekit -d judgekit -tAc \"SELECT count(*) FROM information_schema.columns WHERE table_name='judge_workers' AND column_name='secret_token'\"" 2>/dev/null | tr -d '[:space:]')

    if [[ "${HAS_SECRET_TOKEN}" == "1" ]]; then
        warn "judge_workers.secret_token column is still present but ALLOW_SECRET_TOKEN_BACKFILL is not set. The secret_token backfill/drop block was skipped. Set ALLOW_SECRET_TOKEN_BACKFILL=1 to run it, or remove the column manually. If left in place, drizzle-kit push may abort on the destructive diff."
    fi
fi

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
# markers; when detected, it aborts before new app code is started.
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
  die "drizzle-kit push detected a destructive schema change but did NOT apply it (interactive prompt unanswered or declined). Review the diff above, then re-run with DRIZZLE_PUSH_FORCE=1 to apply, or use the journal-driven migrate strategy. See AGENTS.md \"Database migration recovery (DRIZZLE_PUSH_FORCE)\" section for details."
else
  success "Database migrated"
fi

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
if [[ "${INCLUDE_WORKER}" == "true" ]]; then
    info "Starting all containers (with local judge worker)..."
else
    info "Starting app containers (local judge worker excluded by compose override)..."
fi
remote "cd ${REMOTE_DIR} && (docker compose ${COMPOSE_DEPLOY_FILES} --env-file .env.production up -d || docker-compose ${COMPOSE_DEPLOY_FILES} --env-file .env.production up -d)"

info "Waiting for app container to be healthy..."
for i in $(seq 1 60); do
    if remote "docker inspect --format='{{.State.Health.Status}}' judgekit-app 2>/dev/null" | grep -q "healthy"; then
        break
    fi
    if [[ $i -eq 60 ]]; then
        die "App container did not become healthy in 60s — check logs"
    fi
    sleep 1
done
success "All containers started"

# ---------------------------------------------------------------------------
# Step 6c: Sync code to dedicated worker hosts (if configured) and rebuild
# their judge-worker image. Without this step a deploy that outsources
# judging (INCLUDE_WORKER=false) leaves the worker host running stale
# code — the 14h compile_error sweep was prolonged by exactly that
# (workers shipped the bug-fixed runner image but the host wasn't
# touched on subsequent deploys). Set WORKER_HOSTS in the deploy env
# to a comma-separated list of "host" or "host:ssh_key_path:platform"
# entries. Platform defaults to linux/amd64.
# ---------------------------------------------------------------------------
if [[ -n "${WORKER_HOSTS:-}" ]]; then
    info "Syncing source + rebuilding judge worker on dedicated worker host(s): ${WORKER_HOSTS}"
    IFS=',' read -ra _WORKER_ENTRIES <<< "${WORKER_HOSTS}"
    for entry in "${_WORKER_ENTRIES[@]}"; do
        entry="$(echo "$entry" | xargs)"
        [[ -z "$entry" ]] && continue
        IFS=':' read -r WHOST WKEY WPLATFORM <<< "$entry"
        WKEY="${WKEY:-${SSH_KEY}}"
        WKEY="${WKEY/#\~/$HOME}"
        WPLATFORM="${WPLATFORM:-linux/amd64}"
        WUSER="${WORKER_SSH_USER:-${REMOTE_USER}}"
        info "→ ${WHOST} (key=${WKEY}, platform=${WPLATFORM})"
        _worker_ssh() {
            ssh -i "${WKEY}" ${SSH_OPTS} "${WUSER}@${WHOST}" "$@"
        }
        _worker_upsert_env_literal() {
            local key="$1"
            local literal_value="$2"
            local worker_env_file="/home/${WUSER}/judgekit/.env"
            local q_key q_value q_file
            printf -v q_key '%q' "$key"
            printf -v q_value '%q' "$literal_value"
            printf -v q_file '%q' "$worker_env_file"
            _worker_ssh "mkdir -p /home/${WUSER}/judgekit && touch ${q_file} && chmod 600 ${q_file} && KEY=${q_key} VALUE=${q_value} ENV_FILE=${q_file} python3 - <<'PY'
from pathlib import Path
import os

key = os.environ['KEY']
value = os.environ['VALUE']
path = Path(os.environ['ENV_FILE'])
line = f'{key}={value}'
lines = path.read_text().splitlines() if path.exists() else []
for i, existing in enumerate(lines):
    if existing.startswith(f'{key}='):
        lines[i] = line
        break
else:
    lines.append(line)
path.write_text('\n'.join(lines) + '\n')
PY
chmod 600 ${q_file}"
        }
        if [[ "$SKIP_BUILD" == false ]]; then
            preflight_docker_storage "worker ${WHOST}" _worker_ssh true
        else
            preflight_docker_storage "worker ${WHOST}" _worker_ssh false
            warn "SKIP_BUILD=true — skipping worker source sync, image build, and restart on ${WHOST}"
            continue
        fi
        info "  rsync source"
        rsync -az --delete \
            --exclude='node_modules/' \
            --exclude='.next/' \
            --exclude='.git/' \
            --exclude='data/' \
            --exclude='.env*' \
            --exclude='*.db' \
            --exclude='target/' \
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
            -e "ssh -i ${WKEY} ${SSH_OPTS}" \
            "${SCRIPT_DIR}/" \
            "${WUSER}@${WHOST}:/home/${WUSER}/judgekit/" \
            || die "Failed to rsync source to worker host ${WHOST}"
        info "  build judge-worker image (no-cache)"
        # Ad-hoc runner bound to this worker's key so run_remote_build's
        # BuildKit history auto-recovery applies on worker hosts too (the
        # same corruption class can fire wherever images are built).
        run_remote_build "worker ${WHOST}" _worker_ssh \
            "cd /home/${WUSER}/judgekit && docker build --no-cache --platform ${WPLATFORM} -t judgekit-judge-worker:latest -f Dockerfile.judge-worker ." \
            || die "Failed to build judge-worker image on ${WHOST}"
        info "  ensure JUDGE_BASE_URL=${WORKER_JUDGE_BASE_URL}"
        _worker_upsert_env_literal JUDGE_BASE_URL "${WORKER_JUDGE_BASE_URL}" \
            || die "Failed to upsert JUDGE_BASE_URL in worker env on ${WHOST}"
        info "  restart worker compose"
        ssh -i "${WKEY}" ${SSH_OPTS} "${WUSER}@${WHOST}" \
            "cd /home/${WUSER}/judgekit && docker compose -f docker-compose.worker.yml --env-file .env up -d" \
            || die "Failed to restart worker compose on ${WHOST}"
        # The worker's startup config, registration, and docker-capability
        # probes all happen before the runner health endpoint is useful. Poll
        # the Docker health status instead of a fixed sleep so registration /
        # HTTPS / token errors are caught with their real logs.
        WORKER_READY=0
        for _ in $(seq 1 60); do
            if _worker_ssh "status=\$(docker inspect --format='{{.State.Status}}' judgekit-judge-worker 2>/dev/null || true); health=\$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}healthy{{end}}' judgekit-judge-worker 2>/dev/null || true); [ \"\$status\" = running ] && [ \"\$health\" = healthy ]"; then
                WORKER_READY=1
                break
            fi
            sleep 1
        done
        if [[ "${WORKER_READY}" == "1" ]]; then
            success "  worker on ${WHOST} is up"
            # Reclaim disk on the worker host after the successful rebuild.
            # The WORKER_HOSTS step rebuilds judge-worker:latest; language
            # images are rebuilt through the dedicated recovery script or a
            # future worker-language rollout policy.
            prune_old_docker_artifacts "worker ${WHOST}" _worker_ssh
        else
            warn "  worker on ${WHOST} did not become healthy after restart; last sanitized logs follow"
            _worker_ssh "docker logs --tail 80 judgekit-judge-worker 2>&1 | sed -E 's/(Bearer )[A-Za-z0-9._~+\/-]+/\1<redacted>/g; s/(workerSecret[^A-Za-z0-9._~+\/-]*).*/\1<redacted>/g; s/(JUDGE_AUTH_TOKEN=).*/\1<redacted>/g; s/(RUNNER_AUTH_TOKEN=).*/\1<redacted>/g'" || true
            die "worker on ${WHOST} is not healthy after restart — inspect the sanitized logs above"
        fi
    done
fi

# ---------------------------------------------------------------------------
# Step 6d: Post-deploy Docker artifact cleanup (DEFAULT — disable with
# SKIP_POST_DEPLOY_PRUNE=1). Removes stopped containers, dangling images,
# BuildKit cache, and BuildKit history metadata on the app host. Volumes are
# never pruned. Every judge-image rebuild leaves the prior tag dangling —
# without periodic pruning the disk fills up and the next deploy thrashes
# (the auraedu deploy misfired exactly this way before this step existed).
# ---------------------------------------------------------------------------
prune_old_docker_artifacts "app ${REMOTE_HOST}" remote
fi

# ---------------------------------------------------------------------------
# Step 7: Set up nginx reverse proxy
# ---------------------------------------------------------------------------
info "Configuring nginx reverse proxy for ${DOMAIN}..."
if [[ "${USE_TLS}" == "true" ]]; then
    info "Detected existing TLS certificate for ${DOMAIN}; generating HTTPS nginx config"
else
    info "No TLS certificate detected for ${DOMAIN}; generating HTTP-only nginx config"
fi

# Write nginx config to a unique temp path first (avoids heredoc + sudo + tee issues
# and prevents parallel deploys from clobbering the same /tmp file).
NGINX_TMPFILE="$(mktemp /tmp/judgekit-nginx.XXXXXX.conf)"
NGINX_HTTP2_MODE="$(detect_nginx_http2_mode)"
info "Remote nginx HTTP/2 syntax mode: ${NGINX_HTTP2_MODE}"

if [[ "${USE_TLS}" == "true" ]]; then
cat > "$NGINX_TMPFILE" <<NGINX_EOF
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
NGINX_EOF

if [[ "${NGINX_HTTP2_MODE}" == "modern" ]]; then
cat >> "$NGINX_TMPFILE" <<NGINX_EOF
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
NGINX_EOF
else
cat >> "$NGINX_TMPFILE" <<NGINX_EOF
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
NGINX_EOF
fi

cat >> "$NGINX_TMPFILE" <<NGINX_EOF
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers (defense-in-depth alongside app-level headers)
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self';" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location /api/auth/ {
        limit_req zone=judgekit_login burst=10 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
else
cat > "$NGINX_TMPFILE" <<NGINX_EOF
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

    # Security headers (defense-in-depth alongside app-level headers)
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self';" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location /api/auth/ {
        limit_req zone=judgekit_login burst=10 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location /api/v1/judge/ {
        limit_req zone=judgekit_judge burst=20 nodelay;
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
    }

    location / {
        client_max_body_size 50M;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # NOTE: Do NOT set X-Forwarded-Host — it breaks Next.js 16 RSC client-side navigation
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF
fi

# Transfer nginx config via scp, then sudo copy into place
if [[ "${DRY_RUN}" == "1" ]]; then
    success "Dry-run nginx config generated: ${NGINX_TMPFILE}"
    info "Dry-run mode: skipping remote copy, nginx -t, and reload"
    exit 0
fi
remote_copy "$NGINX_TMPFILE" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/nginx-judgekit.conf"
remote_sudo "cp ${REMOTE_DIR}/nginx-judgekit.conf /etc/nginx/sites-available/judgekit"
remote_sudo "ln -sf /etc/nginx/sites-available/judgekit /etc/nginx/sites-enabled/judgekit"
rm -f "$NGINX_TMPFILE"

# Test and reload nginx
if remote_sudo "nginx -t 2>&1"; then
    remote_sudo "systemctl reload nginx"
    success "Nginx configured and reloaded for ${DOMAIN}"
else
    die "Nginx config test failed — check manually on the remote host"
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
    die "App returned HTTP ${HTTP_CODE}. Check logs: ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose ${COMPOSE_DEPLOY_FILES} logs -f'"
fi

if [[ "${USE_TLS}" == "true" ]]; then
    HTTPS_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/login" || true)
    if [[ "${HTTPS_CODE}" =~ ^(200|302|308)$ ]]; then
        success "HTTPS endpoint verified (HTTP ${HTTPS_CODE})"
    else
        die "HTTPS endpoint returned HTTP ${HTTPS_CODE} — check TLS/nginx configuration"
    fi
fi

# ---------------------------------------------------------------------------
# Step 8b: Post-deploy smoke (Playwright remote-safe profile)
# ---------------------------------------------------------------------------
# This block is what would have caught the 2026-05-16 14-hour silent
# `compile_error` sweep. A single curl on the landing page returns 200
# even when every page beyond / 500s, so we run the dedicated smoke
# profile (Playwright remoteSafeSpecs in playwright.config.ts) against
# the deployed URL.
#
# Skip with SKIP_POST_DEPLOY_SMOKE=1 if running on a host without
# node / playwright cache (e.g. CI runners that already ran the smoke
# in a prior step).
if [[ "${SKIP_POST_DEPLOY_SMOKE:-0}" != "1" && "${USE_TLS}" == "true" ]]; then
    if command -v npx >/dev/null 2>&1; then
        info "Running post-deploy smoke against https://${DOMAIN} (PLAYWRIGHT_PROFILE=smoke)..."
        # E2E_PASSWORD must be set for any smoke spec that logs in. Tests
        # that don't need a login (locale-cookie, public-routes-no-error)
        # ignore the value, so we feed a dummy if the operator did not
        # provide one — they'll just get the no-login subset.
        if (
            cd "${SCRIPT_DIR}" && \
            PLAYWRIGHT_BASE_URL="https://${DOMAIN}" \
            PLAYWRIGHT_PROFILE=smoke \
            E2E_USERNAME="${E2E_USERNAME:-admin}" \
            E2E_PASSWORD="${E2E_PASSWORD:-skip-login}" \
            E2E_HOME_HEADING="${E2E_HOME_HEADING:-}" \
            npx playwright test --reporter=list >/tmp/judgekit-smoke-${DOMAIN}.log 2>&1
        ); then
            success "Post-deploy smoke passed"
        else
            warn "Post-deploy smoke FAILED — log: /tmp/judgekit-smoke-${DOMAIN}.log"
            warn "Last 30 lines:"
            tail -n 30 "/tmp/judgekit-smoke-${DOMAIN}.log" >&2 || true
            if [[ "${ALLOW_DEPLOY_WITH_FAILED_SMOKE:-0}" == "1" ]]; then
                warn "ALLOW_DEPLOY_WITH_FAILED_SMOKE=1 set — continuing despite failed smoke"
            else
                die "Post-deploy smoke failed. Set SKIP_POST_DEPLOY_SMOKE=1 to skip intentionally, or ALLOW_DEPLOY_WITH_FAILED_SMOKE=1 only for an acknowledged emergency."
            fi
        fi
    else
        info "npx not available locally — skipping post-deploy smoke"
    fi
else
    info "Post-deploy smoke skipped (SKIP_POST_DEPLOY_SMOKE=${SKIP_POST_DEPLOY_SMOKE:-0}, USE_TLS=${USE_TLS})"
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
info "Logs:       ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose ${COMPOSE_DEPLOY_FILES} logs -f'"
info "Seed admin: ssh ${REMOTE_USER}@${REMOTE_HOST} 'docker exec -it judgekit-app node scripts/seed.ts'"
info "Restart:    ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose ${COMPOSE_DEPLOY_FILES} --env-file .env.production restart'"
echo "==========================================================================="
