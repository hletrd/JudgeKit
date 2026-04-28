# Aggregate Review — Cycle 5

**Date:** 2026-04-28
**Reviewers:** code-reviewer (1 lane — focused verification + new findings)
**Total findings:** 0 HIGH, 2 MEDIUM, 2 LOW (deduplicated, new findings only)

---

## Cycle 1-4 Fix Verification Summary

All 18 tasks from cycles 1-4 were verified:

| Cycle | Task | Description | Status |
|-------|------|-------------|--------|
| C1 | A | totalPoints reduce initial value | VERIFIED |
| C1 | B | examDurationMinutes in assignmentContext | VERIFIED |
| C1 | C | Redundant getExamSession fallback | VERIFIED |
| C1 | D | Dark mode badges on contest detail | VERIFIED |
| C1 | E | Layout upstream comment | VERIFIED |
| C2 | A | My Contests dark mode badges | VERIFIED |
| C2 | B | DEFAULT_PROBLEM_POINTS constant | VERIFIED — no remaining raw `?? 100` |
| C2 | C | Import route type guard | VERIFIED |
| C2 | D | Regression tests | VERIFIED |
| C2 | E | assignmentId on Virtual Practice links | VERIFIED |
| C2 | F | locale passed to formatScore | VERIFIED |
| C2 | G | Shared getContestStatusBorderClass | VERIFIED |
| C2 | H | Parallelized queries | VERIFIED |
| C3 | A | Badge color shades standardized | VERIFIED |
| C3 | B | Shared formatDateLabel utility | VERIFIED |
| C3 | C | Dashboard `?? 100` replaced | VERIFIED |
| C3 | D | Redundant getExamSession in problem detail | VERIFIED |
| C4 | A | Dashboard dark mode badge variants | VERIFIED |
| C4 | B | formatScore locale in public submissions | VERIFIED |
| C4 | C | formatScore locale in dashboard pages | VERIFIED |

All cycle 1-4 fixes are correctly implemented. No regressions found.

---

## Deduplicated Findings (sorted by severity)

### C5-AGG-1: [MEDIUM] Dashboard contests page uses local `getStatusBorderClass` without dark mode, diverging from shared utility

**Sources:** C5-CR-1 | **Confidence:** HIGH

`src/app/(dashboard)/dashboard/contests/page.tsx:57-68` defines a local `getStatusBorderClass` that returns classes without dark mode variants (e.g., `border-l-blue-500` without `dark:border-l-blue-400`). All public pages import `getContestStatusBorderClass` from `contest-status-styles.ts` which includes dark mode. This is the same class of issue as C2-AGG-8 (which extracted the shared utility for public pages), but the dashboard contests page was not migrated.

**Fix:** Delete the local `getStatusBorderClass` function and import `getContestStatusBorderClass` from `@/app/(public)/_components/contest-status-styles`. The function signature is compatible. Update line 181 to use the imported function.

---

### C5-AGG-2: [MEDIUM] Score displays in 4 dashboard views use raw numbers instead of `formatScore(score, locale)`

**Sources:** C5-CR-2 | **Confidence:** HIGH

Four locations display submission scores as raw JavaScript numbers without locale-aware formatting:

1. `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:186` — `{sub.score ?? 0}`
2. `src/app/(dashboard)/dashboard/contests/[assignmentId]/participant/[userId]/submissions/page.tsx:173` — `{sub.score !== null && sub.score !== undefined ? sub.score : "-"}`
3. `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:225-226` — `{sub.score !== null ... ? sub.score : "-"}`
4. `src/components/contest/participant-timeline-view.tsx:340-341` — `{sub.score !== null ... ? sub.score : "-"}`

This is the same bug class as C2-AGG-7/C4-AGG-2/C4-AGG-3 (formatScore without locale), but for raw numeric display. The `locale` variable is already available in all four files. Other score displays in the same files use `formatScore(sub.score, locale)`.

**Fix:** Replace each raw `sub.score` display with `formatScore(sub.score, locale)`. Add `import { formatScore } from "@/lib/formatting"` where missing.

---

### C5-AGG-3: [LOW] Misleading type cast `as string | Date` in dashboard contests page

**Sources:** C5-CR-3 | **Confidence:** HIGH

`src/app/(dashboard)/dashboard/contests/page.tsx:213`:
```tsx
deadline={new Date(contest.personalDeadline ?? contest.deadline as string | Date).getTime()}
```

The `as string | Date` cast only applies to `contest.deadline` due to operator precedence. Both fields are already `Date | null`, so the cast is misleading. The code works correctly at runtime but creates a false impression.

**Fix:** Remove the `as string | Date` cast: `new Date(contest.personalDeadline ?? contest.deadline).getTime()`

---

### C5-AGG-4: [LOW] SubmissionStatusBadge locale prop not passed by any external caller

**Sources:** C5-CR-4 | **Confidence:** MEDIUM

The `SubmissionStatusBadge` component accepts an optional `locale` prop for tooltip number formatting (defaults to "en-US"). None of the ~18 external callers pass `locale`, causing tooltips to always format numbers in en-US. This is related to the C4-AGG-2/C4-AGG-3 fix pattern (formatScore without locale) but applies to the tooltip content inside the component.

Hardcoded English strings in the component ("WA on test #", "Score:", "Runtime error") are already tracked under DEFER-34/DEFER-35.

**Fix:** Pass `locale` prop from each caller's existing `locale` variable. This is a simple prop pass-through.

---

## Carried Deferred Items (unchanged from cycle 4)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — partially addressed by C2-AGG-4
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- C2-AGG-9/C3-AGG-5/C4-AGG-4: `getDbNow` called redundantly — LOW, deferred
- C2-AGG-10: CountdownTimer namespace mismatch — LOW, deferred

---

## No Agent Failures

The review lane completed successfully.

---

## Plannable Tasks for This Cycle

1. **C5-AGG-1** (MEDIUM) — Replace local `getStatusBorderClass` with shared `getContestStatusBorderClass` import
2. **C5-AGG-2** (MEDIUM) — Use `formatScore(sub.score, locale)` in 4 remaining raw score displays
3. **C5-AGG-3** (LOW) — Remove misleading `as string | Date` cast
4. **C5-AGG-4** (LOW) — Pass `locale` prop to SubmissionStatusBadge in all callers
