# Designer (UI/UX) — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Note on browser tooling:** no provisioned login-gated staging session/browser is available to this cycle's runner (DEFER-ENV-GATES standing). Findings below are from source inspection of the React components and i18n catalogs; live a11y audit of authenticated exam/contest pages remains the standing env-gated deferral.

## DES7-1 — Duplicated/disappearing evidence rows degrade the proctor's trust in the dashboard (MEDIUM UX, High, CONFIRMED — UX face of CR7-2)
The anti-cheat dashboard is a high-stakes monitoring surface. The poll-merge
seam loss (rows vanish) and loadMore duplication (rows doubled, React key
warnings) make the proctor doubt whether the evidence list is complete —
exactly the wrong feeling during a live exam where the instructor may act on
what they see. This is a UX-integrity bug, not just a console warning. Fix
tracked under AGG7-1; from the UX side the acceptance bar is "the visible list
is a faithful, stable superset that only grows as you load more and only
refreshes the newest rows in place."

## DES7-2 — Anti-cheat GET listing order (after CR7-1) should be newest-first AND stable (LOW UX, Medium)
When the id tiebreak is added (CR7-1), keep `createdAt desc` primary so the
proctor still reads newest-first; the id is only a same-timestamp
disambiguator. A stable order also fixes the subtle UX jitter where
same-second rows reorder between polls.

## Carried a11y items (unchanged preconditions — env-gated)
- DES3-1: expired→active exam-deadline transition announced politely rather than assertively (`exam-deadline-sync.tsx:107`) — needs UX judgement + a live screen-reader pass; bundle with the next exam-page a11y pass.
- The cycle-6 keyboard-chip fix (filter chips are real `<button aria-pressed>` in both the dashboard and the timeline) is verified present in source — no regression.

## Korean typography compliance (repo rule)
Re-grepped all `tracking-*` usages: every instance is locale-gated
(`locale !== "ko"`) or annotated as numeric/Latin-only (not-found.tsx 404,
admin/recruit headings). No custom letter-spacing applied to Korean glyphs.
Compliant.

## Final sweep
No new component introduced this cycle. The one UX-impacting defect is the
dashboard paging integrity (DES7-1); everything else is carried env-gated
a11y polish.
