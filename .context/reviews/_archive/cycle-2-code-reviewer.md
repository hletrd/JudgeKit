# Code Review — Cycle 2 (Fresh)

**Base commit:** 31049465
**Reviewer:** code-reviewer
**Focus:** Code quality, logic correctness, maintainability, SOLID principles

---

## C2-CODE-1 — Instructors see empty results on public submission detail page
**Severity:** HIGH | **Confidence:** High
**File:** `src/app/(public)/submissions/[id]/page.tsx:125-127,191,201`

The public submission detail page gates `showDetailedResults`, `showRuntimeErrors`, `showCompileOutput`, `canViewSource`, and `results` solely on `isOwner`. When an instructor with `canViewAsInstructor = true` views a student's submission, they pass the `notFound()` guard (line 95) but then receive empty results, no source code, and no compile output. This contradicts the POST handler comment (lines 385-388) stating instructors should "always see compile output regardless of the problem setting."

**Failure scenario:** Instructor clicks a student's submission link from the status board. The page loads but shows only metadata (status, score) with no source code, no test results, and no compile output. The instructor must manually navigate to the dashboard view instead.

**Fix:** Use `const canViewDetails = isOwner || canViewAsInstructor;` and gate visibility on `canViewDetails`.

---

## C2-CODE-2 — `z.coerce.number()` produces `NaN` without failing validation
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/app/api/v1/judge/claim/route.ts:34-37`

`z.coerce.number()` converts any value to a number via `Number(value)`. For non-numeric strings this produces `NaN`, which passes validation as a valid `number`. Downstream code consuming `claimed.executionTimeMs` etc. may not handle `NaN`.

**Failure scenario:** If a PostgreSQL column type mismatch causes a string like "abc" to be returned in the raw query, the Zod schema accepts `NaN`, and the judge worker receives `NaN` as a time limit or score, causing undefined behavior in the worker.

**Fix:** Add `.refine((n) => n === null || !Number.isNaN(n))` after each `.nullable()`.

---

## C2-CODE-3 — Index-based React keys in timeline event markers
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx:208`

```typescript
key={`${ev.problemId}-${ev.type}-${i}`}
```

Using array index `i` in React keys causes incorrect DOM reuse when events are added/removed. Since `flatEvents` is sorted by timestamp, new events shift all subsequent indices.

**Fix:** Use timestamp-based keys: `key={`${ev.problemId}-${ev.type}-${ev.at.getTime()}`}`.

---

## C2-CODE-4 — Fragile string replacement for Tailwind class names
**Severity:** LOW | **Confidence:** Medium
**File:** `src/components/contest/participant-timeline-bar.tsx:30`

```typescript
return PROBLEM_COLORS[index % PROBLEM_COLORS.length].replace("bg-", "border-");
```

Assumes `"bg-"` appears exactly once and at the start. Breaks with opacity variants or Tailwind v4 naming changes.

**Fix:** Use a mapping object with explicit `bg` and `border` properties.

---

## C2-CODE-5 — Silent data truncation with `.limit(5000)` and `.limit(1000)`
**Severity:** MEDIUM | **Confidence:** High
**File:** `src/lib/assignments/participant-timeline.ts:163,175`

Submission and snapshot queries silently truncate beyond their limits. For a contest with many submissions, the timeline will be incomplete with no warning.

**Fix:** Add a truncation indicator to the response, or remove limits with documented performance expectations.

---

## C2-CODE-6 — Unnecessary `new Date()` wrapping of already-Date values
**Severity:** LOW | **Confidence:** High
**File:** `src/components/contest/participant-timeline-bar.tsx:362`

The `typeof firstAc === "number"` check implies a type mismatch between `ParticipantTimeline` (Date) and `ParticipantAuditData` (possibly number). The defensive runtime check signals a typing inconsistency.

**Fix:** Align types across both data sources to use `Date | null` consistently.

---

## C2-CODE-7 — Type inconsistency: `points` nullable in DB but non-null in type
**Severity:** LOW | **Confidence:** Medium
**File:** `src/lib/assignments/participant-timeline.ts:215,282`

`problemRow.points` is `number | null` from the DB select, but `ParticipantTimeline.problems[].points` is typed as `number`. The fallback to `DEFAULT_PROBLEM_POINTS` at lines 215 and 282 makes it work at runtime, but the type contract doesn't reflect the DB reality.

**Fix:** Make `ParticipantTimeline.problems[].points` nullable or document the guaranteed fallback.

---

## Commonly Missed Sweep

- No unused imports in reviewed files.
- No dead code paths found.
- The `toSecondsBetween` helper correctly uses `Math.max(0, ...)` to prevent negative durations.
- The `sortTimeline` function falls back to `type` comparison when timestamps are equal — reasonable tiebreaker.
