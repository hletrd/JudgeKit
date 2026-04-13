#!/usr/bin/env bash
set -euo pipefail

APP_INSTANCE_COUNT="${APP_INSTANCE_COUNT:-}"
REALTIME_SINGLE_INSTANCE_ACK="${REALTIME_SINGLE_INSTANCE_ACK:-}"
REALTIME_COORDINATION_BACKEND="${REALTIME_COORDINATION_BACKEND:-none}"
COMPILER_RUNNER_URL="${COMPILER_RUNNER_URL:-}"
ENABLE_COMPILER_LOCAL_FALLBACK="${ENABLE_COMPILER_LOCAL_FALLBACK:-0}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ -z "$APP_INSTANCE_COUNT" && -z "$REALTIME_SINGLE_INSTANCE_ACK" ]]; then
  fail "Declare APP_INSTANCE_COUNT or REALTIME_SINGLE_INSTANCE_ACK before using this high-stakes runtime check."
fi

if [[ "$APP_INSTANCE_COUNT" =~ ^[0-9]+$ ]] && (( APP_INSTANCE_COUNT > 1 )); then
  if [[ "$REALTIME_COORDINATION_BACKEND" != "postgresql" ]]; then
    fail "Multi-instance high-stakes deployments require REALTIME_COORDINATION_BACKEND=postgresql."
  fi
fi

if [[ -z "$COMPILER_RUNNER_URL" ]]; then
  fail "COMPILER_RUNNER_URL must be set so high-stakes deployments do not rely on ad-hoc local execution."
fi

if [[ "$ENABLE_COMPILER_LOCAL_FALLBACK" == "1" ]]; then
  fail "ENABLE_COMPILER_LOCAL_FALLBACK=1 is not allowed for high-stakes runtime checks."
fi

echo "High-stakes runtime configuration check passed."
