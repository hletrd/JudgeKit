# RPF Cycle 7 (Loop Cycle 7/100) — Review Remediation Plan

**Date:** 2026-04-24
**Cycle:** 7/100 (new RPF loop)
**Base commit:** b0666b7a (cycle 6 — no new findings)
**HEAD commit:** b0666b7a

## Findings to Address

This cycle found **9 new findings** across 11 review agents, breaking the "no new findings" streak from cycles 52-55 / 1-6. Two findings are MEDIUM severity and should be fixed this cycle.

## Scheduled Implementation Tasks

### TASK-1: Fix `/api/v1/time` to use DB server time [MEDIUM]

**Source:** AGG-1 (flagged by 6 agents: code-reviewer, security-reviewer, architect, debugger, designer, test-engineer)
**Files:** `src/app/api/v1/time/route.ts`

**Current behavior:** Returns `Date.now()` (app server wall clock).
**Expected behavior:** Returns DB server time via `getDbNowMs()`, consistent with all other server-side temporal comparisons.

**Implementation:**
1. Add `import { getDbNowMs } from "@/lib/db-time";`
2. Change `return NextResponse.json({ timestamp: Date.now() });` to `return NextResponse.json({ timestamp: await getDbNowMs() });`
3. Add `export const dynamic = "force-dynamic";` to prevent caching
4. Add a unit test for the time route (AGG-5)

### TASK-2: Null out plaintext recruiting tokens in DB [MEDIUM]

**Source:** AGG-2 (flagged by security-reviewer, tracer)
**Files:** `src/lib/db/schema.pg.ts` (schema), migration file (new)

**Current behavior:** `recruitingInvitations.token` column still contains plaintext tokens for legacy rows.
**Expected behavior:** Plaintext tokens should be NULLed out; only `tokenHash` is needed for lookups.

**Implementation:**
1. Create a Drizzle migration that:
   - `UPDATE recruiting_invitations SET token = NULL WHERE token IS NOT NULL;`
   - Drops the `ri_token_idx` unique index on the plaintext `token` column (since `ri_token_hash_idx` already covers lookups)
2. Verify that no code path reads `recruitingInvitations.token` for auth purposes (only `tokenHash` is used)

### TASK-3: Add warning log for decrypt plaintext fallback [LOW]

**Source:** AGG-7
**Files:** `src/lib/security/encryption.ts:79-81`

**Implementation:**
1. Add `import { logger } from "@/lib/logger";`
2. When the plaintext fallback fires (input doesn't start with `enc:`), log a warning in production:
   ```ts
   if (process.env.NODE_ENV === "production") {
     logger.warn({ prefix: encoded.slice(0, 10) }, "[encryption] decrypt() called on non-encrypted value — possible data tampering or incomplete migration");
   }
   ```

## Deferred Items

### New Deferrals This Cycle

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 24 | SSE connection tracking O(n) eviction | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` (AGG-3) | LOW / HIGH | Bounded at 1000 entries; rarely at capacity; not a correctness issue | Performance optimization cycle |
| 25 | In-memory rate limit O(n log n) eviction sort | `src/lib/security/in-memory-rate-limit.ts:41-47` (AGG-4) | LOW / HIGH | Bounded at 10000 entries; inline sort only on overflow; not a correctness issue | Performance optimization cycle |
| 26 | No test for participant-status time boundaries | `src/lib/assignments/participant-status.ts` (AGG-6) | LOW / MEDIUM | Functions accept injectable `now` param; correct design; tests are nice-to-have | Test coverage cycle |
| 27 | `console.error`/`console.warn` in 19 client components | multiple files (AGG-8) | LOW / HIGH | Client-side only; no security/correctness impact | Module refactoring cycle |
| 28 | Dual rate-limiting module documentation | `src/lib/security/rate-limit*.ts` (AGG-9) | LOW / MEDIUM | Advisory; no code change needed | Documentation cycle |

### Carried-Over Deferred Items (from cycle 6 — 23 active)

All 23 items from cycle 6 remain active with original severity/confidence preserved. See `plans/open/2026-04-24-rpf-cycle-6-review-remediation.md` for the full table.

**Total active deferred: 28** (23 carried + 5 new)

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred. AGG-1 and AGG-2 are both scheduled for implementation this cycle.
- All deferred items have file+line citation, original severity preserved, concrete reason, and concrete exit criterion.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push anticipated.

## Progress Log

- 2026-04-24: Plan created. 3 tasks scheduled (2 MEDIUM, 1 LOW). 5 new deferred items. Active deferred count: 28.
