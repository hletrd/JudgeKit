# Cycle 12b Aggregate Review

**Date:** 2026-04-20
**Base commit:** feeb4a30
**Review artifacts:** `cycle-12b-code-reviewer.md`, `cycle-12b-security-reviewer.md`, `cycle-12b-perf-reviewer.md`, `cycle-12b-architect.md`, `cycle-12b-critic.md`, `cycle-12b-verifier.md`, `cycle-12b-test-engineer.md`, `cycle-12b-debugger.md`, `cycle-12b-designer.md`, `cycle-12b-tracer.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Server components use `new Date()` for deadline/status comparisons — clock-skew display inconsistency with API enforcement [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1, CR-2, CR-3, CR-4), security-reviewer (SEC-1), architect (ARCH-1), critic (CRI-1, CRI-3), verifier (V-1), debugger (DBG-1, DBG-2), tracer (Flow 1), test-engineer (TE-1), designer (DES-1 partial)
**Files:** `src/app/(dashboard)/dashboard/contests/page.tsx:95`, `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`, `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24`
**Description:** Four server components use `new Date()` (app-server clock) for temporal comparisons against DB-stored deadlines and startsAt values. The recruit page was fixed in cycle 27 to use `getDbNow()` for the same class of issue, but the fix was not applied comprehensively. Under clock skew, the displayed status (upcoming/open/closed/past) can disagree with the API enforcement (which uses SQL NOW() or getDbNowUncached()). This is a display inconsistency, not an enforcement bypass — the API correctly enforces deadlines. However, it damages user trust when the page says "open" but the API rejects the submission (or vice versa).
**Cross-agent signal:** 10 of 10 agents flagged this independently — very high signal. Same class of issue as cycle-27 AGG-1.
**Fix:** Use `getDbNow()` in all four server components for temporal comparisons. Move the Date creation outside any `.map()` callbacks.

### AGG-2: `getContestStatus` and `selectActiveTimedAssignments` default to `new Date()` — footgun encourages clock-skew [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-5), architect (ARCH-1), critic (CRI-2), tracer (Flow 3)
**Files:** `src/lib/assignments/contests.ts:33`, `src/lib/assignments/active-timed-assignments.ts:17`
**Description:** Both functions have `now: Date = new Date()` as a default parameter. While callers can provide DB time, the default makes it easy to accidentally use app-server time. The `getActiveTimedAssignmentsForSidebar` wrapper correctly uses `getDbNow()`, but direct callers (like `contests/page.tsx`) pass `new Date()` from the calling code.
**Cross-agent signal:** 4 agents flagged this.
**Fix:** Remove the default parameter from `getContestStatus` so callers must be explicit. Add JSDoc explaining that `now` should come from `getDbNow()` in server components. Keep the default in `selectActiveTimedAssignments` only if it has a legitimate client-side use case (it does not — it's only called from `getActiveTimedAssignmentsForSidebar`).

### AGG-3: `migrate/export` route uses `new Date()` for filename — inconsistent with backup route [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-6), security-reviewer (SEC-2), verifier (V-2), tracer (Flow 2)
**Files:** `src/app/api/v1/admin/migrate/export/route.ts:81`
**Description:** The export route uses `new Date().toISOString()` for the filename timestamp, while the backup route (which performs the same operation) uses `getDbNowUncached()`. The filenames for backup vs. export could differ by the clock-skew amount.
**Cross-agent signal:** 4 agents flagged this.
**Fix:** Use `getDbNowUncached()` in the export route to match the backup route.

### AGG-4: No test coverage for server component DB-time usage or `getContestStatus` [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1, TE-2, TE-3)
**Files:** No test file for `src/lib/assignments/contests.ts` or `src/lib/assignments/active-timed-assignments.ts`
**Description:** No test verifies that server components use `getDbNow()` for temporal comparisons. No unit test for `getContestStatus` boundary conditions. No unit test for `selectActiveTimedAssignments` filtering/sorting.
**Cross-agent signal:** 1 agent (test-engineer) flagged multiple aspects.
**Fix:** Add unit tests for `getContestStatus` covering all status values and boundary conditions. Add targeted tests verifying server component DB-time usage (following the pattern from `recruit-page-metadata.test.ts`).

### AGG-5: `recruiting-invitations-panel.tsx:253` uses `toLocaleDateString` instead of shared datetime utility [LOW/LOW]

**Flagged by:** designer (DES-2)
**Files:** `src/components/contest/recruiting-invitations-panel.tsx:253`
**Description:** The invitation panel's `formatDate` function uses `toLocaleDateString(locale, {...})` instead of the shared `formatDateTimeInTimeZone` utility. This could produce inconsistent formatting compared to other date displays in the app.
**Cross-agent signal:** 1 agent flagged this.
**Fix:** Use `formatDateTimeInTimeZone()` for consistency with the rest of the app.

### AGG-6: `sanitizeHtml` allows root-relative `<img src>` — potential internal resource enumeration [LOW/LOW]

**Flagged by:** security-reviewer (SEC-3)
**Files:** `src/lib/security/sanitize-html.ts:9-15`
**Description:** The DOMPurify hook allows `<img src="/...">` for root-relative paths. An instructor could embed an image pointing to an internal API endpoint. The request would fail (no auth cookies from an img tag), but the response status code could leak information about internal endpoints.
**Cross-agent signal:** 1 agent flagged this with LOW confidence.
**Fix:** Consider restricting root-relative image URLs to a whitelist of paths, or rely on Content-Security-Policy to restrict img-src.

## Previously Deferred Items (Carried Forward)

- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt (MEDIUM)
- D2: JWT callback DB query on every request — add TTL cache (MEDIUM)
- D3: SSE route refactoring — extract connection tracking and polling (MEDIUM)
- D4: SSE submission events route capability check incomplete (MEDIUM)
- D5: Test coverage gaps for workspace-to-public migration (MEDIUM)
- D6: Metrics endpoint dual auth paths without rate limiting (MEDIUM)
- D7: Internal cleanup endpoint has no rate limiting (LOW)
- D8: `localStorage.clear()` clears all storage for origin (LOW)
- D9: `rateLimits` table used for SSE connections and heartbeats (LOW)
- D10: Backup/restore/migrate routes use manual auth pattern (LOW)
- D11: Files/[id] DELETE/PATCH manual auth (LOW)
- D12: SSE re-auth rate limiting (LOW)
- D13: PublicHeader click-outside-to-close (LOW)
- D14: `namedToPositional` regex alignment (LOW)
- D15: `tracking-wide`/`tracking-wider` Korean text risk (LOW)
- D16: SSE shared poll timer interval not adjustable at runtime (LOW)
- D17: Export abort does not cancel in-flight DB queries (LOW)
- D18: Deprecated `recruitingInvitations.token` column still has unique index (LOW)
- D19: `validateExport` missing duplicate table name check (LOW)
- DEFER-1 (cycle 27): Migrate raw route handlers to `createApiHandler` (LOW/MEDIUM)
- DEFER-2 (cycle 27): SSE connection tracking eviction optimization (LOW/LOW)
- DEFER-3 (cycle 27): SSE connection cleanup test coverage (LOW/LOW)

## Agent Failures

None. All review perspectives completed successfully.
