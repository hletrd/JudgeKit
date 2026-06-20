#!/usr/bin/env bash
# =============================================================================
# deploy-worker.sh — Deploy a JudgeKit judge worker to a remote machine
#
# Usage:
#   ./scripts/deploy-worker.sh --host=<ip> --app-url=<url> [--token=<token>] [--concurrency=<n>]
#
# Example:
#   ./scripts/deploy-worker.sh \
#     --host=192.168.1.10 \
#     --app-url=https://oj.example.com/api/v1 \
#     --token=your-judge-auth-token \
#     --concurrency=4
#
# What it does:
#   1. Transfers the judge worker Docker image to the target host
#   2. Copies docker-compose.worker.yml and creates .env file
#   3. Starts the worker container on the target
#   4. Optionally syncs judge language images
# =============================================================================

set -euo pipefail
umask 077

# Defaults
CONCURRENCY=4
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/opt/judgekit-worker"
SYNC_IMAGES=false
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)

# Parse arguments
for arg in "$@"; do
  case $arg in
    --host=*)     HOST="${arg#*=}" ;;
    --app-url=*)  APP_URL="${arg#*=}" ;;
    --token=*)    AUTH_TOKEN="${arg#*=}" ;;
    --concurrency=*) CONCURRENCY="${arg#*=}" ;;
    --sync-images)   SYNC_IMAGES=true ;;
    --ssh-user=*)    SSH_USER="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 --host=<ip> --app-url=<url> [--token=<token>] [--concurrency=<n>] [--sync-images] [--ssh-user=<user>]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# Validate required args
if [[ -z "${HOST:-}" ]]; then
  echo "Error: --host is required"
  exit 1
fi
if [[ -z "${APP_URL:-}" ]]; then
  echo "Error: --app-url is required"
  exit 1
fi
if [[ -z "${AUTH_TOKEN:-}" ]]; then
  if [[ -f .env.production ]]; then
    AUTH_TOKEN=$(grep -E '^JUDGE_AUTH_TOKEN=' .env.production | cut -d= -f2-)
  fi
  if [[ -z "${AUTH_TOKEN:-}" ]]; then
    echo "Error: --token is required (or set JUDGE_AUTH_TOKEN in .env.production)"
    exit 1
  fi
fi

RUNNER_AUTH_TOKEN_VALUE="${RUNNER_AUTH_TOKEN:-}"
if [[ -z "${RUNNER_AUTH_TOKEN_VALUE}" && -f .env.production ]]; then
  RUNNER_AUTH_TOKEN_VALUE=$(grep -E '^RUNNER_AUTH_TOKEN=' .env.production | cut -d= -f2- || true)
fi
if [[ -z "${RUNNER_AUTH_TOKEN_VALUE}" ]]; then
  RUNNER_AUTH_TOKEN_VALUE=$(openssl rand -hex 32)
fi

REMOTE="${SSH_USER}@${HOST}"

echo "=== JudgeKit Worker Deployment ==="
echo "  Target:      ${REMOTE}"
echo "  App URL:     ${APP_URL}"
echo "  Concurrency: ${CONCURRENCY}"
echo ""

# Step 1: Transfer the judge worker image
echo "[1/4] Transferring judge-worker image..."
docker save judgekit-judge-worker:latest | gzip | ssh "${SSH_OPTS[@]}" "${REMOTE}" "docker load"

# Clean up stale (dangling) worker images from previous deploys — keeps :latest
echo "    Cleaning up stale worker images..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" "docker image prune -f" >/dev/null 2>&1 || true

# Step 2: Create remote directory and transfer compose file
echo "[2/4] Setting up remote directory..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" "install -d -m 700 ${REMOTE_DIR} && mkdir -p /judge-workspaces"
scp "${SSH_OPTS[@]}" docker-compose.worker.yml "${REMOTE}:${REMOTE_DIR}/docker-compose.yml"

# Step 3: Create or update .env file on the remote
# Preserves any existing remote-only keys (e.g. DOCKER_HOST, custom RUST_LOG)
# by updating variables individually rather than replacing the entire file.
echo "[3/4] Updating environment file..."

# Required variables — these are always set/updated
# Uses Python to update the .env file safely, avoiding sed/shell injection
# from special characters in values (e.g., URLs with pipes or shell metacharacters).
ensure_env_var() {
  local key="$1"
  local value="$2"
  # Encode key and value as base64 to safely pass through SSH + shell layers
  local key_b64=$(printf '%s' "$key" | base64)
  local val_b64=$(printf '%s' "$value" | base64)
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "python3 -c '
import base64, os
k = base64.b64decode(\"${key_b64}\").decode()
v = base64.b64decode(\"${val_b64}\").decode()
env_path = \"${REMOTE_DIR}/.env\"
lines = []
found = False
if os.path.exists(env_path):
    with open(env_path, \"r\") as f:
        for line in f:
            if line.startswith(k + \"=\"):
                lines.append(k + \"=\" + v + \"\\n\")
                found = True
            else:
                lines.append(line)
if not found:
    lines.append(k + \"=\" + v + \"\\n\")
with open(env_path, \"w\") as f:
    f.writelines(lines)
'"
}

# Create .env if it doesn't exist
ssh "${SSH_OPTS[@]}" "${REMOTE}" "touch ${REMOTE_DIR}/.env && chmod 600 ${REMOTE_DIR}/.env"

ensure_env_var JUDGE_BASE_URL "${APP_URL}"
ensure_env_var JUDGE_AUTH_TOKEN "${AUTH_TOKEN}"
ensure_env_var RUNNER_AUTH_TOKEN "${RUNNER_AUTH_TOKEN_VALUE}"
ensure_env_var JUDGE_CONCURRENCY "${CONCURRENCY}"
ensure_env_var JUDGE_WORKER_HOSTNAME "${HOST}"
ensure_env_var RUST_LOG "info"

# Step 4: Start the worker
echo "[4/4] Starting worker..."
ssh "${SSH_OPTS[@]}" "${REMOTE}" "cd ${REMOTE_DIR} && docker compose --env-file .env up -d"

echo ""
echo "Worker deployed successfully to ${HOST}"
echo "Monitor via: ssh ${REMOTE} 'cd ${REMOTE_DIR} && docker compose logs -f'"

# Optional: sync judge language images
if [[ "${SYNC_IMAGES}" == "true" ]]; then
  echo ""
  echo "=== Syncing judge language images ==="
  for image in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^judge-' | grep -v 'judge-worker'); do
    echo "  Transferring ${image}..."
    docker save "${image}" | gzip | ssh "${SSH_OPTS[@]}" "${REMOTE}" "docker load"
  done
  echo "Image sync complete."
fi
