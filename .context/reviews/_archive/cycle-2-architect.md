# Architect Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** architect
**Focus:** Architectural risks, coupling, layering, design risks

---

## C2-ARCH-1 — Timeline feature couples submission, snapshot, and anti-cheat concerns
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts`

The `getParticipantTimeline` function queries submissions, code snapshots, anti-cheat events, exam sessions, and contest access tokens all in one function. This creates a tight coupling between previously separate domains.

**Risk:** Future changes to any of these domains require touching the timeline function. Testing requires mocking all 8 queries.

**Fix:** Decompose into smaller functions or use a repository pattern:
```typescript
const participant = await getParticipant(assignmentId, userId);
const submissions = await getSubmissionsForTimeline(assignmentId, userId);
const snapshots = await getSnapshotsForTimeline(assignmentId, userId);
// etc.
```

---

## C2-ARCH-2 — Public submission page conflates student and instructor views
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/(public)/submissions/[id]/page.tsx`

The page tries to serve both student (owner) and instructor (viewer) use cases with conditional logic. This is a layering violation — instructors should view submissions through the dashboard domain, not the public domain.

**Risk:** The conditional logic will drift. Already it doesn't correctly implement instructor visibility.

**Fix:** Either (a) extract a shared submission detail component used by both public and dashboard pages, or (b) redirect instructors to the dashboard view.

---

## C2-ARCH-3 — Judge claim endpoint mixes CTE logic with business logic
**Severity:** LOW | **Confidence:** Medium
**File:** `src/app/api/v1/judge/claim/route.ts`

The 200+ line raw SQL CTE is embedded directly in the route handler. This makes the claim logic hard to unit test and review.

**Risk:** SQL changes require full route testing. The CTE cannot be tested in isolation.

**Fix:** Extract the CTE to a dedicated SQL file or query builder function with its own tests.

---

## C2-ARCH-4 — Settings cache invalidation is coarse-grained
**Severity:** LOW | **Confidence:** Medium
**File:** `src/lib/system-settings-config.ts`

The entire `ConfiguredSettings` cache is invalidated on any settings change. Individual setting changes don't exist — the admin UI likely saves all settings at once.

**Risk:** Minimal given current usage, but as settings grow, the cache refresh cost increases.

**Fix:** Consider per-key caching if settings are updated independently.

---

## Commonly Missed Sweep

- The timeline feature reuses existing `mapSubmissionPercentageToAssignmentPoints` — good reuse.
- The `ParticipantTimelineView` is an async server component — correct for Next.js App Router.
- The `ParticipantTimelineBar` is a client component — correct for interactivity.
