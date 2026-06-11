# Document-specialist review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4.
**Lens:** doc/code mismatches against authoritative sources (the code).

## DOC4-1 — `exam-integrity-model.md` promises submission-only flag semantics; code disagrees (MEDIUM, High, CONFIRMED)
`docs/exam-integrity-model.md:54` ("A submission with a stale … heartbeat is
accepted, and a `submission_stale_heartbeat` … event is recorded instead") and
`:56` ("A flagged submission means 'the submitting client had no recent
browser-monitor activity'") are false at this HEAD: the recording site is the
shared validator, which also runs on problem-page renders
(`practice/problems/[id]/page.tsx:167`) and autosave snapshots
(`code-snapshots/route.ts:62`). The reviewer-obligation paragraph therefore
instructs staff to treat page opens as suspicious submissions. Resolution:
fix the code to match the doc (AGG4-1 — the doc describes the RIGHT design),
then add one clarifying sentence that only the submit path records the flag
and that autosaves/page loads never do.

## DOC4-2 — `review-model.ts` inline comment same mismatch (LOW, High, CONFIRMED)
`src/lib/anti-cheat/review-model.ts:12-15` — update wording with AGG4-1 so the
tier table's "Server-recorded" description stays truthful.

## DOC4-3 — Verified-accurate list (no action)
- `exam-close.ts` header narrative matches both consumers and history.
- "Staff time extensions" doc section (cycle-3 G2) matches `extendExamSession`
  semantics incl. SQL-composed concurrent extensions and audit event name
  (`exam_session.extend` — grep-confirmed in audit emitters).
- `deploy-docker.sh` header env table includes the new `E2E_HOME_HEADING` knob
  with the same default-fallback semantics the specs implement (`|| "Write
  code|코드를"` / responsive variant) — consistent.
- `docs/deployment.md` restore-test section (cycle-3 G6) matches
  `verify-backup` behavior: full `RESTORE_DATABASE_URL` path, role-match
  caveat, skip notice (script cross-checked).
- AGENTS.md "Deploy hardening" list still matches script behavior (BuildKit
  self-heal, sequential language builds default) — unchanged since cycle-3
  verification.
- Test-seed route header security model (PLAYWRIGHT_AUTH_TOKEN gate,
  timing-safe compare, localhost via validated hops) matches implementation.

## Sweep
README/SECURITY.md unchanged this cycle; no version-number or CLI-flag drift
found in `docs/` against current scripts. The only live mismatches are
DOC4-1/2, both scheduled with the code fix.
