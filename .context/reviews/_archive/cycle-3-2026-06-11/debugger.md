# Debugger (latent bug surface, failure modes) — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Hunt: failure modes and regressions in the cycle-1/2 surface; edge cases the happy-path tests don't exercise.

## D3-1 — Accommodated examinee enters a self-reinforcing "suspicious" state (MEDIUM-HIGH, High, CONFIRMED; shared root cause with CR3-1)
Reproduction (from code): windowed exam, anti-cheat ON, staff extends a session past `assignment.deadline`; clock passes the assignment close. Now: anti-cheat POST → 403 (`anti-cheat/route.ts:102-104`); monitor queues + retries ×3 → drops; submission → fail-open flag `submission_stale_heartbeat` per submission (`submissions.ts:336-347`); heartbeat-gap report paints the window as one continuous gap. Every signal an instructor uses to detect cheating fires on the honest accommodated student, and no signal exists for an actual cheater in that window. Single-line-class fix at the boundary check (honor `personal_deadline`); test must cover heartbeat AND non-heartbeat events plus the no-flag-on-submission assertion.

## D3-2 — Anti-cheat monitor: permanent 4xx churn (LOW, High, CONFIRMED)
Same mechanism as CR3-2 — note the additional debugger-angle failure mode: while dead 403 events occupy the queue, `performFlush` is serial, so a REAL transient failure of a later event happens behind up to 3×(dead-event latency) — under exam-end load this can push a tab_switch event's delivery past the contest end, where it is then also 403'd. Cascading loss. Tri-state send result fixes both.

## D3-3 — `verify-db-backup.sh` restore-test can false-negative on role/extension mismatch (LOW, Medium, NEEDS MANUAL VALIDATION on the prod host)
`scripts/verify-db-backup.sh` (restore-test block): plain-format dumps replay `ALTER ... OWNER TO <role>` and `CREATE EXTENSION` statements; with `ON_ERROR_STOP=1`, restoring under a DSN role different from the dump's owner (or without extension privileges) aborts and reports "backup is not restorable" for a perfectly restorable dump. The judgekit prod dumps use the same `judgekit` role, so the default topology is fine — but the first time an operator points `RESTORE_DATABASE_URL` at a generic scratch instance they will get a scary false alarm. Mitigation: document the role requirement next to the env var (it is currently documented NOWHERE outside the script — see DOC3-2), or filter with `psql -v ON_ERROR_STOP=1` only after `SET ROLE`-compatible preprocessing. Documentation is the proportionate fix.

## D3-4 — `run_remote_build` retry overwrites the first failure log (LOW, Medium, CONFIRMED)
`deploy-docker.sh` recovery path: the retry `tee`s into the same `$out_file`; if the retry fails too, the original corruption log is gone. The warn lines preserve the signature, so triage survives; full forensics do not. Optional one-liner (`${out_file}.retry`) — defer-eligible.

## Edge cases probed and found SOLID
- `CountdownTimer`: deadline prop moving past→future resets `expired`, re-arms thresholds, clears stale announcements (lines 69-78). Hidden-tab threshold-spam suppression intact.
- `ExamDeadlineSync`: `inFlight` guard prevents overlap; `cancelled` flag prevents setState-after-unmount; equal/earlier deadlines ignored (clock-skew safe); JSON parse failures swallowed safely.
- `startExamSession` race: `onConflictDoNothing` + authoritative re-fetch inside the tx — double-click/StrictMode double-start safe.
- `sweepStaleWorkers` concurrent with heartbeat-route sweep: both run the same idempotent status-conditional UPDATEs; no double-log (WHERE filters on prior status) and no lost heartbeat (heartbeat sets `online` after the sweep's cutoff computation by timestamp comparison, not read-modify-write).
- Rate-limit lost-race paths: verified no remaining bare INSERT in `rate-limit.ts` / `api-rate-limit.ts` / `rate-limit-core.ts` (grep + read); `checkServerActionRateLimit` `maxRequests=1` immediate-block preserved in the fresh-key path (`blockedUntil: 1 >= maxRequests ? ...`).
- `insertRateLimitEntryIfAbsent` under drivers returning `rowCount: null` → coerces to 0 → treated as lost race → harmless re-read path (correct degradation).

No regressions found in the cycle-1/2 surface beyond the items above.
