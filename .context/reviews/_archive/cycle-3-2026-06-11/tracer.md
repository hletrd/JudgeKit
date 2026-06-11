# Tracer (causal flows, competing hypotheses) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Method: end-to-end causal trace of the exam time-extension flow (the cycle-1/2 feature pair), then the anti-cheat event lifecycle under failure.

## Trace 1 — Staff extension, end to end
1. Staff opens `ExamExtendDialog` (status board, canManage-gated) → `PATCH /api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]` body `{extendMinutes}`.
2. Route (`exam-sessions/[userId]/route.ts:25-90`): group → canManage gate → windowed-only check → `extendExamSession` SQL `personal_deadline + make_interval(mins => N)` (composes under concurrency, never shrinks) → durable audit. ✅
3. Student client: `ExamDeadlineSync` (60 s interval + refocus) GETs `exam-session`, sees later `personalDeadline`, moves countdown LATER only, toast + role=status note, `router.refresh()` recomputes server gates. Verified the component mounts even in the expired state (`page.tsx:197-207`) so post-expiry rescue works. ✅
4. Student submits past the original close: `validateAssignmentSubmission` honors the session deadline (`submissions.ts:259-271`, `:300-302`). ✅
5. **BREAK** — student's browser monitor posts heartbeat/tab events: `anti-cheat/route.ts:102-104` rejects 403 `contestEnded` because only `assignment.deadline` is consulted. Telemetry stops; queue churns (monitor retries 4xx); each submission then writes a `submission_stale_heartbeat` escalate flag (`submissions.ts:336-347`); the heartbeat-gap report paints the window as a gap. The chain that cycles 1–2 built is intact for WORK and broken for OVERSIGHT. (MEDIUM-HIGH, High, CONFIRMED — root cause single-sourced at the boundary check.)

Competing hypotheses considered and rejected:
- H2 "the monitor unmounts at the old deadline so no events are attempted": false — the monitor is mounted by the workspace layout independent of the countdown; events are attempted and 403'd.
- H3 "getExamSession GET also dies at the assignment close, so the sync never sees the extension": false — the GET has no deadline gate; only group access + exam-mode checks.
- H4 "scheduled-mode exams hit the same break": n/a — extensions exist only for windowed mode (`examModeInvalid` guard in the PATCH).

## Trace 2 — Anti-cheat event lifecycle under server rejection
`reportEvent` → `sendEvent` (`anti-cheat-monitor.tsx:52-69`) → non-OK → push to localStorage with `retries:1` → `scheduleRetryRef` backoff (1 s→2 s→4 s→8 s) → `performFlush` re-sends serially → after `retries ≥ 3` the event is silently dropped from the queue. Consequences: (a) permanent 4xx rejections (origin mismatch, contestEnded, forbidden) consume the full retry ladder; (b) ordering: a dead 403 event at queue head delays live events behind it by up to the full backoff; (c) silent drop is the right end state but is indistinguishable (client-side) from delivery — acceptable since the server is authoritative, but it means CR3-1's blackout is invisible to the student. Fix shape (CR3-2): tri-state send result, drop permanent rejections immediately.

## Trace 3 — BuildKit self-heal path (re-verified after cycle-2 hardening)
`run_remote_build` failure → grep signature on captured output → `docker buildx history rm --all` on that host → retry once → second failure propagates to `die`. Confirmed: the retry's `tee` reuses `$out_file`, so the FIRST failure log is overwritten (forensics lose the original corruption signature context). LOW, Medium — the warn lines preserve the signature fact itself; only the full first log is lost. Optional: tee the retry to `${out_file}.retry`.

No other suspicious flows surfaced in this cycle's diffs; the rate-limit lost-race flow was traced and matches the tests (winner commits, loser blocks on FOR UPDATE re-read, both verdicts non-throwing).
