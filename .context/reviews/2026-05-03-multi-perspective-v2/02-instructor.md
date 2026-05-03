# Instructor Perspective Review

**Date:** 2026-05-03
**Persona:** Tenure-track CS faculty member running two courses (CS1 with 200 students, an upper-division algorithms elective with 60 students), an end-of-term programming contest, and occasional take-home exams.
**Method:** Read `src/lib/assignments/`, `src/lib/problems/`, `src/lib/problem-management.ts`, `src/lib/capabilities/defaults.ts`, `src/lib/anti-cheat/`, `src/app/(dashboard)/groups/`, and the recent reviews in `.context/reviews/2026-05-03-multi-perspective/02-instructor.md` and `persona-instructor-2026-04-20.md`.
**Posture:** Critical. The standard of comparison is what I currently get out of a Canvas + Gradescope + (PrairieLearn | DOMjudge) stack.

---

## TL;DR

JudgeKit has crossed the line from "contest engine with course features bolted on" to "real, if incomplete, course-management platform". For a programming-heavy CS course where the homework is dominated by auto-gradeable problems, this is now a reasonable tool. For institutional adoption, the LMS-integration story is missing entirely, which is fatal at most universities.

| Use case | Score | One-line |
|---|:---:|---|
| Auto-graded homework, single course | 8.0 | Solid. Bulk enroll, per-language TL, KaTeX, group-scoped TAs. |
| Subjective / partial-credit homework | 4.0 | No rubric system, no batch grading workflow. |
| Programming contests | 9.0 | Best-in-class for self-hosted. |
| Take-home / honor-system exams | 6.5 | Heartbeat enforcement is real. No proctoring. |
| Proctored final exams | 3.0 | Bring Safe Exam Browser. JudgeKit is honest that it cannot do this alone. |
| Multi-section / multi-instructor courses | 4.0 | No clone-across-groups, no semester hierarchy. |
| Institutional rollout (LMS-integrated) | 2.0 | No LTI 1.3, no grade passback. Hard stop at most universities. |

Aggregate (course-only, single course): **6.5 / 10**. For institutional rollout: **3.0 / 10**.

---

## What I can actually do today, and how well

### Group / course management (B-)
- Groups are flat. After four semesters my left nav is "CS101-F25, CS101-S26, CS101-F26, CS101-S27, CS260-F25, CS260-F26, …". There is `isArchived` (soft delete), but no group-of-groups, no semester scope, no folder UI. This is a UX wall around year three.
- `group_instructors` distinguishes `co_instructor` and `ta` roles. The capability gates only check `co_instructor` for a number of operations (e.g., `canManageGroupResourcesAsync` per the explore findings). Either rename `ta` to "viewer" or actually let TAs do TA things. See `04-assistant.md`.
- Bulk enrollment now accepts a paste-list (commit `3b416d56` per recent review history). Big quality-of-life win versus the prior one-by-one form.

### Assignment authoring (B)
- Assignment form is a modal capped at `max-h-[85vh]`. For a 12-problem assignment with anti-cheat and time controls it is cramped — should be a full-page route.
- Late penalty is a single flat percentage. No "10% per day, max 5 days" schedule, which is the academic norm.
- Per-student deadline extensions are limited to exam-mode `personalDeadline`. There is no general "extend Alice 48h on assignment 7" UI for accommodations. Manual DB or external sheet.
- Assignment cloning works *within* a group. There is no "clone CS101-F25 → CS101-S26" or "fan this assignment out to my five sections". Multi-section instructors will reach for SQL or screenshots.

### Problem authoring (B+)
- Markdown body with `rehype-katex` for math (recent commit, strict mode + DoS caps). LaTeX renders. Good.
- No WYSIWYG toolbar. For tables, code blocks, math, instructors must hand-write markdown. Fine for me; a problem for the average non-CS instructor.
- Test case management supports ZIP import with `.in`/`.out` pairing, float tolerance config, and locking after first submission. This is genuinely well-designed for autograded problems.
- No randomized / generator-based test cases ("PrairieLearn-style"). All test data is static. For a CS1 anti-plagiarism strategy I want each student to get slightly different inputs. Not possible here.
- No question bank. Problems are a global flat pool inside the org, with tags. Cannot group by learning objective or pin to a chapter of a textbook.

### Auto-grading (A-)
- Per-language time multipliers (commit `e48c2f33`) — this used to be the #1 reason I would not deploy a self-hosted OJ for a multi-language CS1.
- Output comparison with float tolerance. Custom checkers? Search did not surface a first-class custom-checker upload UI; for ICPC-style "any valid path" problems I would want this.
- ZIP import → tested, accepted. Minor: no preview of all test cases in a single screen, you click each row.

### Subjective / manual grading (D)
- One-shot score override dialog: integer, plus free-text comment.
- No rubric data model. No "deduct 5 for missing edge case, deduct 3 for poor variable naming" structure that survives a TA handoff.
- No batch workflow. Grading 200 students means: open student → grade → back → next. No "next ungraded" navigation, no progress meter.
- No anonymous grading mode. Names are always visible. This violates fair-grading practice in many programs.

### Anti-cheat & similarity (B)
- Tiered event model (context / signal / escalate). Heartbeat freshness check at submission time (`a88f640b`). Honest about its limits in `docs/exam-integrity-model.md`.
- `code-similarity-rs` does Jaccard n-gram. Detects copy-paste with light renaming. Will *not* detect:
  - reordering of independent statements,
  - two students independently using the same LLM,
  - structural plagiarism with different identifiers and statement order.
