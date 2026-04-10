#!/usr/bin/env bash
# =============================================================================
# scripts/pg-volume-safety-check.sh
#
# Detects the "anonymous pgdata volume" data-loss scenario BEFORE a deploy
# stops containers and recreates them with a new compose file.
#
# Background
# ----------
# The postgres:18-alpine image defaults PGDATA to a non-standard path
# (`/var/lib/postgresql/18/docker`). Older docker-compose.production.yml files
# mounted `judgekit-pgdata` at `/var/lib/postgresql/data` WITHOUT setting
# PGDATA explicitly. On `docker compose up`, postgres initialized its cluster
# at the image default (which was NOT the mount point), so the real cluster
# ended up inside an anonymous volume attached to `/var/lib/postgresql`, while
# the named `judgekit-pgdata` volume stayed empty.
#
# Subsequently, commit 93b2345 pinned `PGDATA=/var/lib/postgresql/data` in
# docker-compose.production.yml. On redeploy against a host that was already
# running the buggy compose, the new container would find the named volume
# empty, call `initdb`, and silently start a FRESH cluster — orphaning the
# real data in the anonymous volume and wiping all problems / users /
# submissions from the application's point of view (the Apr 2026 incident).
#
# This script detects that exact situation:
#   - judgekit-db container exists AND is currently bound to an anonymous
#     volume at `/var/lib/postgresql` whose contents contain a real pg
#     cluster (PG_VERSION present under `18/docker/`), AND
#   - the named volume `judgekit_judgekit-pgdata` is empty or missing its
#     cluster directory (no PG_VERSION at its root).
#
# Exit codes
# ----------
#   0 — Safe to deploy (named volume is authoritative, no orphan data)
#   1 — Unsafe: the real data is in an anonymous volume and would be lost
#       on next `docker compose up` with the new compose. The operator must
#       run the migration (either --auto-migrate here or the manual steps
#       printed below).
#   2 — No judgekit-db container exists (first-time deploy; nothing to do)
#
# Usage
# -----
#   scripts/pg-volume-safety-check.sh             # report only
#   scripts/pg-volume-safety-check.sh --auto-migrate
#       Run the filesystem migration automatically after taking a tar
#       snapshot of the anonymous volume and an in-container pg_dump
#       (if possible). Aborts if backups can't be captured.
#
#   --named-volume=<name>    Override named volume name (default: detected
#                            via `docker volume ls`)
#   --container=<name>       Override container name (default: judgekit-db)
#   --quiet                  Suppress informational output
#   --help                   Show this message
# =============================================================================
set -euo pipefail

CONTAINER="judgekit-db"
AUTO_MIGRATE=false
QUIET=false
NAMED_VOLUME=""
BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups}"

for arg in "$@"; do
  case "$arg" in
    --auto-migrate) AUTO_MIGRATE=true ;;
    --quiet) QUIET=true ;;
    --container=*) CONTAINER="${arg#*=}" ;;
    --named-volume=*) NAMED_VOLUME="${arg#*=}" ;;
    --help|-h)
      sed -n '2,/^# ===/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 64
      ;;
  esac
done

info()  { [[ "$QUIET" == true ]] || printf '\033[0;34m[pg-safety]\033[0m %s\n' "$*"; }
ok()    { [[ "$QUIET" == true ]] || printf '\033[0;32m[pg-safety]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[pg-safety]\033[0m %s\n' "$*" >&2; }
fatal() { printf '\033[0;31m[pg-safety]\033[0m %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || fatal "$1 is required on PATH"
}
need docker

# Resolve the named volume name. In a compose project, it's prefixed with the
# project name (e.g. `judgekit_judgekit-pgdata`). We detect it via `docker
# volume ls` rather than hardcoding the prefix.
if [[ -z "$NAMED_VOLUME" ]]; then
  NAMED_VOLUME=$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E 'judgekit-pgdata$' | head -1 || true)
fi

# ---- 1. Does the container exist? ------------------------------------------
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  info "No '${CONTAINER}' container — treating as first-time deploy"
  exit 2
fi

# ---- 2. Inspect the container's mount map ----------------------------------
# `.Mounts` has entries like:
#   { Type: "volume", Name: "judgekit_judgekit-pgdata",
#     Source: "/var/lib/docker/volumes/.../_data",
#     Destination: "/var/lib/postgresql/data" }
#
# We extract the source directory for two destinations we care about:
#   /var/lib/postgresql          (anonymous-volume mount — the bug signature)
#   /var/lib/postgresql/data     (where the new compose wants PGDATA)
ANON_SRC=$(docker inspect "$CONTAINER" \
  --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Source}}{{end}}{{end}}' \
  2>/dev/null || true)
