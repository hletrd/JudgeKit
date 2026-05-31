#!/usr/bin/env bash
#
# Install gVisor (runsc) and register it as a Docker runtime on a judge worker
# HOST. This hardens judged containers: a container/kernel escape hits gVisor's
# user-space kernel instead of the host kernel + docker socket.
#
# IMPORTANT
#   - Run this on the HOST where dockerd runs (the worker machine), NOT inside
#     the judge-worker container. The worker spawns judged containers on the
#     host daemon via the socket-proxy, so the runtime must exist on the host.
#   - This does NOT enable gVisor for judging by itself. After install, set
#     JUDGE_OCI_RUNTIME=runsc in the worker's .env and restart the worker, but
#     ONLY after the validation protocol in docs/judge-worker-gvisor.md passes
#     on a DISPOSABLE worker. Do not enable on production blind.
#   - runsc itself runs untrusted code's syscalls, so this script verifies the
#     download checksums before installing.
#
# Usage:
#   sudo scripts/install-gvisor.sh            # latest release
#   sudo GVISOR_RELEASE=20260101 scripts/install-gvisor.sh   # pin a release
#
set -euo pipefail

RELEASE="${GVISOR_RELEASE:-latest}"
ARCH="$(uname -m)"
BASE_URL="https://storage.googleapis.com/gvisor/releases/release/${RELEASE}/${ARCH}"
DAEMON_JSON="/etc/docker/daemon.json"

log() { printf '\033[0;34m[gvisor]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[gvisor][FATAL]\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "Run as root (sudo). It writes ${DAEMON_JSON} and restarts docker."
command -v docker >/dev/null || die "docker not found on this host."
command -v wget   >/dev/null || die "wget is required."
command -v sha512sum >/dev/null || die "sha512sum is required."

log "Host arch: ${ARCH} | release: ${RELEASE}"

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT
cd "${workdir}"

log "Downloading runsc + containerd-shim-runsc-v1 (+ checksums)..."
wget --quiet "${BASE_URL}/runsc" "${BASE_URL}/runsc.sha512" \
             "${BASE_URL}/containerd-shim-runsc-v1" "${BASE_URL}/containerd-shim-runsc-v1.sha512" \
  || die "Download failed (check arch '${ARCH}' / release '${RELEASE}')."

log "Verifying checksums..."
sha512sum -c runsc.sha512 || die "runsc checksum MISMATCH — aborting (do not install an unverified sandbox binary)."
sha512sum -c containerd-shim-runsc-v1.sha512 || die "shim checksum MISMATCH — aborting."

chmod a+rx runsc containerd-shim-runsc-v1
install -m 0755 runsc containerd-shim-runsc-v1 /usr/local/bin/
log "Installed: $(/usr/local/bin/runsc --version | head -1)"

if [[ -f "${DAEMON_JSON}" ]]; then
  backup="${DAEMON_JSON}.bak.$(date +%Y%m%d-%H%M%S)"
  cp -a "${DAEMON_JSON}" "${backup}"
  log "Backed up existing ${DAEMON_JSON} -> ${backup}"
fi

# `runsc install` merges a {"runtimes":{"runsc":{...}}} entry into daemon.json.
log "Registering runsc runtime in ${DAEMON_JSON} (runsc install)..."
/usr/local/bin/runsc install || die "runsc install failed."

log "Reloading docker so the new runtime is recognised..."
if systemctl reload docker 2>/dev/null; then :; else systemctl restart docker; fi

log "Verifying the daemon recognises runsc..."
if docker run --rm --runtime=runsc --network=none hello-world >/dev/null 2>&1; then
  log "OK: 'docker run --runtime=runsc' works."
else
  die "runsc is installed but 'docker run --runtime=runsc' failed — inspect 'journalctl -u docker' and ${DAEMON_JSON}."
fi

cat <<'NEXT'

gVisor installed and registered. NEXT STEPS (do not skip):
  1. This worker is now a candidate for JUDGE_OCI_RUNTIME=runsc, but DO NOT set
     it on production yet.
  2. Run the validation protocol in docs/judge-worker-gvisor.md on a DISPOSABLE
     worker: judge-correctness across the language matrix, custom-seccomp
     interaction, and time/memory overhead vs runc.
  3. Only after that passes, set JUDGE_OCI_RUNTIME=runsc in the worker .env and
     restart the worker compose.
NEXT
