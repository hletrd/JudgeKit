# Cycle 51 — Document Specialist

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** document-specialist

## Doc-Code Mismatch Assessment

### 1. CLAUDE.md Rules vs Code Behavior

**Rule:** "Keep Korean text at the browser/font default letter spacing. Do not apply custom `letter-spacing`..."
**Evidence:** Grep for `tracking-` and `letter-spacing` in Korean-facing components found no violations.
**Verdict:** COMPLIANT

**Rule:** "Never run `docker system prune --volumes` on any production server"
**Evidence:** No `docker system prune` commands found in source code.
**Verdict:** COMPLIANT

**Rule:** "algo.xylolabs.com is the app server... worker-0.algo.xylolabs.com is the dedicated judge worker"
**Evidence:** The deploy script uses `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, `INCLUDE_WORKER=false` per the CLAUDE.md rules.
**Verdict:** COMPLIANT

### 2. JSDoc and Code Comments

- `getDbNowUncached` has accurate JSDoc explaining when to use it vs `getDbNow`.
- `redeemRecruitingToken` has detailed inline comments explaining the clock-skew avoidance strategy.
- `buildIoiLatePenaltyCaseExpr` has comprehensive JSDoc with parameter requirements.
- SSE route has clear comments explaining the stale connection cleanup and shared polling patterns.
- Anti-cheat route has comments explaining the 5000-row heartbeat query cap.

### 3. API Route Documentation

The API routes use `createApiHandler` with structured schema validation (Zod), which serves as implicit documentation. The SSE route is documented as "not migrated to createApiHandler due to streaming response."

## Findings

### DOC-1: SSE route ADR (deferred from prior cycles)

**Status:** Deferred — the SSE route bypasses `createApiHandler` for valid technical reasons, but an Architectural Decision Record (ADR) documenting this choice would help future maintainers.

### DOC-2: Docker client dual-path docs (deferred from prior cycles)

**Status:** Deferred — the Docker client in `src/lib/docker/client.ts` has dual code paths (Docker Socket vs Docker Engine API) that would benefit from clearer documentation of when each path is used.

No new doc-code mismatches found this cycle.
