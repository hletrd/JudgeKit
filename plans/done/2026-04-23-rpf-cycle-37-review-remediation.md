# RPF Cycle 37 — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 37/100
**Base commit:** 3d729cee
**Status:** Done

## Lanes

### Lane 1: Add NaN guards to quick-create route for Date construction [AGG-1]

**Severity:** MEDIUM/HIGH (8 of 11 perspectives)
**File:** `src/app/api/v1/contests/quick-create/route.ts:31-34`
**Status:** Done

**Tasks:**
- [x] Add `Number.isFinite(startsAt.getTime())` check after `new Date(body.startsAt)` construction
- [x] Add `Number.isFinite(deadline.getTime())` check after `new Date(body.deadline)` construction
- [x] Return appropriate `apiError()` responses for invalid dates
- [x] Add inline comment explaining defense-in-depth, consistent with recruiting invitation routes

**Commit:** 332c84d6

---

### Lane 2: Extract MAX_EXPIRY_MS constant to shared module [AGG-2]

**Severity:** LOW/MEDIUM (2 of 11 perspectives)
**Files:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:69`, `[invitationId]/route.ts:110`, `bulk/route.ts:30`
**Status:** Done

**Tasks:**
- [x] Create `src/lib/assignments/recruiting-constants.ts` with `MAX_EXPIRY_MS` export
- [x] Replace inline `MAX_EXPIRY_MS` in all 3 invitation route files with import from shared module
- [x] Verify no other files define the same constant

**Commit:** 8f533c02

---

### Lane 3: Add ESCAPE clause to SSE realtime-coordination LIKE queries [AGG-3]

**Severity:** LOW/LOW (3 of 11 perspectives)
**File:** `src/lib/realtime/realtime-coordination.ts:94, 107`
**Status:** Done

**Tasks:**
- [x] Add `ESCAPE '\\'` to both LIKE queries in `realtime-coordination.ts`
- [x] Verify no other LIKE queries in the codebase are missing the ESCAPE clause

**Commit:** 8eb1b2fd

---

### Lane 4: Add ARIA announcement for message count on minimized chat button [AGG-4]

**Severity:** LOW/LOW (1 of 11 perspectives)
**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:284-288`
**Status:** Done

**Tasks:**
- [x] Add `aria-label` to the minimized chat button that includes the message count

**Commit:** 2d5a4e1a

---

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| PERF-1: Shared poll timer reads config on restart | events/route.ts:161 | LOW/LOW | Timer only restarts on first subscriber after quiet period; infrequent | Performance profiling shows bottleneck |
| PERF-2: SSE connection eviction linear search | events/route.ts:44-55 | LOW/LOW | Bounded by 1000-entry cap; O(n) is acceptable | Cap is raised significantly |
| SEC-3: Import route JSON body path with password | migrate/import/route.ts:113-191 | MEDIUM/MEDIUM | Deprecated with Sunset header; functional for backward compatibility | Sunset date reached (Nov 2026) or API clients migrated |
| Prior AGG-5: Console.error in client components | discussions/*.tsx, groups/*.tsx | LOW/MEDIUM | Requires architectural decision; no data loss | Client error reporting feature request |
| Prior AGG-6: SSE O(n) eviction scan | events/route.ts:44-55 | LOW/MEDIUM | Bounded by 1000-entry cap | Performance profiling shows bottleneck |
| Prior AGG-7: Manual routes duplicate createApiHandler | migrate/import, restore routes | MEDIUM/MEDIUM | Requires extending createApiHandler to support multipart | Next API framework iteration |
| Prior AGG-8: Global timer HMR pattern duplication | 4 modules | LOW/MEDIUM | DRY concern; each module works correctly | Module refactoring cycle |
| Prior SEC-3: Anti-cheat copies text content | anti-cheat-monitor.tsx:206 | LOW/LOW | 80-char limit; privacy notice accepted | Privacy audit or user complaint |
| Prior SEC-4: Docker build error leaks paths | docker/client.ts:169 | LOW/LOW | Admin-only; Docker output expected | Admin permission review |
| CR-4 (carry-over): Chat widget entry animation not using motion-safe prefix | chat-widget.tsx:294 | LOW/LOW | globals.css override is functional | Component refactoring cycle |
| DOC-1: quick-create route JSDoc | quick-create/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| DOC-2: SSE route ADR | events/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| DOC-3: Docker client dual-path docs | docker/client.ts | LOW/LOW | Documentation-only | Next documentation cycle |
| DOC-4: Import route dual-path deprecation not in README | migrate/import/route.ts | LOW/LOW | Documentation-only | Next documentation cycle |
