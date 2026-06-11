# Critic Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** critic
**Focus:** Multi-perspective critique, cross-cutting concerns, holistic assessment

---

## C2-CRIT-1 — Authorization model inconsistency across submission views
**Severity:** HIGH | **Confidence:** High
**File:** Cross-file: `submissions/route.ts` (POST) vs `submissions/[id]/page.tsx` (GET)

The POST handler comment explicitly states that instructors can "always see compile output regardless of the problem setting." The GET page does not honor this. This is a cross-file contract violation — two parts of the system disagree on what instructors can see.

**Impact:** Instructors must context-switch between public and dashboard views. Worse, if a future change updates one file but not the other, the inconsistency widens.

**Fix:** Extract a shared `canViewSubmissionDetails(user, submission)` utility used by both POST response construction and GET page rendering.

---

## C2-CRIT-2 — Timeline feature has no degradation strategy for large datasets
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts`, `participant-timeline-bar.tsx`

The timeline feature fetches up to 5000 submissions and 1000 snapshots, then renders them all. There's no pagination, virtual scrolling, or progressive loading. For a participant with many submissions, the initial page load could be very slow.

**Impact:** First paint degradation; potential memory issues on lower-end devices.

**Fix:** Implement virtual scrolling for the timeline bar, or add a "show more" button for older events.

---

## C2-CRIT-3 — The `participant-timeline-bar.tsx` mixes presentation and data transformation
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx`

The component performs significant data transformation (flattening events, computing percentages, sorting) inline. This logic should be extracted to a pure function or hook for testability and reusability.

**Fix:** Extract `useTimelineEvents(timelineByProblem, participant)` hook.

---

## C2-CRIT-4 — Judge claim reset-to-pending doesn't decrement worker capacity
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:328-341`

When a claimed submission's problem is missing, the code resets the submission to pending but does NOT decrement the worker's `active_tasks`. The worker already incremented its count in the CTE (`worker_bump`), so the worker now has an inflated active task count.

**Impact:** Workers report higher load than actual. Over time, this could cause workers to appear at capacity when they're not, starving the queue.

**Fix:** Decrement `active_tasks` in the same transaction, or move the problem validation before the worker bump.

---

## C2-CRIT-5 — Timeline i18n keys duplicated across en/ko without extraction helper
**Severity:** LOW | **Confidence:** Medium
**File:** `messages/en.json`, `messages/ko.json`

The timeline translation keys are nested deeply (`contests.participantAudit.submissionHistory.*`). Adding a new label requires editing both JSON files. There's no type-safe key extraction or codegen to catch missing translations.

**Fix:** Consider using a type-safe i18n framework with compile-time key checking, or add a CI gate that verifies key parity between locales.

---

## Commonly Missed Sweep

- The timeline feature is well-integrated with existing anti-cheat and code snapshot systems — good architectural reuse.
- The `participant-timeline.ts` file correctly handles both ICPC and IOI scoring models — good domain modeling.
