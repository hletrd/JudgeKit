# Debugger Review — Cycle 2

**Reviewer:** debugger
**Date:** 2026-04-28
**Scope:** Verification of cycle 1 fixes + new latent bug surface analysis

---

## Cycle 1 Fix Verification

### VERIFIED: AGG-1 (totalPoints off by 100)
- Now uses initial value `0` — correct.

### VERIFIED: AGG-2 (examDurationMinutes = 0)
- `assignmentContext` now includes `examDurationMinutes`, populated from DB, passed to `StartExamButton` — correct.

### VERIFIED: AGG-9 (redundant getExamSession)
- Now uses `contest.examSession` directly — correct.

### Potential Regression Check: AGG-9 fix
- The enrolled view now uses `contest.examSession` from `getEnrolledContestDetail`. In `public-contests.ts:302-313`, the exam session query only runs when `examMode === "windowed"`. For `examMode === "scheduled"`, `examSession` is `null`. This is correct because scheduled exams don't have personal deadlines.

---

## New Findings

### DBG-C2-1: [MEDIUM] Virtual Practice section links don't include `assignmentId` — breaks exam context

**File:** `src/app/(public)/contests/[id]/page.tsx:665`
**Confidence:** MEDIUM

```tsx
<Link
  key={problem.id}
  href={buildLocalePath(`/practice/problems/${problem.id}`, locale)}
  ...>
```

The Virtual Practice section for expired/closed contests links to `/practice/problems/${problem.id}` without the `?assignmentId=...` query parameter. This means that when a student clicks a Virtual Practice link, the problem detail page has no assignment context — the `assignmentContext` variable will be `null`.

This is a design issue flagged previously as AGG-14, but the debugger perspective highlights a concrete failure scenario:

**Failure scenario:** Student navigates from a closed contest's Virtual Practice section to a problem. The problem detail page loads without assignment context. If the problem is `visibility: "private"` (only accessible through the assignment), the student gets a 404 because `canAccessProblem` returns false and there's no `assignmentContext` to grant access. Even for public problems, the student loses exam-mode context (anti-cheat, countdown timer, etc.).

**Fix:** Add `assignmentId` parameter to Virtual Practice links.

---

### DBG-C2-2: [LOW] `formatScore` called without locale in contest detail enrolled view

**File:** `src/app/(public)/contests/[id]/page.tsx:396`
**Confidence:** LOW

```tsx
<TableCell>{formatScore(sub.score)}</TableCell>
```

The `formatScore` function accepts a locale parameter for digit grouping, but the enrolled contest view calls it without passing `locale`. The dashboard version at `dashboard/contests/[assignmentId]/page.tsx` also omits locale, but the public view should be locale-aware since it serves international users.

**Fix:** Change to `formatScore(sub.score, locale)`.

---

### DBG-C2-3: [LOW] CountdownTimer threshold announcements use `t()` from `useTranslations("groups")` — namespace mismatch in public pages

**File:** `src/components/exam/countdown-timer.tsx:52,109`
**Confidence:** LOW

The `CountdownTimer` component uses `useTranslations("groups")` for threshold messages like `t("examWarning15Min")`. When this component is used in public pages (contests, practice), the translation keys come from the `groups` namespace, which is a dashboard namespace. If the `groups` namespace is not loaded for public pages, the translations would fall back to the key itself.

In practice, `next-intl` loads all namespaces, so this is not a runtime error. However, it creates a coupling between the public page and the dashboard namespace.

**Fix:** Move exam countdown translations to a shared namespace (e.g., `common` or `contests`).

---

## Regression Verification

All cycle 1 commits were reviewed for regressions:
- `8ab975b9` (totalPoints + dark mode + remove fallback) — No regression risk
- `a96c5d2a` (examDurationMinutes) — No regression risk
- `39510bae` (layout comment) — No regression risk
- `ee2028a3` (plan document) — No regression risk
