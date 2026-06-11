# RPF Loop Cycle 1 — Designer Review (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** designer (UI/UX)

## Summary
Source-level UI/UX review (no live agent-browser run this cycle — sandbox cannot host the dev server without a Postgres). Recent commits include a thoughtful set of UI improvements: locale switcher exposed on auth pages, public privacy page, public-header desktop-nav breakpoint moved md→lg, employer branding on recruit page, recruit results page added.

## NEW findings

### DSGN-1: [MEDIUM] Recruit results page renders inflated/incorrect total score

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:206-216, 261-263`
- **Description:** Cross-listed with code-reviewer CR-1. From a UX standpoint, the candidate sees a number labeled "Total score" that is mathematically wrong. This page is the candidate's last interaction with the recruiter brand; the trust hit is disproportionate to the size of the bug.
- **Confidence:** HIGH
- **Fix:** Apply CR-1 fix.

### DSGN-2: [LOW] Public-header desktop-nav breakpoint shift (md → lg) widens the mobile menu range

- **File:** `src/components/layout/public-header.tsx:178, 197, 246, 275, 277`
- **Description:** Commit `37a4a8c3` shifts the desktop nav-visible breakpoint from `md` (≥768 px) to `lg` (≥1024 px). On tablets and ~10" iPads, users now see the hamburger menu instead of the full nav. This is a deliberate decision (more room for site title and the trailing slot), but it does compress the visible "primary nav" surface for ~tablet users. The mobile menu UX itself is solid (focus trap, escape, region role). No regression; cross-checked focus trap still works.
- **Confidence:** LOW
- **Status:** Acceptable design tradeoff; logged for transparency.

### DSGN-3: [LOW] Recruit results page lacks empty-state copy when there are zero submissions

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:222-269`
- **Description:** When `bestByProblem` is empty (candidate never submitted), each per-problem row falls into the `t("noSubmissionForProblem")` branch — that's good — but the page doesn't show a higher-level "you didn't attempt this exam" state. This is unusual but happens (candidate redeems token then never starts). The overall result lists N rows of "no submission". Minor UX polish.
- **Confidence:** LOW
- **Fix:** Add a top-level conditional: if `submissionRows.length === 0`, render a single "no submissions" panel instead of the per-problem grid.

### DSGN-4: [LOW] Submission form 4 s confirm-window has a UX edge — what if the toast is dismissed externally?

- **File:** `src/components/problem/problem-submission-form.tsx:316-326`
- **Description:** The 4 s pre-submit cancel window relies on a `toast()` action and a `setTimeout`. If sonner's toast queue evicts this toast (e.g., 5 newer toasts pushed by other interactions), the user loses the visible "cancel" UI but the timer still fires after 4 s. The action button on the toast becomes invisible. Mostly theoretical, but worth checking sonner's eviction behavior.
- **Confidence:** LOW
- **Fix:** Pin the toast with `duration: Infinity` and dismiss it manually in `executeSubmit` / `cancelPendingSubmit`. Add a parallel inline confirmation banner inside the form for redundancy.

### DSGN-5: [LOW] Korean letter-spacing rule is enforced as ad-hoc inline conditionals

- **File:** `src/components/layout/public-header.tsx:301`
- **See:** critic CRIT-4. UX impact: drift risk — a Korean user could see incorrect tracking on a future component.
- **Confidence:** LOW

## Final-sweep checklist

- [x] Verified the public-header focus trap in source (lines 113-148): handles Tab/Shift+Tab wraparound, escape, restore-focus.
- [x] Verified the recruit results page sets `NO_INDEX_METADATA` (correct for sensitive recruiting URLs).
- [x] No new accessibility regressions identified at the source level.
- [x] Live agent-browser run skipped — sandbox lacks Docker/Postgres. (Same as the cycle 55 / cycle 3 deferral; runtime designer pass is gated by environment.)
