# Instructor Review — JudgeKit — 2026-05-15

**Reviewer persona:** CS professor who runs weekly programming assignments, a midterm exam, and an end-of-term contest. Needs to enroll 200 students, grade efficiently, catch cheaters, and export results to the university LMS. Has a TA who handles day-to-day grading.
**Method:** Inspected `src/app/(dashboard)/dashboard/admin/`, `src/lib/assignments/`, `src/lib/problems/`, `src/lib/submissions/`, `src/lib/anti-cheat/`. Walked problem creation, assignment setup, contest configuration, and bulk operations.
**Scope:** Pedagogical workflow efficiency, grading ergonomics, integrity tooling, operational scaling.

## Verdict (1-10) per use case

| Use case | Score | One-line summary |
|---|---|---|
| Weekly homework | **7/10** | Assignment creation, deadline enforcement, and per-group scoping are solid. Bulk enroll is missing; adding students one-by-one does not scale to 200. |
| Programming exam | **6/10** | Exam window, anti-cheat telemetry, and heartbeat freshness are real. No proctoring integration, no Safe Exam Browser compatibility guide, and score override UI is clunky. |
| End-of-term contest | **8/10** | Contest tooling is the platform's strongest surface: IOI/ICPC scoring, leaderboard freeze, access codes, real-time SSE, and analytics are competitive with dedicated contest platforms. |
| Plagiarism detection | **5.5/10** | Jaccard n-gram similarity with Rust acceleration is fast. But it is similarity, not plagiarism detection. No Moss integration, no automatic flagging threshold, and the review UI requires manual inspection of every pair. |

**Overall instructor utility: 7/10.** The contest system is genuinely good. The homework workflow is functional but lacks the bulk operations and integrations a real classroom needs. The TA/assistant delegation model is broken (see assistant review).

---

## Top 5 things that work well

1. **Contest quick-create with sensible defaults.** `src/app/api/v1/contests/quick-create/route.ts` lets an instructor spin up a contest from a problem set in under a minute, with IOI scoring and a 2-hour window pre-filled. The access-code generation is automatic. This is faster than setting up a Codeforces Gym or a Domjudge contest.

2. **IOI and ICPC scoring with late-penalty support.** `src/lib/assignments/scoring.ts` implements both IOI (partial scoring, sum of test-case points) and ICPC (binary per-problem, penalty minutes for wrong submissions). The late-penalty expression supports linear and step functions. This is more flexible than HackerRank's single scoring model.

3. **Anti-cheat dashboard with review tiers.** `src/app/(dashboard)/dashboard/admin/assignments/[id]/anti-cheat/page.tsx` aggregates tab-switch, blur, copy/paste, and heartbeat events per student. The three-tier model (context/signal/escalate) from `src/lib/anti-cheat/review-model.ts` gives instructors a rational way to prioritize review. The heartbeat freshness gate means students with stale monitors are blocked from submission — a real operational win.

4. **Per-problem visibility and feedback toggles.** Each problem has independent controls for `showDetailedResults`, `showRuntimeErrors`, `showCompileOutput`, and `allowAiAssistant`. An instructor can show full feedback for practice problems, hide compile output for exams, and disable AI assistant for contests — all without touching code.

5. **Code snapshots during exams.** `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts` captures periodic editor state during exam sessions. This is invaluable for reconstructing a student's thought process during an academic integrity review. The timeline view shows when code changed and how.

---

## Top 8 instructor frustrations

### F1. No bulk student enrollment (HIGH)
**Where:** `src/app/(dashboard)/dashboard/admin/users/page.tsx`.
The bulk-create dialog exists (`bulk-create-dialog.tsx`) but supports CSV upload with a fixed schema. There is no "enroll existing users into group" bulk action. For a 200-student course, the instructor must add each student individually or pre-seed via SQL.
**Fix:** Add a bulk-enroll action to the group page: paste a list of usernames or student IDs, auto-match to existing users, create enrollments.
**ETA:** 4 hours.

