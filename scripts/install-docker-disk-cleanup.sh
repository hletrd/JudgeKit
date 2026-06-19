#!/usr/bin/env bash
# Install the safe recurring Docker disk cleanup (script + systemd timer) on a
# JudgeKit host. Idempotent; safe to re-run. Run with sudo or as root.
#
# Usage (locally on the host, or via ssh):
#   sudo bash scripts/install-docker-disk-cleanup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="docker-disk-cleanup.service"
TIMER_NAME="docker-disk-cleanup.timer"
CLEANUP_BIN="/usr/local/bin/docker-disk-cleanup.sh"
SYSTEMD_DIR="/etc/systemd/system"

install -m 0755 "$SCRIPT_DIR/docker-disk-cleanup.sh" "$CLEANUP_BIN"
install -m 0644 "$SCRIPT_DIR/$SERVICE_NAME" "$SYSTEMD_DIR/$SERVICE_NAME"
install -m 0644 "$SCRIPT_DIR/$TIMER_NAME" "$SYSTEMD_DIR/$TIMER_NAME"

systemctl daemon-reload
systemctl enable --now "$TIMER_NAME"
systemctl list-timers --all | grep "$TIMER_NAME" || true
echo "Installed $CLEANUP_BIN + $TIMER_NAME (every 6h). Never prunes volumes."
