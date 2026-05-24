#!/usr/bin/env bash
# =============================================================================
# Rebuild all judge-* language Docker images on a dedicated worker host.
#
# Use when a dedicated worker host has lost (or never had) the judge
# language image set — e.g. after an over-aggressive `docker image prune
# -af` wiped them, or when bootstrapping a fresh worker host. The
# deploy-docker.sh WORKER_HOSTS step only rebuilds judge-worker:latest;
# it never builds the language images. This script fills that gap.
#
# Usage (locally, against a remote worker):
#   ./scripts/rebuild-worker-language-images.sh \
#       worker.example.com \
#       ~/.ssh/worker-key.pem \
#       linux/amd64
#
# Or, running directly on the worker host:
#   ./scripts/rebuild-worker-language-images.sh local linux/arm64
#
# Honors LANGUAGE_FILTER the same way deploy-docker.sh does, including
# the new `everything` escape hatch:
#   LANGUAGE_FILTER=core    ./scripts/rebuild-worker-language-images.sh ...
#   LANGUAGE_FILTER=cpp,python,jvm,rust ./scripts/rebuild-worker-language-images.sh ...
#
# Per-image build logs land in /tmp/build-judge-<lang>.log on the target
# host. Final summary printed to stdout.
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Reuse the language presets from deploy-docker.sh — single source of
# truth for "what does `all` mean today". Capture only the assignments
# (CORE_LANGS / POPULAR_LANGS / EXTENDED_LANGS / ARM_PROHIBITIVE_LANGS /
# ALL_LANGS) and stop before `resolve_languages()` so we don't end up
# evaluating a half-defined function body.
# shellcheck disable=SC1091
eval "$(grep -E '^(CORE|POPULAR|EXTENDED|ARM_PROHIBITIVE|ALL)_LANGS=' "${REPO_ROOT}/deploy-docker.sh")"

resolve_languages() {
  local spec="$1"
  case "$spec" in
    core)       echo "$CORE_LANGS" ;;
    popular)    echo "$POPULAR_LANGS" ;;
    extended)   echo "$EXTENDED_LANGS" ;;
    all)        echo "$ALL_LANGS" ;;
    everything) echo "$ALL_LANGS $ARM_PROHIBITIVE_LANGS" ;;
    none)       echo "" ;;
    *)          echo "$spec" | tr ',' ' ' ;;
  esac
}

LANGS_TO_BUILD=$(resolve_languages "${LANGUAGE_FILTER:-all}")
COUNT=$(echo "$LANGS_TO_BUILD" | wc -w | tr -d ' ')

if [[ "$#" -lt 2 ]]; then
  echo "Usage: $0 <host|local> [<ssh-key-path>] <platform>"
  echo "       $0 worker.example.com ~/.ssh/worker.pem linux/amd64"
  echo "       $0 local linux/arm64"
  echo
  echo "Environment:"
  echo "  LANGUAGE_FILTER=<preset|comma-list>  — defaults to 'all'"
  echo
  echo "Presets: core, popular, extended, all, everything, none"
  exit 1
fi

HOST="$1"
shift
if [[ "$HOST" == "local" ]]; then
  PLATFORM="$1"
  RUN_CMD=""
else
  KEY="$1"
  PLATFORM="$2"
  RUN_CMD=(ssh -o ControlPath=none -i "${KEY/#~/$HOME}" "ubuntu@${HOST}")
fi

REMOTE_SCRIPT=$(cat <<REMOTE
set -u
cd ~/judgekit

# Re-pull hello-world too: the judge worker's startup "Docker capability
# probe" creates a hello-world container to confirm Docker access works.
# If hello-world is missing locally, the worker can't pull through the
# docker-socket-proxy (403 Forbidden) and the container stays unhealthy.
# The original prune-regression wiped this image alongside the language
# set, so include it in any recovery cycle.
echo "ensuring hello-world:latest is present..."
docker pull hello-world:latest 2>&1 | tail -1

i=0
FAIL=()
for lang in ${LANGS_TO_BUILD}; do
  i=\$((i+1))
  if [[ ! -f docker/Dockerfile.judge-\${lang} ]]; then
    echo "[\${i}/${COUNT}] SKIP judge-\${lang} — no Dockerfile"
    continue
  fi
  echo "[\${i}/${COUNT}] building judge-\${lang} on ${PLATFORM}..."
  if docker build --platform ${PLATFORM} -t judge-\${lang}:latest -f docker/Dockerfile.judge-\${lang} . >/tmp/build-judge-\${lang}.log 2>&1; then
    echo "[\${i}/${COUNT}] OK judge-\${lang}"
  else
    echo "[\${i}/${COUNT}] FAIL judge-\${lang} — see /tmp/build-judge-\${lang}.log"
    FAIL+=("\${lang}")
  fi
done
echo
echo "=== done ==="
echo "OK:   \$((${COUNT} - \${#FAIL[@]}))/${COUNT}"
echo "FAIL: \${FAIL[*]:-none}"

# Same dangling-only prune as deploy-docker.sh — do NOT use -af (it wipes
# the language images we just spent an hour rebuilding).
docker container prune -f 2>&1 | tail -1
docker image prune -f   2>&1 | tail -1
docker builder prune -af 2>&1 | tail -1
df -h / | tail -1
REMOTE
)

if [[ -n "${RUN_CMD[*]}" ]]; then
  "${RUN_CMD[@]}" "$REMOTE_SCRIPT"
else
  bash -c "$REMOTE_SCRIPT"
fi
