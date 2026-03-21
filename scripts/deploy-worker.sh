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

# Defaults
CONCURRENCY=4
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/opt/judgekit-worker"
SYNC_IMAGES=false

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

REMOTE="${SSH_USER}@${HOST}"

echo "=== JudgeKit Worker Deployment ==="
echo "  Target:      ${REMOTE}"
echo "  App URL:     ${APP_URL}"
echo "  Concurrency: ${CONCURRENCY}"
echo ""

# Step 1: Transfer the judge worker image
echo "[1/4] Transferring judge-worker image..."
docker save judgekit-judge-worker:latest | gzip | ssh "${REMOTE}" "docker load"

# Step 2: Create remote directory and transfer compose file
echo "[2/4] Setting up remote directory..."
ssh "${REMOTE}" "mkdir -p ${REMOTE_DIR} /judge-workspaces"
scp docker-compose.worker.yml "${REMOTE}:${REMOTE_DIR}/docker-compose.yml"

# Step 3: Create .env file on the remote
echo "[3/4] Creating environment file..."
ssh "${REMOTE}" "cat > ${REMOTE_DIR}/.env << 'ENVEOF'
JUDGE_BASE_URL=${APP_URL}
JUDGE_AUTH_TOKEN=${AUTH_TOKEN}
JUDGE_CONCURRENCY=${CONCURRENCY}
JUDGE_WORKER_HOSTNAME=${HOST}
RUST_LOG=info
ENVEOF"

# Step 4: Start the worker
echo "[4/4] Starting worker..."
ssh "${REMOTE}" "cd ${REMOTE_DIR} && docker compose --env-file .env up -d"

echo ""
echo "Worker deployed successfully to ${HOST}"
echo "Monitor via: ssh ${REMOTE} 'cd ${REMOTE_DIR} && docker compose logs -f'"

# Optional: sync judge language images
if [[ "${SYNC_IMAGES}" == "true" ]]; then
  echo ""
  echo "=== Syncing judge language images ==="
  for image in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^judge-' | grep -v 'judge-worker'); do
    echo "  Transferring ${image}..."
    docker save "${image}" | gzip | ssh "${REMOTE}" "docker load"
  done
  echo "Image sync complete."
fi