- No AST-based comparison, no MOSS-style fingerprinting, no per-author historical baselining.
- No visual side-by-side diff for the flagged pair in the admin UI (per the explore findings).
- Plagiarism reporting workflow ends at "here is a similarity score". I still write the academic-integrity letter myself.

### Contest authoring (A-)
- ICPC and IOI both. Frozen leaderboards. Per-language TL multipliers. Server-time countdown. This is competition-grade for a self-hosted system. I would actually use this for our department's annual contest.
- No virtual contest mode (replay a past contest with original time pressure for individual practice). Standard on Codeforces, missing here.
- No clarification system surfaced (clarifications during ICPC-style contests). Discussions exist but are not contest-scoped in an obvious way.

### Bulk operations (B-)
- Bulk enroll (paste-list) — exists.
- Bulk rejudge — API exists (`/api/v1/admin/submissions/rejudge/route.ts` with up to 50 ids), partially exposed in UI.
- Bulk extend deadlines for accommodated students — does not exist.
- Bulk export gradebook — CSV download exists; no XLS, no per-assignment-per-student matrix in one go.

### Analytics (B-)
- Score distribution, solve rates, score progression, anti-cheat event counts. Charts are custom SVG (per the explore findings) — usable, not interactive.
- No item analysis (point-biserial, discrimination index) — I want to know which test case is functionally a duplicate signal of other test cases.
- No cohort-vs-cohort comparison ("CS101-S26 was harder than CS101-F25 by 7 points on average").

---

## Critical gaps for institutional adoption

These are the things that, in priority order, would make my dean approve a campus license:

1. **LTI 1.3 + grade passback (Canvas / Blackboard / Moodle).** This is THE blocker. Every weekly grade currently requires a CSV export and manual import — at scale, my office hours become "did your grade sync?" support. Without LTI, JudgeKit is a niche tool I run beside the LMS, not a sanctioned platform.
2. **Rubric system for partial-credit grading.** Free text + an integer is not a rubric. No history of how the grade was justified, no per-criterion breakdown for the student, no way for a TA to inherit my standards.
3. **Per-day late penalty schedule.** Every CS department I have ever taught at uses some variant of "10% off per day, max 5 days, hard zero after". The data model can express this; the UI cannot.
4. **Per-student deadline extensions outside exam mode.** Disability accommodations, religious observance, family emergencies. Right now I either log into the DB or maintain a private spreadsheet.
5. **Multi-section assignment fan-out.** Cloning across groups in one click. Without this, each section gets a manually re-typed copy and they drift.
6. **TA permissions parity with their actual job duties.** TAs commonly author practice problems, post extensions, run plagiarism reports, and adjust scores when a test case is wrong. Right now most of these are blocked.
7. **Email notifications.** Deadline reminders, regrade announcements, "Alice replied to your appeal". Pull-only is fine for me; not for 200 freshmen.
8. **Assignment authoring as a full page**, not a modal.
9. **Anonymous grading mode.**
10. **AST-based plagiarism + side-by-side diff in admin UI.**

---

## What I genuinely like

- The heartbeat-freshness submit gate is the right design. Subtle, easy to miss in code review, useful in practice.
- KaTeX rendering with strict mode and DoS caps is the *correct* way to ship math in user-controlled markdown. Several major OJ platforms do not do this.
- Pre-restore snapshots (`a055f166`) and pre-deploy `pg_dump` retention. The team has been bitten before and now defends against the rerun.
- The contest leaderboard in both ICPC and IOI modes is genuinely competition-quality.
- The `assistant` (TA) role is now group-scoped at the SQL trigger layer (`assignments.view_status` per the explore findings). It is not just a UI hide.
- Documentation tells me what the platform *cannot* do. `docs/exam-integrity-model.md`, `docs/high-stakes-operations.md`, and `docs/threat-model.md` are uncomfortably honest. I trust the team more for this.

---

## Per-use-case scorecard

| Use case | Score | Caveat |
|---|:---:|---|
| Lab / lecture-section autograded homework | 8.0 | I would adopt this today for a single course. |
| Take-home subjective assignments | 4.0 | Use Gradescope on the side. |
| Programming contests | 9.0 | Genuinely good. |
| Take-home / honor-system exams | 6.5 | Acceptable if you accept dishonesty leakage. |
| Proctored final exams | 3.0 | Add SEB or human proctoring; the platform agrees. |
| Multi-section, multi-instructor course | 4.0 | Use a spreadsheet for the cross-section deltas. |
| Institutional rollout | 2.0 | Get LTI before you talk to your dean. |
| Recruiting (as the org running the test) | 8.0 | See `05-applicant.md` — works, with MFA caveat. |

---

## Bottom line

I would adopt JudgeKit for my upper-division algorithms elective today. I would *not* adopt it for CS1 because the lack of LMS integration would put me on the wrong side of every "is this an official tool" conversation, and the lack of rubrics would mean my TAs cannot actually do their job. I would happily run the department contest on it.

The team has clearly gone through hard cycles of real-world feedback and the recent commits address the right things (per-language TL, group-scoped TAs, bulk enroll, KaTeX). The remaining gaps are not architectural rot — they are missing features, and they could be shipped one by one without rewriting anything.
