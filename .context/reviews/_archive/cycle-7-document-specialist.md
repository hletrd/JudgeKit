# Document Specialist — Cycle 7 Deep Review

**Date:** 2026-04-20
**Scope:** Doc/code mismatches against authoritative sources

---

## Findings

### MEDIUM 1 — `db-time.ts` documentation says "use this instead of new Date() for temporal comparisons" but multiple security-relevant paths still use `new Date()`

**Confidence:** HIGH
**Files:**
- `src/lib/db-time.ts:7-10` (doc comment)
- `src/lib/assignments/public-contests.ts:30,124`
- `src/lib/assignments/active-timed-assignments.ts:15,44`
- `src/app/api/v1/users/[id]/route.ts:164,185,218,260,466`
- `src/lib/actions/user-management.ts:114,308`
- `src/lib/actions/change-password.ts:75`

**Problem:** The `db-time.ts` module documentation states "Use this instead of `new Date()` for temporal comparisons (expiry, deadline) in server components and API routes to avoid clock skew." However, multiple paths still use `new Date()` for temporal comparisons. This creates a doc/code mismatch where developers may believe all security-relevant paths have been migrated, when in fact some have not.

**Suggested fix:**
1. Migrate the remaining paths to use `getDbNow()`/`getDbNowUncached()`.
2. Update the `db-time.ts` doc comment to list which paths have been migrated and which remain.
3. Or: add a broader doc in `.context/development/conventions.md` about the DB-time discipline.

---

### LOW 1 — AGENTS.md language version table may drift from `src/lib/judge/languages.ts`

**Confidence:** LOW
**Files:**
- `AGENTS.md:21` ("Treat `src/lib/judge/languages.ts` and `docs/languages.md` as the source of truth when the static table below drifts.")
- `AGENTS.md:42` (Rust 1.94)
- `AGENTS.md:12` (Python 3.14)

**Problem:** The AGENTS.md notes that the language version table may drift and defers to `src/lib/judge/languages.ts` as the source of truth. This is properly documented but could still confuse developers who read the static table without noticing the disclaimer.

**No fix needed** — the disclaimer is already present.

---

## Final sweep

No additional doc/code mismatches found. The CLAUDE.md deployment rules are consistent with the actual `deploy-docker.sh` behavior. The API docs in `docs/api.md` are consistent with the route handlers.
