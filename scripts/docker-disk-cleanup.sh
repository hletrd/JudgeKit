#!/usr/bin/env bash
# Safe, recurring Docker disk cleanup for JudgeKit hosts.
#
# CRITICAL: this script NEVER prunes volumes. Pruning volumes on a production
# host would destroy the PostgreSQL data volume (judgekit_judgekit-pgdata) —
# the exact class of incident that wiped data in Apr 2026. There is no
# `docker volume prune` and no `docker system prune --volumes` here, by design.
#
# Routine behaviour: prune DANGLING images (untagged <none> layers left by
# rebuilds), build cache, and stopped containers OLDER than a retention window
# (keeps in-flight deploys intact). Under disk pressure (>= THRESHOLD%),
# escalate by also clearing all build cache + the BuildKit history store.
#
# CRITICAL: uses `docker image prune -f` (dangling only), NEVER `-af`. Judge
# language images (judge-cpp, judge-python, ...) are tagged but are not
# attached to any long-running container — the worker spawns a throwaway
# container per submission. `-af` would treat them as "unused" and wipe them,
# breaking judging. `-f` only removes untagged layers, which is what grows
# disk across repeated `docker build` runs. This keeps the script safe on
# judge hosts as well as app-only hosts. Build cache is the dominant consumer
# and is fully reclaimable with `builder prune`.
#
# Tunables (env): DOCKER_CLEANUP_DISK_THRESHOLD (default 80),
#                 DOCKER_CLEANUP_RETAIN (default 24h).
set -uo pipefail

THRESHOLD="${DOCKER_CLEANUP_DISK_THRESHOLD:-80}"
RETAIN="${DOCKER_CLEANUP_RETAIN:-24h}"

usage() { df --output=pcent / | tail -1 | tr -dc '0-9'; }

BEFORE_PCT="$(usage)"
echo "[docker-cleanup] start: disk ${BEFORE_PCT}% used (threshold ${THRESHOLD}%, retain ${RETAIN})"

# Stopped containers first (frees their writable layers); keep recent ones.
docker container prune -f --filter "until=${RETAIN}" || true

# Dangling images only (-f, never -af) — preserves tagged judge-* images.
docker image prune -f || true

if [ "${BEFORE_PCT:-0}" -ge "$THRESHOLD" ]; then
  echo "[docker-cleanup] disk >= ${THRESHOLD}% — aggressive: all build cache + BuildKit history"
  docker builder prune -af || true
  docker buildx history rm --all >/dev/null 2>&1 || true
else
  docker builder prune -af --filter "until=${RETAIN}" || true
fi

echo "[docker-cleanup] done: $(df -h / | awk 'NR==2{print $3" used, "$4" free ("$5")"}')"
