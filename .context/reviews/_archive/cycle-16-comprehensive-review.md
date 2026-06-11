# Cycle 16 — Comprehensive Review (2026-05-11)

**Date:** 2026-05-11
**HEAD reviewed:** `5a400792`
**Prior aggregate:** `_aggregate-cycle-15.md` (HEAD `af634e63`)

---

## Summary

The codebase has not changed since cycle 15 (`af634e63`). Commit `5a400792` only adds documentation files (cycle 15 review artifacts). Therefore, this cycle's review focuses on:

1. Re-verification of all prior deferred findings
2. Fresh sweeps of high-risk areas to ensure no regression
3. Verification that recently-added files (since April 20) remain in good standing

**Result: 0 new findings.** The codebase remains in a mature, well-hardened state after 15 prior cycles of remediation.

---

## Review Coverage

### Files added since April 20 (post-initial review cycles)

Verified the following recently-added files:

| File | Status | Notes |
|---|---|---|
| `src/lib/abort.ts` | Clean | Proper AbortSignal composition, WeakMap cleanup, timer leak prevention |
| `src/components/exam/anti-cheat-storage.ts` | Clean | localStorage bounds (MAX_PENDING_EVENTS=200), validation, try/catch |
| `src/hooks/use-visibility-polling.ts` | Clean | Proper cleanup, jitter to prevent thundering herd, error isolation |
| `src/app/api/v1/auth/forgot-password/route.ts` | Clean | Zod validation, dual rate-limiting (IP + email), proper error responses |
| `src/app/api/v1/auth/reset-password/route.ts` | Clean | Token validation, password length check, clear error paths |
| `src/app/(auth)/forgot-password/forgot-password-form.tsx` | Clean | AbortController cleanup, loading states, a11y attributes |
| `src/lib/security/rate-limit.ts` | Clean | DB time consistency, TOCTOU protection, exponential backoff |
| `src/lib/security/api-rate-limit.ts` | Clean | Two-tier (sidecar + DB), WeakMap dedup, proper headers |
| `src/lib/security/rate-limit-core.ts` | Clean | Shared primitives, SELECT FOR UPDATE, parameterized queries |
| `src/lib/db-time.ts` | Clean | React.cache for dedup, throws on failure (no silent fallback) |
| `src/lib/db/queries.ts` | Clean | WARNING comments on runtime validation, namedToPositional parameterization |
| `src/lib/platform-mode-context.ts` | Clean | Parameterized raw SQL via @name -> $N conversion |
| `src/lib/auth/sign-out.ts` | Clean | Prefix-based storage cleanup, proper error handling, resets loading state |

### Sweeps performed

- **Security:** No `eval()`, no unsanitized `dangerouslySetInnerHTML` (2 usages both with sanitization), no `@ts-ignore`, no `@ts-expect-error`
- **Error handling:** No empty catch blocks; all catches either log, return fallback, or propagate meaningfully
- **Race conditions:** All `Promise.all` usages verified for error handling; rate limits use transactions with `SELECT FOR UPDATE`
- **Type safety:** No `any` abuse; 2 `eslint-disable` directives both with documented justifications
- **Memory leaks:** All `setTimeout`/`setInterval` usages verified for cleanup; event listeners properly removed in useEffect cleanup
- **SQL injection:** All raw SQL uses parameterized queries via `namedToPositional`; no string interpolation of user input
- **Auth:** All auth API routes have rate limiting, input validation, and proper error responses
- **Console usage:** Console sites verified legitimate (errors, warnings, or debug logs in appropriate contexts)
- **Tracking classes:** All `tracking-wide`/`tracking-wider` usages are conditional on `locale !== "ko"` per CLAUDE.md
- **Storage cleanup:** `localStorage.clear()` / `sessionStorage.clear()` replaced with prefix-based targeted removal

---

## Prior Deferred Findings — Status Verification

All deferred findings from `_aggregate-cycle-15.md` remain properly deferred with valid exit criteria. None have become actionable since no code changes occurred and no new telemetry/performance data has been introduced.

Key deferred items verified still present:
- C3-AGG-5/6: deploy-docker.sh modularization (LOW)
- C2-AGG-5/6: polling component consolidation, practice page performance (LOW)
- C1-AGG-3: client console.error sites (LOW)
- D1/D2: JWT clock-skew and DB query per request (MEDIUM)
- AGG-2: Rate-limit Date.now + overflow sort (MEDIUM)
- ARCH-CARRY-1: Raw API handlers (MEDIUM)
- PERF-3: Anti-cheat dashboard query (MEDIUM)
- F3/F5: Candidate PII encryption, JWT callback optimization (MEDIUM)

Historical cycle-16 findings (from April 19, commit `9bb13834`) verified as resolved at current HEAD:
- PublicHeader signOut error handling -> fixed by `handleSignOutWithCleanup`
- AppSidebar tracking-wider on Korean -> component no longer exists, all current usages are locale-conditional
- localStorage.clear() on sign-out -> replaced with prefix-based cleanup in `sign-out.ts`
- cleanupOrphanedContainers redundant docker inspect -> now parses CreatedAt from docker ps output
- Deprecated recruitingInvitations.token column -> removed from schema, only tokenHash remains
- redeemRecruitingToken new Date() check -> removed, relies on SQL atomic check
- SSE duplicate terminal-state paths -> extracted into shared helper

---

## Methodology

- Full reads of recently-added files (13 files)
- Targeted grep sweeps: `eval`, `dangerouslySetInnerHTML`, `@ts-ignore`, `eslint-disable`, empty catches, `Date.now`, `Math.random`, `console.*`, raw SQL, `Promise.all`, `tracking-wider`, `localStorage.clear`
- Cross-reference with prior cycle findings to verify no regressions
- Single-agent comprehensive review (Agent tool not available in this environment)
