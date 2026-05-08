# Designer Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`
**Note:** This repo contains a web frontend (Next.js with React components, Tailwind CSS, public-facing pages, dashboard UI).

---

## C3-UX-1 (LOW, HIGH) — Privacy page `mailto:` link lacks `rel="nofollow"` (agrees with C3-SEC-4, C3-CR-6, C3-CRIT-4, C3-VER-3)

**File:** `src/app/(public)/privacy/page.tsx:78`

Same issue as C2-F18 (recruiter email). The privacy page email link is a `mailto:` without spam protection. This is a public-facing page that search engines will crawl.

**Fix:** Add `rel="nofollow"` to the anchor tag.

---

## C3-UX-2 (LOW, MEDIUM) — Recruit results page does not handle the case where `assignmentProblemRows` is empty

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:232`

When `assignmentProblemRows` is empty (no problems attached to the assignment yet), the page renders the card with a score section showing "0 / 0" (guarded by `totalPossible > 0` check at line 216, so the score card is hidden) and an empty `<ul>` for the per-problem breakdown. The empty state is not user-friendly — candidates see a card with a title but no content.

**Fix:** Add an empty-state message like "No problems have been added to this assignment yet" when `assignmentProblemRows.length === 0`.

---

## C3-UX-3 (LOW, LOW) — Privacy page Korean letter-spacing

**File:** `src/app/(public)/privacy/page.tsx:44`

The page correctly uses `locale !== "ko" ? "tracking-tight" : ""` for the heading, which respects the Korean letter-spacing rule from CLAUDE.md. Good — no issue here.

---

## C3-UX-4 (INFO, LOW) — Privacy page data retention periods are hardcoded

**File:** `src/app/(public)/privacy/page.tsx:35-40`

Retention periods (90, 30, 180, 365 days) are hardcoded in the page component. If the system settings change the actual retention periods, the privacy page becomes inaccurate. This is a legal/compliance risk.

**Fix:** Read retention periods from system settings or a shared config rather than hardcoding them.
