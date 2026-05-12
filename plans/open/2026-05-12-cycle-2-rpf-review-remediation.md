# Cycle 2 RPF Review Remediation Plan

**Date:** 2026-05-12
**HEAD:** 31049465
**Source:** `.context/reviews/_aggregate.md` (cycle 2 fresh review)

---

## HIGH Priority (implement this cycle)

### PLAN-2-1: Fix instructor empty results on public submission detail page
**Finding:** C2-AGG-1
**File:** `src/app/(public)/submissions/[id]/page.tsx:125-127,191,201`
**Severity:** HIGH | Confidence: High

**Problem:** Instructors with `canViewAsInstructor = true` see empty results, no source code, and no compile output when viewing student submissions on the public detail page.

**Implementation:**
1. Change visibility gating from `isOwner` to `canViewDetails = isOwner || canViewAsInstructor`
2. Apply `canViewDetails` to `showDetailedResults`, `showRuntimeErrors`, `showCompileOutput`
3. Pass `canViewDetails` to `SubmissionDetailClient` for `canViewSource`
4. Update `results` prop to pass `filteredResults` when `canViewDetails` is true
5. Add E2E test: instructor views student submission and sees source code + results

**Status:** pending

---

### PLAN-2-2: Fix worker capacity leak after missing-problem reset
**Finding:** C2-AGG-2
**File:** `src/app/api/v1/judge/claim/route.ts:328-341`
**Severity:** HIGH | Confidence: High

**Problem:** When a claimed submission's problem is missing, the code resets submission to pending but does NOT decrement the worker's `active_tasks`. The worker's capacity accounting drifts upward.

**Implementation:**
1. After resetting the submission at lines 333-340, also decrement the worker's `active_tasks`:
   ```typescript
   if (workerId) {
     await db.update(judgeWorkers)
       .set({ activeTasks: sql`${judgeWorkers.activeTasks} - 1` })
       .where(eq(judgeWorkers.id, workerId));
   }
   ```
2. Add API test: mock missing problem, claim submission, assert worker activeTasks unchanged

**Status:** pending

---

### PLAN-2-3: Add unit tests for `getParticipantTimeline`
**Finding:** C2-AGG-3
**File:** `src/lib/assignments/participant-timeline.ts`
**Severity:** HIGH | Confidence: High

**Problem:** Core timeline data transformation has no unit tests. Complex logic (ICPC vs IOI first-AC, late penalties, anti-cheat aggregation) is untested.

**Implementation:**
1. Create `tests/unit/assignments/participant-timeline.test.ts`
2. Mock DB queries using `vi.mock("@/lib/db")`
3. Test cases:
   - Returns null for non-existent participant
   - Empty submissions => empty timeline with correct summary
   - ICPC mode: first AC detected by status === "accepted"
   - IOI mode: first AC detected by score >= problemPoints
   - Late penalty applied correctly
   - Anti-cheat events aggregated by type
   - Code snapshots included in timeline
   - Limit truncation behavior (if kept)

**Status:** pending

---

## MEDIUM Priority (implement this cycle)

### PLAN-2-4: Reject NaN in `claimedSubmissionRowSchema`
**Finding:** C2-AGG-4
**File:** `src/app/api/v1/judge/claim/route.ts:34-37`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Replace `z.coerce.number().nullable()` with a custom schema that rejects NaN:
   ```typescript
   const nullableNumber = z.union([
     z.null(),
     z.string().transform((s) => {
       const n = Number(s);
       return Number.isNaN(n) ? null : n;
     }),
     z.number().refine((n) => !Number.isNaN(n)),
   ]);
   ```
2. Add unit test passing `"abc"` and asserting validation failure

**Status:** pending

---

### PLAN-2-5: Fix index-based React keys in timeline markers
**Finding:** C2-AGG-5
**File:** `src/components/contest/participant-timeline-bar.tsx:208`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Change key from `${ev.problemId}-${ev.type}-${i}` to `${ev.problemId}-${ev.type}-${ev.at.getTime()}`
2. For mini timeline: change `${ev.type}-${ev.at.getTime()}-${i}` to `${ev.type}-${ev.at.getTime()}`

**Status:** pending

---

### PLAN-2-6: Replace `hashtext` with `hashtextextended` in advisory lock
**Finding:** C2-AGG-7
**File:** `src/app/api/v1/submissions/route.ts:272`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Change `hashtext(${user.id})::bigint` to `hashtextextended(${user.id}, 0)::bigint`
2. Verify PostgreSQL version supports `hashtextextended` (requires PG 14+, project uses PG 18)

**Status:** pending

---

### PLAN-2-7: Add component tests for `ParticipantTimelineBar`
**Finding:** C2-AGG-8
**File:** `src/components/contest/participant-timeline-bar.tsx`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Create `tests/component/participant-timeline-bar.test.tsx`
2. Test empty state, event rendering, color cycling, tooltip content (via DOM query)

