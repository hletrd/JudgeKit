#!/usr/bin/env bash
# Health monitoring script for JudgeKit
# Supports PostgreSQL (production) and SQLite (dev)
# Run via cron: */5 * * * * /path/to/monitor-health.sh
set -euo pipefail

DB_DIALECT="${DB_DIALECT:-sqlite}"
DISK_WARN_PERCENT=85
DISK_CRIT_PERCENT=95

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$1] $2" | systemd-cat -t judgekit-monitor -p "$3"
}

# Check disk space
check_disk() {
  local check_dir
  if [ "$DB_DIALECT" = "sqlite" ]; then
    check_dir="${DATABASE_PATH:-$(pwd)/data}"
  else
    check_dir="$(pwd)"
  fi
  local usage
  usage=$(df --output=pcent "${check_dir}" 2>/dev/null | tail -1 | tr -d ' %')
  if [ "${usage}" -ge "${DISK_CRIT_PERCENT}" ]; then
    log "CRITICAL" "Disk usage at ${usage}% on $(df --output=target "${check_dir}" | tail -1)" "crit"
    return 2
  elif [ "${usage}" -ge "${DISK_WARN_PERCENT}" ]; then
    log "WARNING" "Disk usage at ${usage}% on $(df --output=target "${check_dir}" | tail -1)" "warning"
    return 1
  fi
  return 0
}

# Check PostgreSQL connectivity
check_pg() {
  if [ "$DB_DIALECT" != "postgresql" ]; then
    return 0
  fi
  local url="${DATABASE_URL:-}"
  if [ -z "$url" ]; then
    log "WARNING" "DATABASE_URL not set for PostgreSQL health check" "warning"
    return 1
  fi
  if command -v pg_isready >/dev/null 2>&1; then
    if ! pg_isready -d "$url" -q 2>/dev/null; then
      log "CRITICAL" "PostgreSQL is not accepting connections" "crit"
      return 2
    fi
    log "INFO" "PostgreSQL is accepting connections" "info"
  fi
  return 0
}

# Check SQLite WAL size (SQLite only)
check_wal() {
  if [ "$DB_DIALECT" != "sqlite" ]; then
    return 0
  fi
  local db_file="${DATABASE_PATH:-$(pwd)/data/judge.db}"
  local wal_file="${db_file}-wal"
  local WAL_WARN_BYTES=$((100 * 1024 * 1024))  # 100MB
  local WAL_CRIT_BYTES=$((500 * 1024 * 1024))  # 500MB

  if [ ! -f "${wal_file}" ]; then
    return 0
  fi
  local wal_size
  wal_size=$(stat -c %s "${wal_file}" 2>/dev/null || stat -f %z "${wal_file}" 2>/dev/null || echo 0)
  if [ "${wal_size}" -ge "${WAL_CRIT_BYTES}" ]; then
    local wal_mb=$((wal_size / 1024 / 1024))
    log "CRITICAL" "SQLite WAL size: ${wal_mb}MB (threshold: $((WAL_CRIT_BYTES / 1024 / 1024))MB)" "crit"
    return 2
  elif [ "${wal_size}" -ge "${WAL_WARN_BYTES}" ]; then
    local wal_mb=$((wal_size / 1024 / 1024))
    log "WARNING" "SQLite WAL size: ${wal_mb}MB (threshold: $((WAL_WARN_BYTES / 1024 / 1024))MB)" "warning"
    return 1
  fi
  return 0
}

# Check database file size (SQLite only)
check_db_size() {
  if [ "$DB_DIALECT" != "sqlite" ]; then
    return 0
  fi
  local db_file="${DATABASE_PATH:-$(pwd)/data/judge.db}"
  local wal_file="${db_file}-wal"
  if [ ! -f "${db_file}" ]; then
    log "WARNING" "Database file not found: ${db_file}" "warning"
    return 1
  fi
  local db_size
  db_size=$(stat -c %s "${db_file}" 2>/dev/null || stat -f %z "${db_file}" 2>/dev/null || echo 0)
  local db_mb=$((db_size / 1024 / 1024))
  log "INFO" "Database size: ${db_mb}MB, WAL: $(stat -c %s "${wal_file}" 2>/dev/null || echo 0) bytes" "info"
  return 0
}

# Run all checks
exit_code=0
check_disk || exit_code=$?
check_pg || { rc=$?; [ $rc -gt $exit_code ] && exit_code=$rc; }
check_wal || { rc=$?; [ $rc -gt $exit_code ] && exit_code=$rc; }
check_db_size || true

exit ${exit_code}
