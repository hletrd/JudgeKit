# RPF Cycle 42 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 42/100
**Base commit:** 8912b987
**Status:** Done

## Lanes

### Lane 1: Validate `problemPoints` length matches `problemIds` in quick-create schema [AGG-1]

**Severity:** MEDIUM/MEDIUM (9 of 11 perspectives)
**File:** `src/app/api/v1/contests/quick-create/route.ts:12-21,89`
**Status:** Done

**Tasks:**
- [x] Add `.refine()` to `quickCreateSchema` validating `problemPoints.length === problemIds.length` when `problemPoints` is provided
- [x] Verify TypeScript compiles without errors
- [x] Run existing tests to confirm no regressions
- [x] Commit with message: `fix(contests): 🐛 validate problemPoints length matches problemIds in quick-create`

**Commit:** 22df4779

---

### Lane 2: Add capability-based auth to access-code routes [AGG-2]

**Severity:** LOW/MEDIUM (6 of 11 perspectives)
**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts:8-45`
**Status:** Done

**Tasks:**
- [x] Add `auth: { capabilities: ["contests.manage_access_codes"] }` to GET handler's `createApiHandler` config
- [x] Add `auth: { capabilities: ["contests.manage_access_codes"] }` to POST handler's `createApiHandler` config
- [x] Add `auth: { capabilities: ["contests.manage_access_codes"] }` to DELETE handler's `createApiHandler` config
- [x] Verify the capability name exists and is appropriate (check `src/lib/capabilities/`)
- [x] Verify TypeScript compiles without errors
- [x] Run existing tests to confirm no regressions
- [x] Commit with message: `fix(auth): 🐛 add capability-based auth to access-code route handlers`

**Commit:** 1e2a8b76

---

### Lane 3: Remove redundant non-null assertion in `resetRecruitingInvitationAccountPassword` [AGG-3]

**Severity:** LOW/LOW (3 of 11 perspectives)
**File:** `src/lib/assignments/recruiting-invitations.ts:253`
**Status:** Done

**Tasks:**
- [x] Replace `invitation.userId!` with a locally captured `userId` constant after the null guard
- [x] Verify TypeScript compiles without errors (type narrowing works via local const)
- [x] Commit with message: `refactor(invitations): ♻️ remove redundant non-null assertion on userId`

**Commit:** 9ede3eea

---

### Lane 4: Run quality gates

**Severity:** Required
**Status:** Done

**Tasks:**
- [x] Run `eslint` — passed (exit 0)
- [x] Run `npm run build` — passed
- [x] Run `npm run test:unit` — passed (294 test files, 2116 tests)
- [x] Run `npm run test:component` — skipped (no DB connection)
- [x] No gate failures

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-3: Redundant non-null assertion | recruiting-invitations.ts:253 | LOW/LOW | Safe today; cosmetic improvement; included as Lane 3 since trivial | N/A (being fixed this cycle) |
| Prior AGG-2: Audit logs LIKE-based JSON search | audit-logs/page.tsx:150 | LOW/LOW | Works today; robustness improvement | JSON serialization changes or PostgreSQL upgrade |
| Prior PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows | anti-cheat/route.ts:195-204 | MEDIUM/MEDIUM | Could use SQL window function; currently bounded by limit | Long contest with many heartbeats causes slow API response |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HPR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| Prior DOC-1: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior DOC-2: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior ARCH-2: Stale-while-revalidate cache pattern duplication | contest-scoring.ts, analytics/route.ts | LOW/LOW | DRY concern; both modules work correctly | Module refactoring cycle |
| Prior DES-1: Chat widget button badge lacks ARIA announcement | chat-widget.tsx:284-288 | LOW/LOW | Screen reader edge case; badge is visual-only | Accessibility audit or user complaint |
