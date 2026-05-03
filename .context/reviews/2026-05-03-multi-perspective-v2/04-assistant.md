# Teaching Assistant (Assistant Role) Perspective Review

**Date:** 2026-05-03
**Persona:** Senior undergraduate or graduate TA assigned to one or two course groups. Holds office hours, answers Piazza-equivalent threads, runs plagiarism checks on weekly assignments, regrades when a student notes a judge bug, runs lab sessions where students need real-time help.
**Method:** Read `src/lib/capabilities/defaults.ts`, the `assistant` role definitions, `src/lib/discussions/`, the `group_instructors` schema and capability gates, and prior assistant reviews under `.context/reviews/`.
**Posture:** Critical. The standard of comparison is the ad-hoc Piazza + Gradescope + DOMjudge setup most TAs are familiar with.

---

## TL;DR

The `assistant` role *exists*. It is genuinely group-scoped now (no longer a synonym for "view all submissions across the platform"). But its capability set sits awkwardly between "viewer" and "junior instructor". The README (and the platform docs) describe it as "view + comment-only", which is honest but leaves the role unable to do most of what TAs at universities actually do day-to-day.

| Use case | Score | One-line |
|---|:---:|---|
| Lab session live help | 5.5 | Can view submissions, can comment. Cannot run code as the student. |
| Office-hours regrade requests | 4.0 | Cannot override a score. Must escalate to instructor. |
| Plagiarism review | 6.0 | Can run similarity. Pair-diff visualization is missing. |
| Discussion / Q&A moderation | 5.0 | Cannot moderate threads in own group. |
| Authoring practice problems | 1.0 | Blocked. Common TA duty at most departments. |
| Authoring weekly assignments | 1.0 | Blocked. |
| Granting individual deadline extensions | 2.0 | Blocked outside exam mode. |
| Bulk operations on own group's roster | 3.0 | Mostly blocked. |

Aggregate: **3.7 / 10**, the lowest of any persona — not because it is broken, but because the role is intentionally narrow and the platform pretends it is wider than it is.

---

## What works

- **Group scoping is real, not just a UI hide.** Per the explore findings, `submissions.ts` (≈line 165-179) enforces TA visibility at the query layer via the `assignments.view_status` derivation. A TA assigned to CS101 cannot list submissions from CS260, even by guessing IDs.
- **Comment / annotate submissions.** TAs can leave line-level or submission-level comments. This is the single most important power for a TA, and it works.
- **Re-judge submissions.** The TA can rejudge a submission when a judge bug or test-case fix happens.
- **Run code-similarity.** The TA can trigger Jaccard-n-gram similarity on a group's submissions.
- **View source code with syntax highlighting.** Standard but necessary.

---

## What is intentionally blocked

This is not a list of bugs — it is a list of *design choices* whose consequences should be considered before adopting JudgeKit at a university.

1. **No score override.** `canManageGroupResourcesAsync` (per `src/lib/assignments/management.ts:82-85` per the explore findings) recognizes only `co_instructor`, not `ta`. A TA who spots a wrong test case (CRLF vs LF, trailing newline, locale-dependent number formatting) cannot fix the affected scores. Every fix becomes an instructor escalation.
2. **No problem authoring.** TAs commonly write practice problems, recitation sets, lab worksheets. Blocked.
3. **No assignment authoring.** Same.
4. **No individual deadline extensions** outside exam mode. Disability accommodations, religious observance, family emergencies — all need the instructor.
5. **No discussion moderation.** Even in the TA's own group, they cannot pin or moderate threads.
6. **No bulk operations on the roster.** Cannot bulk-extend, cannot bulk-message, cannot bulk-mark-attendance equivalents.

---

## Where the role is ambiguous

- **`co_instructor` vs `ta`.** Two roles inside `group_instructors`. `co_instructor` gets meaningfully more capabilities, but the difference between them is not surfaced in any in-product help. Is `ta` "the head TA who can do almost anything" or "any TA on the roster"? The platform implicitly assumes the latter; many departments staff the former.
- **What does "view + comment-only" actually mean?** The README describes the assistant role this way, but in practice the TA can also re-judge and run plagiarism — both of which are write-ish actions on submission state. The disclosure should match the capability set.
- **Is the group-scoping leaky on derived endpoints?** Group-scope is enforced at the SQL layer for the main read paths. Not all admin endpoints have been audited from a TA-leakage angle in the latest reviews. See security review for the formal posture.

---

## Concrete pain points

These are the things that will cause a TA to write a frustrated Slack message in the first three weeks:

1. **"My score is wrong on problem 7" emails pile up.** TA cannot fix. Instructor's inbox fills with TA escalations of TA escalations of student escalations.
2. **"Can I get an extension because I had COVID?" requests pile up.** TA cannot grant. Same chain.
3. **Plagiarism flag → "what did they actually copy?".** Without a side-by-side diff in the admin UI (per the explore findings), the TA exports both submissions and diffs them externally. Adds 10 minutes per case across hundreds of cases per term.
4. **Lab session: "the autograder rejected my code, what was the input?".** TAs cannot view hidden test cases by default. Helping a student debug a wrong-answer-on-test-3 means the TA cannot actually see test 3.
5. **"Did Alice submit before the deadline?" forensic requests.** TAs can see submission timestamps but cannot easily produce a clean "here is the timeline of Alice's session with anti-cheat events overlaid" view.
6. **No "drafts under review" inbox.** When students appeal an autograde verdict, there is no shared TA queue. Each TA hunts through the submissions list independently.

---

## What I would change for "real-TA" mode

The simplest path to a usable TA role is *not* to grant `co_instructor`-equivalent permissions blindly. It is to add a small set of capabilities that match real-world TA duties:

1. **Score override on a single submission**, with an audit trail tying the change to the TA. Already a recorded operation in the audit log; just unblock the gate.
2. **Grant per-student deadline extension** on an assignment in the TA's group, with a maximum (e.g., 7 days) configurable by the instructor.
3. **Pin / moderate discussion threads** in the TA's group.
4. **Author practice problems** that are not assigned (so they cannot inadvertently change a graded assignment), but which the TA can show students in office hours.
5. **View hidden test inputs** for the TA's group's assignments. Yes, this is a leak vector — but it is a *necessary* one for office hours to work. The mitigation is to disclose this to students ("TAs can see hidden tests when helping you debug").
6. **A submission-pair diff view** in the admin UI for any pair flagged by similarity, scoped to the TA's group.

These six are small, additive, and would lift the assistant score from 3.7 to ~6.5.

---

## What I would NOT grant a TA

- Authoring graded assignments. The grade contract should remain instructor-controlled.
- Modifying the roster (bulk enroll / unenroll). Roster decisions are the instructor's.
- Visibility outside the TA's assigned group(s).
- Managing platform-wide settings.
- Backup / restore / system-info endpoints (these are operator-level).

The current platform mostly gets these "no" answers right. The "yes" answers are the gap.

---

## Bottom line

The assistant role works at the SQL layer — group scope is real and not a UI hide. The capability gates are too narrow for practical TA duties at a real university. This is a conscious choice to keep the role safe; it is also a real adoption blocker because every department's TAs do more than "view + comment".

Treat the assistant role as MVP. Plan to extend it before you scale. Until then, every department adopting JudgeKit is going to add three or four "co-instructor (it's actually a TA)" entries per group, which then defeats the point of the distinction.