NAMED_SRC=$(docker inspect "$CONTAINER" \
  --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' \
  2>/dev/null || true)

PGDATA_ENV=$(docker inspect "$CONTAINER" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep '^PGDATA=' | head -1 | cut -d= -f2- || true)

info "Container           : $CONTAINER"
info "PGDATA (container)  : ${PGDATA_ENV:-<unset — image default>}"
info "Named volume        : ${NAMED_VOLUME:-<none found>}"
info "Mount /var/lib/postgresql        = ${ANON_SRC:-<none>}"
info "Mount /var/lib/postgresql/data   = ${NAMED_SRC:-<none>}"

# ---- 3. Check for the orphan-volume pattern --------------------------------
# The danger signature:
#   - An anonymous mount exists on /var/lib/postgresql (old compose)
#   - PGDATA (or image default) points somewhere under that mount
#   - The named volume mounted at /var/lib/postgresql/data is empty or
#     doesn't contain a cluster (missing PG_VERSION)
#
# The "real" cluster path on the host (assuming anon mount present) is:
#   ${ANON_SRC}/18/docker          (postgres:18-alpine default)
#   ${ANON_SRC}/17/docker          (postgres:17-alpine)  — generalize over versions
#   ${ANON_SRC}<rest of PGDATA>    (if PGDATA is set to something else)
cluster_has_pg_version() {
  local dir="$1"
  [[ -f "${dir}/PG_VERSION" ]]
}

DANGER=false
CLUSTER_SRC=""

if [[ -n "$ANON_SRC" ]]; then
  # Anonymous mount exists on /var/lib/postgresql. Search for a cluster
  # directory inside it (either at the root or under $PG_MAJOR/docker).
  if [[ -n "$PGDATA_ENV" && "$PGDATA_ENV" == /var/lib/postgresql/* ]]; then
    sub="${PGDATA_ENV#/var/lib/postgresql/}"
    CANDIDATE="${ANON_SRC}/${sub}"
  else
    # Image default: most alpine variants land at /<PG_MAJOR>/docker
    CANDIDATE=$(find "$ANON_SRC" -mindepth 2 -maxdepth 3 -name PG_VERSION 2>/dev/null \
      | head -1 | xargs -I{} dirname {} || true)
  fi
  if [[ -n "${CANDIDATE:-}" ]] && cluster_has_pg_version "${CANDIDATE}"; then
    CLUSTER_SRC="$CANDIDATE"
    info "Anonymous volume contains a pg cluster at: ${CLUSTER_SRC}"
    # Is the named volume empty?
    if [[ -n "$NAMED_SRC" ]]; then
      if ! cluster_has_pg_version "$NAMED_SRC"; then
        DANGER=true
        warn "Named volume at ${NAMED_SRC} has NO PG_VERSION — next deploy would initdb a fresh cluster and orphan ${CLUSTER_SRC}"
      else
        ok "Named volume at ${NAMED_SRC} already has a cluster — the anon volume is a stale copy"
      fi
    else
      # No named-volume mount today means the current running container still
      # uses the OLD compose (no /var/lib/postgresql/data mount). Deploying the
      # new compose would introduce an empty named volume and orphan the data.
      DANGER=true
      warn "Container has no mount at /var/lib/postgresql/data — new compose would introduce an empty named volume and orphan ${CLUSTER_SRC}"
    fi
  fi
fi

if [[ "$DANGER" != true ]]; then
  ok "Safe to deploy (no orphan pgdata scenario detected)"
  exit 0
fi

# ---- 4. Unsafe — print recovery steps --------------------------------------
cat <<BANNER >&2

================================================================================
🛑 UNSAFE: deploying now would silently lose the PostgreSQL data.

  Real cluster is in:        ${CLUSTER_SRC}
  Named volume target:       ${NAMED_SRC:-<not mounted yet — new compose will create one>}
  Named volume (compose):    ${NAMED_VOLUME:-judgekit_judgekit-pgdata}

The new docker-compose.production.yml pins PGDATA=/var/lib/postgresql/data.
Postgres will find that path empty on the next 'docker compose up', run
initdb, and the real cluster listed above will be orphaned (not deleted
immediately, but inaccessible to the app and eventually garbage-collected
by 'docker volume prune').

--- Manual recovery steps (run as a user with sudo) ---

  # 1. Safety net — snapshot both the in-container dump and the anon volume
  docker exec -e PGPASSWORD=\$(grep '^POSTGRES_PASSWORD=' ~/judgekit/.env.production | cut -d= -f2-) \\
    ${CONTAINER} pg_dump -U judgekit -d judgekit --format=custom --compress=9 -f /tmp/recover.dump \\
    && docker cp ${CONTAINER}:/tmp/recover.dump ${BACKUP_DIR}/pre-migration-\$(date +%s).dump
  sudo tar -czf /tmp/pgdata-anon-\$(date +%s).tar.gz -C ${ANON_SRC} .

  # 2. Stop the current container so the cluster is not mid-write
  docker compose -f docker-compose.production.yml stop db

  # 3. Clear the empty named volume and copy the real cluster into it
  sudo bash -c 'shopt -s dotglob; rm -rf ${NAMED_SRC:-/var/lib/docker/volumes/${NAMED_VOLUME:-judgekit_judgekit-pgdata}/_data}/*'
  sudo cp -a ${CLUSTER_SRC}/. ${NAMED_SRC:-/var/lib/docker/volumes/${NAMED_VOLUME:-judgekit_judgekit-pgdata}/_data}/

  # 4. Start the new compose — postgres will find the cluster at the pinned PGDATA
  docker compose -f docker-compose.production.yml --env-file .env.production up -d db

  # 5. Verify
  docker exec ${CONTAINER} psql -U judgekit -d judgekit \\
    -c "select (select count(*) from users) u, (select count(*) from problems) p, (select count(*) from submissions) s;"

Then re-run the deploy.

--- Auto-migration ---
Re-run this script with --auto-migrate to perform steps 1-4 automatically.
Exports will land in ${BACKUP_DIR}. If you don't trust the automation, follow
the manual steps above and then bypass the check with:

  SKIP_PG_VOLUME_CHECK=1 ./deploy-docker.sh

================================================================================
BANNER

if [[ "$AUTO_MIGRATE" != true ]]; then
  exit 1
fi

# ---- 5. Auto-migrate --------------------------------------------------------
warn "Auto-migration requested. Proceeding..."
need sudo
mkdir -p "$BACKUP_DIR"

TS=$(date -u +%Y%m%d-%H%M%SZ)

if docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  info "Taking in-container pg_dump snapshot..."
  ENV_FILE="${ENV_FILE:-${HOME}/judgekit/.env.production}"
  if [[ -f "$ENV_FILE" ]]; then
    PG_PASS=$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | head -1 || true)
  else
    PG_PASS="${POSTGRES_PASSWORD:-}"
  fi
  if [[ -n "$PG_PASS" ]]; then
    if ! docker exec -e PGPASSWORD="$PG_PASS" "$CONTAINER" \
        pg_dump -U judgekit -d judgekit --format=custom --compress=9 -f "/tmp/recover-${TS}.dump"; then
      fatal "pg_dump failed; refusing to migrate without a logical backup"
    fi
    docker cp "${CONTAINER}:/tmp/recover-${TS}.dump" "${BACKUP_DIR}/pre-migration-${TS}.dump"
    ok "Logical backup: ${BACKUP_DIR}/pre-migration-${TS}.dump"
  else
    warn "POSTGRES_PASSWORD unavailable; skipping logical backup"
  fi
fi

info "Taking tar snapshot of the anonymous volume..."
sudo tar -czf "${BACKUP_DIR}/pgdata-anon-${TS}.tar.gz" -C "$ANON_SRC" . \
  || fatal "tar snapshot failed; refusing to proceed without a filesystem backup"
ok "Filesystem snapshot: ${BACKUP_DIR}/pgdata-anon-${TS}.tar.gz"

info "Stopping ${CONTAINER}..."
docker stop "$CONTAINER" >/dev/null || fatal "Failed to stop ${CONTAINER}"

if [[ -z "$NAMED_SRC" ]]; then
  # The old container had no mount at /var/lib/postgresql/data. The named
  # volume will be created when the new compose starts. Create it now so we
  # can populate it.
  NAMED_VOLUME="${NAMED_VOLUME:-judgekit_judgekit-pgdata}"
  docker volume inspect "$NAMED_VOLUME" >/dev/null 2>&1 \
    || docker volume create "$NAMED_VOLUME" >/dev/null
  NAMED_SRC=$(docker volume inspect "$NAMED_VOLUME" --format '{{.Mountpoint}}')
  info "Created/using named volume: ${NAMED_VOLUME} -> ${NAMED_SRC}"
fi

info "Clearing named volume ${NAMED_SRC}..."
sudo bash -c "shopt -s dotglob; rm -rf ${NAMED_SRC}/*" \
  || fatal "Failed to clear named volume"

info "Copying cluster from ${CLUSTER_SRC} to ${NAMED_SRC}..."
sudo cp -a "${CLUSTER_SRC}/." "${NAMED_SRC}/" \
  || fatal "Filesystem copy failed"

if [[ ! -f "${NAMED_SRC}/PG_VERSION" ]]; then
  fatal "Post-copy check: PG_VERSION missing at ${NAMED_SRC} — migration failed"
fi

ok "Migration complete. Named volume now has PG_VERSION $(sudo cat "${NAMED_SRC}/PG_VERSION")"
ok "Safety snapshots:"
ok "  - logical dump: ${BACKUP_DIR}/pre-migration-${TS}.dump (if pg_dump succeeded)"
ok "  - filesystem  : ${BACKUP_DIR}/pgdata-anon-${TS}.tar.gz"
ok "Next: run your deploy script; it will find the pinned PGDATA with data already in place."
exit 0
