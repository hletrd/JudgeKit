# Document Specialist — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Doc/code mismatch audit against authoritative sources
(`docs/`, in-code contract comments, message catalogs).

## DOC5-1 — `docs/exam-integrity-model.md`: flag semantics overstate the code (MEDIUM, High, CONFIRMED)
The heartbeat-correlation section asserts (a) "every such submission is
flagged" and (b) "A flagged submission means the submitting client had no
recent browser-monitor activity" — implying flag ⇔ accepted submission.
Code: flags are also written for rejected attempts (CR5-1 paths). After the
G1 code fix, add one sentence: flags are recorded only for ACCEPTED
submissions and carry the submission id in `details` (update the same
section's `_Last updated:_ stamp).

## DOC5-2 — `review-model.ts:12-18` comment repeats the false "accepted" claim (MEDIUM, High, CONFIRMED)
Same correction as DOC5-1; this comment is the tier model's source of truth
for reviewers reading code. Land with G1 so the comment describes the fixed
system (mirror of cycle-4's V4-2/V4-3 sequencing).

## DOC5-3 — "The instructor still sees this flag in the anti-cheat dashboard" — true only nominally (MEDIUM, High, CONFIRMED)
`submissions.ts:364-371` fail-open rationale + the doc's "reviewer
obligation" paragraph both presume a legible dashboard. The event-type label
for `submission_stale_heartbeat` is missing from BOTH message catalogs
(`messages/en.json`, `messages/ko.json` — verified key-set), so the badge
renders a raw key path. The doc is fine; the catalogs are the defect (G2).
Also add the new event type to any doc listing the event vocabulary if flag
rows gain `submissionId` details (the integrity doc's telemetry-boundary
section lists client events only — correct as-is since the flag is
server-originated; no change needed there).

## DOC5-4 — `messages/*` dead key: `similaritySkippedTooManySubmissions` (LOW, High, CONFIRMED)
Translated in both locales, rendered by a dashboard branch that is
unreachable because the engine never returns `too_many_submissions`
(CR5-3). The fix is in code (emit the reason); the catalogs are already
correct — keep them.

## DOC5-5 — Verified accurate this cycle (provenance)
- `judge/poll/route.ts` header comment ("named poll for historical reasons")
  — matches deployed worker reality; keep.
- `claim-query.ts` invariant comments — verified against the SQL; the
  lock-order/deadlock note is accurate and load-bearing; keep verbatim.
- `exam-close.ts` contract doc — matches both consumers.
- `anti-cheat-storage.ts` MAX_PENDING_EVENTS rationale — verified (V5-5).
- `docs/exam-integrity-model.md` staff-extension + admin-bypass sections —
  match `extendExamSession` SQL and `isAdminLevel` code paths.
- Deployment docs vs `deploy-docker.sh` / CLAUDE.md (algo app-only flags,
  prune prohibitions) — consistent; no drift found this cycle.
