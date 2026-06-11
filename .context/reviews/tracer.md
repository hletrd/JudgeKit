# Tracer review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · gates green.
**Lens:** causal tracing of suspicious flows; competing hypotheses.

## Trace 1 — Where can a `submission_stale_heartbeat` row come from?
Goal: enumerate ALL producers of the escalate-tier flag and the causal chain
each implies for a reviewer.

Producers found (exhaustive grep + call-graph):
1. `POST /api/v1/submissions` → `validateAssignmentSubmission` → flag when the
   freshness probe misses. Intended semantics.
2. `POST /api/v1/code-snapshots` (autosave, every 10–60 s while editing —
   `problem-submission-form.tsx:140-182`) → same validator → same flag.
   Causal meaning for the reviewer: "the editor autosaved" — NOT a submission.
3. GET page render `practice/problems/[id]?assignmentId=…`
   (`page.tsx:166-175`) → same validator → same flag. Causal meaning: "the
   student navigated to the problem" — NOT a submission.
Competing hypothesis rejected: "the monitor's first heartbeat lands before the
first render flag" — impossible; the render completes (and inserts) before the
client receives HTML and mounts `AntiCheatMonitor`, and the privacy-notice
gate delays the first heartbeat further (`anti-cheat-monitor.tsx:188-199`).
Conclusion: flag rows are not interpretable as submissions today (joint with
CR4-1/D4-1/V4-2). Confidence: High, CONFIRMED.

## Trace 2 — What stops a flag from firing when it should?
The freshness probe (`submissions.ts:320-330`) reads the latest row of ANY
type. Producers feeding it include the flag itself (Trace 1) and
`code_similarity` (`code-similarity.ts:421`, inserted for both members of a
flagged pair when staff run a similarity check). Chain: staff runs a
similarity check mid-contest → both students' freshness refreshes → a curl
submission inside 90 s is NOT flagged. Also any Trace-1 false flag suppresses
real flags for 90 s. Confidence: High, CONFIRMED (AGG4-2).

## Trace 3 — Extension accommodation end-to-end (post cycle-3)
Staff extend → `extendExamSession` SQL-composes minutes onto
`personal_deadline` → student's 60 s poll (`exam-session` GET) returns the new
ISO → `ExamDeadlineSync` extends countdown (never shrinks, `:70`) +
router.refresh recomputes gates → submissions honored via
`getEffectiveExamCloseAt` (validator) → telemetry honored via the same helper
on the ingest's past-close branch → late-penalty scoring keys on
`personal_deadline` (`buildIoiLatePenaltyCaseExpr` usage,
`submissions.ts:662`). No remaining consumer of `assignment.deadline` that
should honor the personal deadline was found: the leaderboard freeze, contest
status labels (`getContestStatus`), and IP-overlap report are
participant-agnostic by design. One nuance, NOT a bug: `getContestStatus`
(contests.ts:52-58) reports "closed" at the assignment close even for an
extended participant — the per-participant UI uses the personal deadline
(verified `page.tsx:201`), and the list-page label is cosmetic. Logged for the
designer/persona lenses to weigh. Confidence: Medium-High.

## Trace 4 — Concurrent flush/report on the client queue
Interleaving diagram (performFlush load @ t0, await send @ t0+ε, reportEvent
load/push/save @ t0+2ε, performFlush save @ t0+3ε) ⇒ append lost. Window is
one in-flight POST (~RTT); triggers: blur during refocus-flush. Double-send
variant with two concurrent flush loops (mount + online). Confidence: Medium,
LIKELY — matches D4-3/P4-3; recommend deterministic claim-loop fix.

No other suspicious flows surfaced this cycle; ingest boundary checks, judge
claim staleness reclaim (log evidence in unit run), and audit flush-on-shutdown
chains were traced without contradiction.
