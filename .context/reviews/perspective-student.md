# Persona review — Student taking assignments/exams (RPF cycle 4, 2026-06-11)

**HEAD reviewed:** 7c0a4bd4. Static walkthrough of the student exam flow
(start exam → problem pages → autosave → submit → disconnect/extension paths);
no live browser in this environment.

## ST4-1 — I get silently flagged for opening the problem (MEDIUM-HIGH, High; same root as AGG4-1)
As a student I never see it, but the moment I open my first exam problem the
platform records an escalate-tier "submitted while unmonitored" flag against
me (`practice/problems/[id]/page.tsx:167` →
`submissions.ts:343`), before the monitoring banner has even appeared. If my
instructor reviews flags strictly (the docs tell them to), I'm a suspect for
having navigated. This is the cycle's top fairness issue from my seat. Fix
scheduled (flag only on real submissions).

## ST4-2 — Disconnect/timeout mid-exam: well handled (positive, verified in code)
- My unsent telemetry queues in localStorage and survives reloads
  (`anti-cheat-storage.ts`), retries with backoff, and permanent rejections
  don't burn the retry ladder (cycle-3 G5).
- My countdown can only move LATER on resync — an extension mid-exam shows a
  toast + persistent note; a flaky poll can never shrink my time
  (`exam-deadline-sync.tsx:70`).
- Submissions are accepted fail-open even if my monitor died (no 403 at the
  deadline because my wifi blipped) — `submissions.ts:336-342` rationale.
- If staff extend my time past the contest close, both my submissions AND my
  telemetry are accepted (cycle-3 G1) — no more dark-window flags.

## ST4-3 — Residual anxiety points (LOW, Medium)
- The tab-switch warning toast fires when I return after >3 s away; wording is
  warning-grade, acceptable. But repeated legitimate task-switching (allowed
  calculator app, accessibility tools) still accumulates `signal`-tier rows I
  can't see or contest. Mitigation is staff-side education (the integrity doc
  covers corroboration); a student-visible "what was recorded about me"
  panel would be the structural fix — product decision, not scheduled.
- If the exam-session re-fetch race fires at start I'm told the assignment is
  closed when it isn't (AGG4-4); rare, but at exam start that's a panic
  moment. Error-key fix scheduled this cycle.

## ST4-4 — Clarity of problem statements / submission flow
Statement rendering, sample I/O, and per-language templates were covered in
cycles 1–2 (no changes since); nothing new to flag. Language availability
preview for candidates remains a deferred product item (JA-clarity row).
