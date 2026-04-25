# RPF Cycle 41 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 41/100
**Base commit:** 24a04687
**Status:** Done

## Lanes

### Lane 1: Remove `"redeemed"` from PATCH route allowed transitions [AGG-1]

**Severity:** MEDIUM/MEDIUM (9 of 11 perspectives)
**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:97`
**Status:** Done

**Tasks:**
- [x] Remove `"redeemed"` from the `allowed` map's `pending` entry, leaving only `["revoked"]`
- [x] Verify the Zod schema already blocks `"redeemed"` (defense-in-depth remains)
- [x] Verify TypeScript compiles without errors
- [x] Commit with message: `fix(invitations): 🐛 remove "redeemed" from PATCH route state machine`

**Commit:** 498eb3e2

---

### Lane 2: Replace audit-logs LIKE-based JSON search with JSONB containment [AGG-2]

**Severity:** LOW/LOW (3 of 11 perspectives)
**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`
**Status:** Deferred

**Reason for deferral:** LOW severity. The current LIKE approach works correctly today. The `escapeLikePattern` function properly escapes SQL wildcards. Switching to JSONB `@>` is a robustness improvement that requires testing the `details` column type (must be JSONB, not TEXT) and verifying that a GIN index exists for performance.

**Exit criterion:** JSON serialization changes, PostgreSQL version upgrade, or dedicated robustness improvement cycle.

---

### Lane 3: Run quality gates

**Severity:** Required
**Status:** Done

**Tasks:**
- [x] Run `eslint` — passed (exit 0)
- [x] Run `npm run build` — passed
- [x] Run `npm run test:unit` — passed (294 test files, 2116 tests)
- [x] Run `npm run test:integration` — skipped (no DB connection)
- [x] Run `npm run test:component` — 10 pre-existing failures in unrelated tests (PostgreSQL pool not available); all tests related to changed files pass

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| AGG-2: Audit logs LIKE-based JSON search | audit-logs/page.tsx:150 | LOW/LOW | Works today; robustness improvement; needs JSONB column verification | JSON serialization changes or PostgreSQL upgrade |
| PERF-1: Shared poll timer reads config on restart | events/route.ts:161 | LOW/LOW | Timer only restarts on first subscriber after quiet period; infrequent | Performance profiling shows bottleneck |
| PERF-2: SSE connection eviction linear search | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap; O(n) is acceptable | Cap is raised significantly |
| PERF-3: Anti-cheat heartbeat gap query transfers up to 5000 rows | anti-cheat/route.ts:195-204 | MEDIUM/MEDIUM | Could use SQL window function; currently bounded by limit | Long contest with many heartbeats causes slow API response |
| DES-1: Chat widget button badge lacks ARIA announcement | chat-widget.tsx:284-288 | LOW/LOW | Screen reader edge case; badge is visual-only | Accessibility audit or user complaint |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| Prior DOC-1: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior DOC-2: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| Prior ARCH-2: Stale-while-revalidate cache pattern duplication | contest-scoring.ts, analytics/route.ts | LOW/LOW | DRY concern; both modules work correctly | Module refactoring cycle |
