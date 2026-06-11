# Document Specialist — RPF Cycle 3 (2026-06-11)

**HEAD reviewed:** 63429d97. Checked: docs/ against the code they describe, with emphasis on files touching the cycle-1/2 features (exam integrity, backups, deploy hardening, retention).

## DOC3-1 — `docs/exam-integrity-model.md` describes an enforcement behavior the code intentionally removed (MEDIUM, High, CONFIRMED)
Line 55: "Without a fresh heartbeat the submission is rejected with `HTTP 403 antiCheatHeartbeatRequired`." Reality (`src/lib/assignments/submissions.ts:328-355`): fail-OPEN — the submission is accepted and a `submission_stale_heartbeat` escalate-tier event is recorded for human review; the error id survives only as a dead union member (`submissions.ts:36`). The "What this closes" bullet is therefore wrong (the curl path is flagged, not closed) while the doc is stamped `_Last updated: 2026-06-11_`. This is the platform's authoritative integrity statement for instructors/recruiters; it must describe the fail-open posture, the flag's name/tier, and the reviewer's obligation. Bundle the dead-member removal.

## DOC3-2 — Cycle-1's accommodation feature and its integrity semantics are undocumented (LOW-MEDIUM, High, CONFIRMED)
`docs/exam-integrity-model.md` doesn't mention staff time extensions at all, although they change grading-relevant timing (`extendExamSession`, durable-audited, may exceed the assignment close). Once CR3-1 is fixed, the doc should state: extensions move the per-participant window; telemetry and submission acceptance both follow `personal_deadline`; extensions are durably audited (`exam_session.extend`). One paragraph.

## DOC3-3 — `RESTORE_DATABASE_URL` restore-test exists only inside the script (LOW, High, CONFIRMED)
`scripts/verify-db-backup.sh` gained a full restore-test (abfa90f5) gated on `RESTORE_DATABASE_URL`/arg 2, but `docs/deployment.md:379` still describes the script pair without it, no runbook entry, and grep finds zero references outside the script. An operator following the docs will never enable the stronger check. Add: the env var, the CREATE DATABASE rights requirement, the role-match caveat (D3-3 — `ON_ERROR_STOP` + dump ownership statements), and the skip-notice meaning, in `docs/deployment.md` (backup section) and/or `docs/operator-incident-runbook.md`.

## Verified accurate (no action)
- `docs/data-retention-policy.md`: code_snapshots row (180 d, `CODE_SNAPSHOT_RETENTION_DAYS`, createdAt key) matches `data-retention.ts` / `data-retention-maintenance.ts`; the "eight prunes" docstring matches the allSettled set.
- AGENTS.md "Deploy hardening": BuildKit signature, remedy (`docker buildx history rm --all`), non-remedy (`builder prune -af`), sequential default, COMPOSE_PARALLEL_LIMIT — all match `deploy-docker.sh` at this HEAD. The runbook's deploy-build-failure scenario matches `run_remote_build`'s behavior (single retry, loud warn).
- `deploy-docker.sh` header env-var docs match the implemented flags (LANGUAGE_BUILD_STRATEGY default sequential verified at the branch point).
- `docs/exam-integrity-model.md`'s "deliberate telemetry boundaries" section accurately reflects `CLIENT_EVENT_TYPES` and the absence of fullscreen/second-device collection.
- CLAUDE.md production guardrails (no `docker system prune --volumes`; algo app-only flags) are consistent with `.env.deploy.algo` expectations described in the run context.

Final sweep across docs/: no other claim-vs-code mismatch found in the files adjacent to this cycle's change surface; older standing docs (threat-model, monitoring) were re-skimmed at the section level and remain consistent with the register's carried items.
