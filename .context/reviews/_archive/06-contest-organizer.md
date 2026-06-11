# Contest Organizer Perspective Review: JudgeKit

**Reviewer persona:** ICPC/IOI contest organizer, programming competition director
**Date:** 2026-04-17 (Post-Plan-008)

---

## 1. Contest Setup — 8/10

**What works well:**

Dual scoring models (ICPC binary + penalty, IOI best-score-per-problem) with configurable selection per contest. Freeze period support for ICPC-style scoreboards. Scheduled and windowed exam modes. Access code manager for participant join flow. Recruiting mode with token-based invitations for hiring events. Problem assignment with per-problem points and time/memory limits.

**What needs improvement:**

- **No virtual contest mode.** Participants cannot practice past contests under timed conditions. Every major competitive programming platform (Codeforces, AtCoder, LeetCode) supports this. A significant gap for community building and training.
- **No per-language time limit multipliers.** Python needs 3-5x the time of C++ for the same problem. Organizers must create separate problems per language tier, which doubles/triples the problem set.
- **Quick-create form is too minimal.** Defaults to windowed exam mode, no scheduled-mode option, no scoring model selector, no visibility toggle.
- **Contest creation has two disconnected paths.** "Quick create" vs. "create from group" — confusing for new organizers.
- **No contest template system.** Cannot save configurations as reusable templates for recurring events (weekly contests, annual competitions).
- **No contest import/export.** Cannot transfer a contest between JudgeKit instances.

---

## 2. Live Contest Operations — 8.5/10

**What works well:**

Real-time leaderboard with live updates via SSE. ICPC-style freeze period. Animated replay between ranking snapshots for post-contest review. Countdown timer with server time sync. Anti-cheat monitor with event tracking. Clarification system (if implemented via discussion). Windowed exam with personal deadlines. Submission queue with live progress bar.

**What needs improvement:**

- **No clarification/request system.** ICPC contests require a way for participants to ask questions and organizers to respond. JudgeKit has discussion threads but no contest-specific clarification UI.
- **No broadcast announcement system.** No way to push messages to all participants (e.g., "Test case 2 for Problem C has been corrected").
- **Leaderboard freeze is a single timestamp.** No unfreeze action or publish-leaderboard toggle — purely time-based. Organizers cannot unfreeze early or publish final results with a button.
- **No rejudge with notification.** When a test case is corrected and submissions are rejudged, affected participants receive no notification that their score changed.
- **No contest pause/resume.** If a technical issue occurs mid-contest, there is no way to pause the timer and resume later.

---

## 3. Scoring and Ranking — 9/10

**What works well:**

This is the platform's strongest area. Both ICPC (binary solved + 20-minute penalty per wrong attempt) and IOI (best score per problem, summed) scoring are implemented correctly. `contest-scoring.ts` handles late penalties, score caching (30-second TTL with stale-while-revalidate), and tie-breaking. The leaderboard updates in real-time. Replay feature animates ranking changes between snapshots — excellent for post-contest review streams.

The recruiter candidates panel provides ranked views with per-problem scores, anti-cheat flag counts, and CSV export with formula injection protection.

**What needs improvement:**

- **No custom scoring formulas.** Some contests use weighted scoring, drop-lowest, or custom aggregation. Only ICPC and IOI are supported.
- **No team scoring.** ICPC is a team competition, but JudgeKit only supports individual participants. No team formation, team submission, or team leaderboard.
- **No partial scoring display options.** IOI-style shows best score per problem, but some contests want to show "current best" vs "final best" with different visibility rules.

---

## 4. Post-Contest Analytics — 8/10

**What works well:**

Rich analytics: score distribution bar charts, solve rate per problem, solve time distribution, anti-cheat summary, score progression timeline. CSV/JSON export of contest data. Recruiter panel for hiring events.

**What needs improvement:**

- **Charts are custom SVG, not interactive.** Hand-coded `SVGBarChart`, `SVGStackedBar`, `SolveTimeChart` lack hover tooltips (beyond basic `<title>`), zoom, pan, or click-to-drill-down. A charting library would provide a better experience.
- **No analytics export.** Can export raw data but not the analytics visualizations or aggregated data.
- **No comparative analytics.** Cannot compare this contest's performance against previous editions.
- **No per-problem editorial system.** Post-contest editorials (solution explanations) are standard on competitive programming platforms. JudgeKit has an "editorial" tab in practice mode but no built-in editor for writing them.

---

## 5. Participant Management — 7/10

**What works well:**

Access code system for joining. Recruiting invitations with token-based access. Participant list with submission counts and anti-cheat flags. Score override dialog with reason field.

**What needs improvement:**

- **No bulk registration.** Adding 200 participants to a contest requires individual access codes or manual enrollment. No CSV import of participant lists.
- **No participant grouping.** Cannot group participants by institution, region, or division for multi-site contests.
- **No disqualification mechanism.** No way to DQ a participant for rule violations. Must manually adjust scores or remove submissions individually.
- **No IP/session tracking during contest.** Anti-cheat events are logged but there is no real-time dashboard showing which participants have suspicious activity patterns during the contest.

---

## 6. Platform Comparison — How Does JudgeKit Stack Up?

| Feature | JudgeKit | Codeforces | DOMjudge | Kattis |
|---|---|---|---|---|
| ICPC scoring | Yes | Yes | Yes | Yes |
| IOI scoring | Yes | No | No | Partial |
| Virtual contest | No | Yes | No | No |
| Team scoring | No | Yes | Yes | No |
| Replay | Yes | No | No | No |
| Freeze | Yes | Yes | Yes | Yes |
| Per-language limits | No | Yes | Yes | Yes |
| Clarifications | No | Yes | Yes | Yes |
| Broadcasts | No | Yes | Yes | Yes |
| Editorials | Partial | Yes | No | Yes |
| Anti-cheat | Weak | Basic | External | External |
| Self-hosted | Yes | No | Yes | No |
| Recruiting mode | Yes | No | No | No |

**JudgeKit's unique advantages:** IOI scoring + replay + recruiting mode + self-hosted. No other platform has all four.

**JudgeKit's critical gaps:** Virtual contest, team scoring, per-language limits, clarifications.

---

## Summary Scorecard

| Area | Score | Key Issue |
|---|---|---|
| Contest Setup | 8/10 | No virtual contest, no per-language limits |
| Live Operations | 8.5/10 | No clarifications, no broadcast, no pause |
| Scoring & Ranking | 9/10 | No team scoring, no custom formulas |
| Post-Contest Analytics | 8/10 | Non-interactive charts, no comparative analytics |
| Participant Management | 7/10 | No bulk registration, no DQ mechanism |
| **Overall** | **8/10** | Best-in-class for ICPC/IOI self-hosted; needs virtual + team support |

---

## Priority Actions for Contest Organizers

1. **Add virtual contest mode** — Most requested feature by competitive programming communities
2. **Add per-language time limit multipliers** — Essential for multi-language contests
3. **Add clarification/request system** — Required for ICPC-style events
4. **Add broadcast announcements** — Essential for contest operations
5. **Add team scoring** — Required for ICPC regional/world finals
6. **Add contest pause/resume** — Required for handling technical issues mid-contest