### F2. TA/assistant cannot do core grading work (HIGH)
**Where:** `src/lib/capabilities/defaults.ts:15-28`.
The assistant role has `submissions.view_source` and `submissions.comment` (fixed since May 3), but still lacks `submissions.view_all` scope restriction. More critically, `submissions.rejudge` is present but `scoreOverrides` table access is gated on `canManageGroupResourcesAsync` which ignores `ta` role. A TA cannot override an autograder error for their own group.
**Fix:** Remove `submissions.view_all` from assistant caps (group filter will activate); add `ta` to `canManageGroupResourcesAsync`.
**ETA:** 2 hours.

### F3. No LMS integration (MEDIUM)
**Where:** N/A — feature absent.
There is no LTI 1.3, no Canvas API, no Moodle integration. Grades must be exported via CSV and manually imported. For a university course, this is a weekly friction.
**Fix:** Add LTI 1.3 Advantage grade passback, or at minimum a "Export to Canvas-compatible CSV" option with standard column headers.
**ETA:** 2-3 days.

### F4. Code similarity is manual review only (MEDIUM)
**Where:** `src/lib/assignments/code-similarity.ts`.
The similarity check computes Jaccard n-gram scores but stores raw results. There is no automatic threshold-based flagging ("Flag pairs above 0.85 for review"). The instructor must open the similarity page, sort by score, and manually inspect each pair.
**Fix:** Add a configurable similarity threshold (default 0.85). Pairs above threshold appear in the anti-cheat dashboard as escalated events.
**ETA:** 3 hours.

### F5. No per-language time-limit multiplier (MEDIUM)
**Where:** `src/lib/db/schema.pg.ts:260` (`timeLimitMs`).
The time limit is a single integer per problem. There is no "Python gets 3x, Java gets 2x" multiplier. Instructors must create duplicate problems with different time limits for different languages, or accept that Python students get an unfair disadvantage.
**Fix:** Add a `languageMultipliers` JSONB column to problems, or compute multipliers from a system-wide table.
**ETA:** 4 hours.

### F6. Assignment clone does not exist (MEDIUM)
**Where:** N/A — feature absent.
Instructors often run the same assignment semester-to-semester with minor changes. There is no "Duplicate assignment" button. The instructor must recreate problems, test cases, and deadlines from scratch.
**Fix:** Add clone endpoints for assignments (with new IDs, copied problems, optionally new test cases).
**ETA:** 1 day.

### F7. Problem import from external sources is manual (LOW)
**Where:** `src/app/(dashboard)/dashboard/admin/problems/page.tsx`.
There is no Polygon integration, no Kattis import, no BOJ problem scraper. Every problem must be typed in manually or imported via the generic DB export/import flow.
**Fix:** Add a "Import from Polygon" or "Import from Kattis" feature that fetches statement, samples, and test data via API.
**ETA:** 2-3 days.

### F8. Contest analytics are read-only (LOW)
**Where:** `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`.
The analytics endpoint returns submission counts, solve rates, and time distributions. But there is no "Export analytics report" button, no PDF generation, and no comparative analysis across contests.
**Fix:** Add CSV/PDF export for analytics; add cross-contest comparison.
**ETA:** 1 day.

---

## Exam integrity: what the instructor needs to know

The platform's anti-cheat is **browser telemetry, not proctoring**. It will catch:
- Students who try to submit from curl without an active browser session (heartbeat freshness blocks this).
- Students whose submission history is implausibly fast or uniform (code similarity + timeline review).
- Students with excessive tab-switching or copy-paste events (signal tier, needs corroboration).

It will NOT catch:
- A student with a second laptop running the actual IDE (heartbeats are honest for the observed browser).
- AI-generated code typed at normal cadence (similarity check compares across this platform's submissions only).
- Screen-sharing to a helper (no screen-capture or eye-tracking).

**Recommendation:** For high-stakes exams, pair JudgeKit with Safe Exam Browser or live proctoring. Use JudgeKit's telemetry as review aids, not standalone evidence.