**Status:** pending

---

### PLAN-2-8: Add regression test for orphaned submission reset
**Finding:** C2-AGG-9
**File:** `src/app/api/v1/judge/claim/route.ts:328-341`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Add API test mocking DB to return claimed row but null problem
2. Assert 422 response and submission status reset to "pending"
3. Assert worker active_tasks unchanged (after PLAN-2-2 fix)

**Status:** pending

---

### PLAN-2-9: Fix CSS-only tooltip accessibility
**Finding:** C2-AGG-10
**File:** `src/components/contest/participant-timeline-bar.tsx:247-292`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Replace CSS-only tooltip with Radix UI Tooltip or similar accessible component
2. Ensure tooltips work on hover, focus, and touch

**Status:** pending

---

### PLAN-2-10: Remove or fix snapshot marker tabIndex
**Finding:** C2-AGG-11
**File:** `src/components/contest/participant-timeline-bar.tsx:213-221`
**Severity:** MEDIUM | Confidence: High

**Implementation:**
1. Either remove `tabIndex={0}` from snapshot markers (they're not interactive)
2. Or add `role="button"` and keyboard handler if they should be interactive

**Status:** pending

---

## LOW Priority (defer with exit criteria)

### DEFERRED-2-1: Fragile Tailwind string replacement
**Finding:** C2-AGG-12
**File:** `src/components/contest/participant-timeline-bar.tsx:30`
**Severity:** LOW | Confidence: High
**Reason:** Cosmetic issue; Tailwind class names are stable in v4. Refactoring to mapping object is low value.
**Exit criterion:** Upgrade to Tailwind v5 or add opacity-variant colors.

---

### DEFERRED-2-2: Silent data truncation limits
**Finding:** C2-AGG-13
**File:** `src/lib/assignments/participant-timeline.ts:163,175`
**Severity:** LOW | Confidence: High
**Reason:** 5000 submissions / 1000 snapshots exceeds realistic contest scenarios. Removing limits without pagination risks performance issues.
**Exit criterion:** User report of truncated data, or performance benchmarks show limits are unnecessary.

---

### DEFERRED-2-3: Unnecessary Date wrapping
**Finding:** C2-AGG-14
**File:** `src/components/contest/participant-timeline-bar.tsx:362`
**Severity:** LOW | Confidence: High
**Reason:** Defensive code; runtime behavior is correct. Type alignment is cleanup, not bug fix.
**Exit criterion:** Next refactor of ParticipantAuditData types.

---

### DEFERRED-2-4: Points type inconsistency
**Finding:** C2-AGG-15
**File:** `src/lib/assignments/participant-timeline.ts:215,282`
**Severity:** LOW | Confidence: Medium
**Reason:** Runtime fallback guarantees non-null value. Type-only issue.
**Exit criterion:** Next type-system refactor of assignment types.

---

### DEFERRED-2-5: Timeline marker overlap
**Finding:** C2-AGG-16
**File:** `src/components/contest/participant-timeline-bar.tsx:201-295`
**Severity:** LOW | Confidence: Medium
**Reason:** UX enhancement. Current behavior is acceptable for typical data density.
**Exit criterion:** User feedback about clicking wrong markers, or dense timeline use case emerges.

---

### DEFERRED-2-6: Mini timeline bar labels
**Finding:** C2-AGG-17
**File:** `src/components/contest/participant-timeline-bar.tsx:325-350`
**Severity:** LOW | Confidence: Medium
**Reason:** Enhancement. Mini bars are supplementary visual cues.
**Exit criterion:** UX review requests enhanced mini timeline interaction.

---

### DEFERRED-2-7: Single-problem color legend
**Finding:** C2-AGG-18
**File:** `src/components/contest/participant-timeline-bar.tsx:166-183`
**Severity:** LOW | Confidence: Medium
**Reason:** Minor visual noise. Easy fix when touching component.
**Exit criterion:** Next edit to timeline-bar component.

---

### DEFERRED-2-8: Time axis label clarity
**Finding:** C2-AGG-19
**File:** `src/components/contest/participant-timeline-bar.tsx:188-193`
**Severity:** LOW | Confidence: Low
**Reason:** Context-dependent; most users understand relative time.
**Exit criterion:** User confusion reported.

---

### DEFERRED-2-9: Anti-cheat event type fallback
**Finding:** C2-AGG-20
**File:** `src/components/contest/participant-timeline-view.tsx:293-298`
**Severity:** LOW | Confidence: Low
**Reason:** Unknown event types only occur if backend introduces new types without updating translations.
**Exit criterion:** New anti-cheat event type added.

---

## Quality Gates

Before marking this plan complete, run:
- `npx eslint .`
- `npx next build`
- `npx vitest run`
