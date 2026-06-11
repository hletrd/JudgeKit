# Cycle 6 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 528cdf29
**Review artifacts:** `cycle-6-code-reviewer.md`, `cycle-6-security-reviewer.md`, `cycle-6-architect.md`, `cycle-6-critic.md`, `cycle-6-debugger.md`, `cycle-6-verifier.md`, `cycle-6-perf-reviewer.md`, `cycle-6-test-engineer.md`, `cycle-6-tracer.md`, `cycle-6-designer.md`, `cycle-6-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Contest detail page and problem page use `new Date()` for access-control-adjacent temporal comparisons [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1, CR-2), security-reviewer (SEC-1, SEC-2, SEC-4), architect (ARCH-1), critic (CRI-1, CRI-2), debugger (DBG-1, DBG-2), verifier (V-1), tracer (TR-1), designer (DES-1, DES-2), document-specialist (DOC-1), test-engineer (TE-1, TE-2)
**Files:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:188-192`, `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:159,187-189`
**Description:** Two server component pages use `new Date()` for temporal comparisons that control access-control-adjacent behavior:
1. **Contest detail page** (line 188-192): `isUpcoming` and `isPast` flags determine whether contest problems are visible. If `isUpcoming` is true, problems are hidden. This is security-relevant for exam integrity — seeing problems early gives an unfair advantage.
2. **Problem page** (line 159): `new Date(assignment.startsAt) > new Date()` blocks access before contest start for non-admin users. If the app server clock is behind the DB clock, users could see problems before the official start.
3. **Problem page** (lines 187-189): `isSubmissionBlocked` uses `new Date()` to control whether the submit button is enabled. This creates a UX mismatch with API enforcement.

The codebase has `getDbNow()` (React.cache-wrapped) specifically designed for server components, and previous cycles fixed the recruit page and 6 API routes to use DB-sourced time. These 2 pages were not included in the previous fix cycle.
**Concrete failure scenario:** During a proctored exam, if the app server clock is 30 seconds behind the DB server clock, students can see exam problems 30 seconds before the official start time on the contest detail page. This undermines exam fairness.
**Fix:** Replace `const now = new Date()` with `const now = await getDbNow()` in both server components.
**Cross-agent signal:** 10 of 11 agents flagged this — very high signal.

### AGG-2: Quick-create contest route stores app-server time as default `startsAt` [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-4), security-reviewer (SEC-3), critic (CRI-3), debugger (DBG-3), verifier (V-2), tracer (TR-2), test-engineer (TE-3)
**Files:** `src/app/api/v1/contests/quick-create/route.ts:28-32`
**Description:** When `body.startsAt` is not provided, `const now = new Date()` is stored as the default `startsAt`. When `body.deadline` is not provided, `new Date(now.getTime() + 30 * 24 * 3600000)` is stored as the default `deadline`. These stored values are from the app server clock, while exam session enforcement and submission deadline checks use DB time (`NOW()` or `getDbNowUncached()`).
**Concrete failure scenario:** Admin creates a quick contest for a recruiting exam. The app server clock is 5 seconds behind the DB clock. The stored `startsAt` is 5 seconds behind the actual DB time. Exam session enforcement (using `SELECT NOW()`) considers the contest started 5 seconds before the stored `startsAt`. Students starting their exam session immediately have a 5-second discrepancy in their remaining time.
**Fix:** Use `await getDbNowUncached()` for the default `startsAt` value and for the `deadline` default calculation.
**Cross-agent signal:** 7 of 11 agents flagged this — high signal.

### AGG-3: Groups page and student dashboard use `new Date()` for display-only status [LOW/LOW]

**Flagged by:** code-reviewer (CR-3), critic (CRI-4), architect (ARCH-1)
**Files:** `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304-308`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24,98,101-106`, `src/app/(dashboard)/dashboard/contests/page.tsx:95`
**Description:** These pages use `new Date()` for assignment status display (upcoming/open/closed). The actual access control is enforced by API routes using DB time. The display is cosmetic only.
**Concrete failure scenario:** An assignment appears as "open" in the groups list but the API correctly enforces the deadline. Minor UX inconsistency.
**Fix:** Low priority — could use `getDbNow()` for consistency but no security impact.

### AGG-4: Submission insert `submittedAt` uses app-server time [LOW/LOW]

**Flagged by:** code-reviewer (CR-5), architect (ARCH-2)
**Files:** `src/app/api/v1/submissions/route.ts:317`
**Description:** `submittedAt: new Date()` in the submission insert uses app-server time. The deadline check on line 298 correctly uses `NOW()` in SQL, so access control is correct. But the stored timestamp is from a different clock than the enforcement.
**Concrete failure scenario:** A submission is recorded as submitted at 12:00:00 (app server) when the DB time is 11:59:58. The deadline enforcement (using `NOW()`) is correct, but the stored `submittedAt` is 2 seconds off.
**Fix:** Consider using the schema's DEFAULT for `submittedAt` or capturing `NOW()` from the transaction.

### AGG-5: No test coverage for contest detail page, problem page, and quick-create temporal logic [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1, TE-2, TE-3)
**Files:** N/A — test gaps
**Description:** No tests verify that the contest detail page, problem page, or quick-create route use DB-sourced time for temporal comparisons. When these are fixed, tests should confirm the behavior.
**Fix:** Add targeted tests for the temporal comparison logic after the fixes.

## Verified Safe / No New Regression Found

- All previously fixed clock-skew issues are confirmed working (recruit page, 6 API routes).
- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting.
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Only 2 eslint-disable directives, both justified.
- Encryption module properly validates key in production.
- Import/export routes properly require password re-confirmation and enforce size limits.
- SQL LIKE queries all properly use `escapeLikePattern()`.
- Shell command validation has dual-layer defense.
- CSRF protection is in place for server actions.
- Rate limiting has two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE).
- Korean letter-spacing is properly locale-conditional.

## Agent Failures

None. All review perspectives completed successfully.
