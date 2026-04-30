# RPF Cycle 4 — document-specialist perspective (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `e61f8a91`

## Findings

### C4-DOC-1: [LOW, High confidence] `deploy-docker.sh` header docstring still missing `SKIP_PREDEPLOY_BACKUP`, `SKIP_LANGUAGES`, `SKIP_BUILD`, `LANGUAGE_FILTER`, `INCLUDE_WORKER`, `BUILD_WORKER_IMAGE`

**File/lines:** `deploy-docker.sh:1-21`

Lines 14-20 enumerate `SSH_PASSWORD`, `SSH_KEY`, `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN` only. The script reads at least these additional env vars (per `bdfc79e1`'s SKIP_* fix and the orchestrator's DEPLOY_CMD): `SKIP_LANGUAGES`, `SKIP_BUILD`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`, `LANGUAGE_FILTER`, `SKIP_PREDEPLOY_BACKUP`.

Cycle-3 filed C3-AGG-7. The exit criterion is "any cycle touches AGENTS.md or `deploy-docker.sh` header for any other reason" — naturally met if cycle 4 makes any deploy-script edit. **C4-CT-1 recommends picking this up this cycle.**

**Repo policy check:** Pure documentation, no runtime impact. LOW severity. CLAUDE.md / AGENTS.md do not forbid documentation edits.

### C4-DOC-2: [LOW, High confidence] `AGENTS.md` lacks a "Deploy hardening" subsection

Cycle-3's C3-AGG-7 named this. The exit criterion is the same as C4-DOC-1. Pick up this cycle if header docstring is updated.

### C4-DOC-3: [INFO, High confidence] No commit-message vs code drift

Cycle-3 commits all docs/plans only. No code claims to verify against. No drift.

## Confidence

High that the only document-specialist action this cycle is to address C3-AGG-7 (header + AGENTS.md "Deploy hardening" subsection) — which C4-CT-1 already nominates as a backlog draw-down target.
