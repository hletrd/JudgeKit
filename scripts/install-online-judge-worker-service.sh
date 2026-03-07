#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="online-judge-worker.service"
SOURCE_FILE="${REPO_ROOT}/scripts/${SERVICE_NAME}"
TARGET_FILE="/etc/systemd/system/${SERVICE_NAME}"

install -m 0644 "${SOURCE_FILE}" "${TARGET_FILE}"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl status "${SERVICE_NAME}" --no-pager --lines=20
