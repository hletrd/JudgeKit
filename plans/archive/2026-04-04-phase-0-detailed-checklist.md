# Phase 0 detailed checklist — release-readiness hotfixes

## Objective
Get JudgeKit back to a trustworthy baseline before policy hardening:
- TypeScript green
- server-action/chat rate-limiting fixed
- failing unit contracts repaired
- no new feature work mixed into this PR

---

## Scope
This phase is intentionally narrow.

### In scope
- Missing `await` on `checkServerActionRateLimit(...)`
- Unit tests broken by the async mismatch
- Unit tests broken by audit buffering / pruning behavior drift
- Unit tests broken by login-event write-path drift
- Unit tests broken by `db.transaction` mock mismatch in rate-limit tests
- Contest route tests broken by outdated CSRF/test contract assumptions

### Out of scope
- AI policy changes
- recruiting mode
- anti-cheat summaries
- file authorization fix
- HTML sanitizer tightening

---

## Lane A — Fix async rate-limit misuse first

### A1. Patch every broken call site
`checkServerActionRateLimit` is async at:
- `src/lib/security/api-rate-limit.ts:151-207`

Patch these call sites first:
- `src/app/api/v1/plugins/chat-widget/chat/route.ts:136-145`
- `src/lib/actions/plugins.ts:27-28, 78-79`
- `src/lib/actions/language-configs.ts:39-40, 84-85, 148-149, 226-227, 279-280`
- `src/lib/actions/system-settings.ts` (same pattern)
- `src/lib/actions/tag-management.ts:33-34, 79-80, 124-125`
- `src/lib/actions/user-management.ts:74-75, 143-144, 210-211, 335-336`

### A2. Keep the patch style uniform
Preferred pattern:
```ts
const rateLimit = await checkServerActionRateLimit(...);
if (rateLimit) return ...;
```

Do **not** redesign the helper in this PR unless absolutely necessary.

### A3. Immediate verification after Lane A
Run:
- `npx tsc --noEmit`
- `npx vitest run tests/unit/api/plugins.route.test.ts`

Expected outcome:
- many TS2801 errors disappear
- plugin/chat route tests shift from false 403/500 behavior toward real assertions

---

## Lane B — Repair plugin/chat route contract tests

### B1. Primary files
- Route: `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- Tests: `tests/unit/api/plugins.route.test.ts`

### B2. Known likely mismatch
The route currently performs async rate-limit check but previously behaved as always-truthy because of missing `await`.
That likely explains failures such as:
- expected 200, got 403
- provider mocks not called
- route short-circuiting before stream/tool path

### B3. Fix order
1. Finish Lane A first.
2. Re-run plugin tests.
3. Only then adjust tests that were asserting buggy behavior.
4. Preserve intended behavior:
   - 404 when plugin disabled
   - 403 when AI disabled by policy/config
   - 200 for valid coursework chat
   - tool-calling path when `problemId` exists

### B4. Verification
Run:
- `npx vitest run tests/unit/api/plugins.route.test.ts`

---

## Lane C — Repair contest route test contracts

### C1. Primary files
- Join route: `src/app/api/v1/contests/join/route.ts`
- Access-code route: `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`
- Leaderboard route: `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts`
- Tests: `tests/unit/api/contests.route.test.ts`

### C2. Most likely root cause
The tests still construct requests with `x-csrf-token`:
- `tests/unit/api/contests.route.test.ts:110-131`

But the real CSRF gate uses `X-Requested-With` via:
- `src/lib/security/csrf.ts`
- `src/lib/api/client.ts:25-35`
- `src/lib/api/handler.ts:117-127`

So these tests are probably stale versus the project’s current CSRF contract.

### C3. Plan
1. Update test helpers to send the real header contract.
2. Re-check whether any route logic also changed around auth/role mocks.
3. Keep production code unchanged unless the route itself is actually wrong.

### C4. Verification
Run:
- `npx vitest run tests/unit/api/contests.route.test.ts`

---

## Lane D — Stabilize audit event tests around buffered writes

### D1. Primary files
- Impl: `src/lib/audit/events.ts:83-199`
- Tests: `tests/unit/audit/events.test.ts`

### D2. Likely mismatch
The implementation now buffers writes and flushes by interval/threshold:
- `_auditBuffer`
- `flushAuditBuffer()`
- `startAuditEventPruning()`

But tests appear to still assume immediate insert/log semantics in several places.

### D3. Decision rule
Prefer preserving the current buffering design if it is intentional and useful.
Only change implementation if tests reveal a real regression, not just old assumptions.

### D4. Specific checks
- `recordAuditEvent()` should either:
  - update health state correctly after failed flushes, and
  - expose deterministic behavior for tests via explicit `flushAuditBuffer()` or controlled timers
- `startAuditEventPruning()` should not duplicate intervals
- `stopAuditEventPruning()` should reliably clear the active interval

### D5. Test strategy
- Make tests explicitly flush when they need DB insert assertions
- Use fake timers consistently for prune interval assertions
- Reset module state carefully between tests

### D6. Verification
Run:
- `npx vitest run tests/unit/audit/events.test.ts`

---

## Lane E — Stabilize login-events tests

### E1. Primary files
- Impl: `src/lib/auth/login-events.ts:81-113`
- Tests: `tests/unit/auth/login-events.test.ts`

### E2. Likely mismatch
The implementation uses fire-and-forget insert via `void db.insert(...).values(...)` inside `try`, which may differ from what tests expect about `.run()` or synchronous invocation shape.

### E3. Plan
1. Verify the actual DB call chain used by the current code.
2. Update mocks/tests to match real insertion flow.
3. Only change implementation if there is a genuine swallowed-error or missing-write bug.

### E4. Verification
Run:
- `npx vitest run tests/unit/auth/login-events.test.ts`

---

## Lane F — Fix rate-limit tests to reflect transaction-based implementation

### F1. Primary files
- Impl: `src/lib/security/rate-limit.ts`
- Tests: `tests/unit/security/rate-limit.test.ts`

### F2. Known failure
Observed error:
- `db.transaction is not a function`

This strongly suggests the test mocks lag behind the implementation.

### F3. Plan
1. Update the DB mock shape to include `transaction(async (tx) => ...)`.
2. Ensure tx mock supports `select / insert / update / delete` as needed.
3. Avoid changing production rate-limit logic unless tests reveal an actual logic defect.

### F4. Verification
Run:
- `npx vitest run tests/unit/security/rate-limit.test.ts`

---

## Lane G — Final TypeScript cleanup

After Lanes A–F, rerun:
- `npx tsc --noEmit`

If any residual errors remain:
1. Group them by file
2. Fix only the minimum needed
3. Re-run the targeted tests for that file area

---

## Recommended execution order
1. Lane A
2. Lane B
3. Lane C
4. Lane F
5. Lane D
6. Lane E
7. Lane G
8. Full unit run

Reasoning:
- A unblocks core correctness
- B/C are most likely direct fallout from A and stale request contracts
- F is isolated infra-mock repair
- D/E are local test/impl contract stabilization

---

## Mandatory verification sequence

### Fast loop after each lane
- targeted `vitest` file
- if route/action touched, re-run `npx tsc --noEmit`

### End-of-phase gate
- `npx tsc --noEmit`
- `npx vitest run --config vitest.config.ts`

### Nice-to-have if environment recovers
- `cd judge-worker-rs && cargo test`

---

## Exit criteria for Phase 0
- No missing-`await` rate-limit sites remain
- Plugin chat route tests are green
- Contest route tests are green
- Audit/login-events/rate-limit suites are green
- `npx tsc --noEmit` is green
- No policy or feature work snuck into the PR
