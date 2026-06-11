# Document Specialist — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)

## Doc/code mismatches

### DOC2-1 — `docs/data-retention-policy.md` omits `code_snapshots` (MEDIUM, paired with SEC2-2)
The policy table covers chat, anti-cheat events, recruiting, submissions,
login events, audit events, and (since cycle 1) source drafts — but not the
highest-volume sensitive table, `code_snapshots`. Whatever retention the fix
picks must land in the policy doc in the same commit, including the env
override name.

### DOC2-2 — Deploy runbook lacks the BuildKit failure signature (HIGH ops, part of DEFERRED-OPS-1)
The confirmed signature (`failed to solve: Internal: unknown blob sha256:...
in history`), its confirmed remedy (`docker buildx history rm --all`,
metadata-only, zero downtime), the explicit NON-remedy (`docker builder
prune -af` does not clear it), and the re-trigger mechanism (full-parallel
compose bake) must be documented in AGENTS.md's deploy-hardening section /
ops runbook so the next operator doesn't rediscover it. Include the
CLAUDE.md guardrail reminder (never `docker image prune -a` on worker hosts).

### DOC2-3 — data-retention-maintenance docstring count (LOW, mechanical)
`src/lib/data-retention-maintenance.ts:101-104` says "Seven independent
prunes" — adding the snapshots prune makes it eight; update the sentence in
the same commit (this comment was updated correctly in cycle 1; keep the
streak).

## Verified accurate (spot-checked against code)
- `docs/exam-integrity-model.md` "Deliberate telemetry boundaries" (cycle-1
  F13b) matches the implemented posture (no fullscreen signal; similarity +
  snapshot replay as containment).
- `.env.example` / `.env.production.example` / `docs/deployment.md` document
  NODE_ENCRYPTION_KEY vs PLUGIN_CONFIG_ENCRYPTION_KEY correctly (cycle-1 F4).
- deploy-docker.sh header comments match behavior for all flags checked
  (SKIP_*, LANGUAGE_FILTER presets incl. `everything`, DEPLOY_INSTANCE,
  SUDO_PASSWORD fallback, DEPLOY_SSH_RETRY_MAX clamp).
- The claim-query invariant comments added by F1 accurately describe
  Postgres CTE semantics (verified: two modifying CTEs may not update the
  same row; the `<>` guard plus SET-side compensation is the correct shape).

## Carried doc items
- DOC-C5-2 (`staleClaimTimeoutMs` doc field), C7-DS-1 (README /api/v1/time)
  — unchanged preconditions, carried in the register.
