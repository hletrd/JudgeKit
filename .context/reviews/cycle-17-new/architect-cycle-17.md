# Cycle 17 — Architect (Manual)

**Date:** 2026-05-09
**HEAD reviewed:** `32464e55`
**Agent status:** Agent tool unavailable; performed manually by orchestrator

---

## Focus Areas

- Architectural risks in the signal composition layer
- Module coupling and cohesion
- Design risks from cycle-16 fixes
- Layering violations

---

## Findings

### C17-AR-1: Abort signal utilities should be centralized [LOW]

- **File:** `src/lib/api/client.ts`, `src/lib/docker/client.ts`
- **Confidence:** High
- **Problem:** `withTimeout` and `createTimeoutSignal` are private, duplicated functions in two unrelated modules. This violates the single-source-of-truth principle. If a bug is found in one copy (e.g., the already-aborted signal issue), both copies must be fixed. Risk of divergence is high.
- **Architectural recommendation:** Create `src/lib/abort.ts` (or add to `src/lib/utils.ts`) with exported `withTimeout(signal, ms)` and `createTimeoutSignal(ms)`. Both `api/client.ts` and `docker/client.ts` should import from this shared module. This is a pure refactor with no behavior change.
- **Cross-file impact:** Any future module that needs signal composition (e.g., compiler client, rate limiter client) should reuse the same utilities instead of creating a third copy.

---

## Verified Architecture

- Auth layer (`createApiHandler`, `getApiUser`): Properly layered, CSRF checks correct
- Docker client: Properly abstracts local vs remote worker paths
- API client: Clean separation between `apiFetch` (raw fetch) and `apiFetchJson` (parsed JSON)
- No layering violations introduced by cycle-16 fixes

---

## Areas Examined

- Module dependency graph around fetch utilities
- Auth middleware layering
- Docker abstraction boundary
- Test organization
