#!/usr/bin/env bash
# =============================================================================
# Switch a worker host's Docker daemon to the `crun` OCI runtime instead of
# the default `runc`. crun is a C implementation of the OCI spec that's
# typically 30-50 ms faster than runc on container create/start — for an
# online judge that spawns one container per test case, this compounds.
#
# Safe for production: crun is fully OCI-compliant and a drop-in replacement.
# The Docker daemon still manages images, networks, volumes, etc. — only the
# low-level container lifecycle helper changes.
#
# Usage:
#   ./scripts/install-crun-runtime.sh             # apply locally
#   ssh <worker-host> 'bash -s' < scripts/install-crun-runtime.sh   # remote
#
# Idempotent: re-running is a no-op if crun is already the default.
# =============================================================================
set -euo pipefail

CRUN_PKG_NAME="crun"
DAEMON_JSON=/etc/docker/daemon.json

need_sudo() {
    if [[ "$EUID" -ne 0 ]]; then
        SUDO="sudo"
    else
        SUDO=""
    fi
}
need_sudo

if ! command -v crun >/dev/null 2>&1; then
    echo "==> Installing crun via apt..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y --no-install-recommends "$CRUN_PKG_NAME"
else
    echo "==> crun already installed: $(crun --version | head -1)"
fi

CRUN_BIN=$(command -v crun)
echo "==> Using crun binary: ${CRUN_BIN}"

# Build new daemon.json content. If an existing config has settings we don't
# know about (e.g., per-host log-driver), preserve them by merging with jq.
NEW_CONTENT=$(
    if [[ -f "$DAEMON_JSON" ]] && command -v jq >/dev/null 2>&1; then
        $SUDO cat "$DAEMON_JSON" | jq --arg path "$CRUN_BIN" '
            .["default-runtime"] = "crun"
            | .runtimes = (.runtimes // {})
            | .runtimes.crun = {"path": $path}
        '
    elif [[ -f "$DAEMON_JSON" ]]; then
        # No jq available — only safe if the existing file is empty or trivially
        # the same shape. Bail out and ask the operator to install jq.
        cat <<EOF
{}
EOF
        echo "WARN: existing daemon.json present and jq is missing; aborting" >&2
        echo "      install jq (apt-get install -y jq) then re-run this script" >&2
        exit 1
    else
        cat <<EOF
{
  "default-runtime": "crun",
  "runtimes": {
    "crun": {
      "path": "${CRUN_BIN}"
    }
  }
}
EOF
    fi
)

# Detect whether we already have the right setting to avoid an unnecessary
# daemon restart (which briefly interrupts running containers).
CURRENT_DEFAULT=""
if [[ -f "$DAEMON_JSON" ]] && command -v jq >/dev/null 2>&1; then
    CURRENT_DEFAULT=$($SUDO cat "$DAEMON_JSON" | jq -r '.["default-runtime"] // ""')
fi

if [[ "$CURRENT_DEFAULT" == "crun" ]]; then
    echo "==> daemon.json already has default-runtime=crun — leaving Docker alone"
else
    if [[ -f "$DAEMON_JSON" ]]; then
        BACKUP="$DAEMON_JSON.bak.$(date +%s)"
        $SUDO cp "$DAEMON_JSON" "$BACKUP"
        echo "==> Backed up existing daemon.json -> $BACKUP"
    fi

    echo "$NEW_CONTENT" | $SUDO tee "$DAEMON_JSON" >/dev/null

    echo "==> Restarting Docker daemon..."
    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl restart docker
    elif command -v service >/dev/null 2>&1; then
        $SUDO service docker restart
    else
        echo "WARN: neither systemctl nor service available — restart Docker manually" >&2
        exit 1
    fi
    # Give Docker a moment to settle
    sleep 3
fi

echo
echo "==> docker info | grep -i runtime"
docker info 2>/dev/null | grep -iE "runtime|^ runtimes" || true
echo
echo "==> Smoke test: docker run --rm hello-world (uses crun by default)"
docker run --rm hello-world >/dev/null 2>&1 && echo "    OK"
echo
echo "Done. Container spawn latency should drop by ~30-50 ms per test case."
