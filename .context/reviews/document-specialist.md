# Document Specialist — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Lens: doc↔code mismatches against authoritative
sources (code wins).

## Checked surfaces
`AGENTS.md`, `README.md`, `docs/` (25 files incl. the new
`judge-worker-gvisor.md`), `.env.example`, `.env.production.example`,
`SECURITY.md`, in-code contract comments in the delta.

## Findings

### DS1 — Retention policy doc vs code: NOW CONSISTENT (no finding)
`docs/data-retention-policy.md:13` documents "Audit events — 90 days
(`AUDIT_EVENT_RETENTION_DAYS`)"; before H2 this was a doc-promises-more-than-
code-delivers mismatch, and `pruneAuditEvents`
(`data-retention-maintenance.ts:86-90`) now actually enforces it. Verified
consistent — H2 closed a doc/code mismatch as a side effect. One gap remains:
the new `source_drafts` table has no retention window in either the doc or the
code (cross-ref security S1 — drafts are never pruned). When S1's fix lands,
decide and document a draft retention policy line.

### DS2 — NODE_ENCRYPTION_KEY is now boot-required but absent from every operator-facing template/doc (MEDIUM, confidence High — verified by grep)
Commit a5e66736 added `NODE_ENCRYPTION_KEY` to `assertProductionConfig`
(`src/lib/security/production-config.ts:31`), so a production app container
**refuses to boot** without it. But grep confirms the variable appears in
NONE of: `.env.example`, `.env.production.example` (the template operators
copy for the compose `env_file`), `docs/deployment.md` (whose required-env
table lists only `PLUGIN_CONFIG_ENCRYPTION_KEY` — a DIFFERENT key used by
`src/lib/security/derive-key.ts:10` for plugin secrets), or
`docs/admin-security-operations.md`.
**Failure scenario:** a fresh tenant deploy following `docs/deployment.md` +
`.env.production.example` verbatim crash-loops at startup (clear error
message, but the docs led straight into it). Existing prod hosts are
unaffected (their `.env.production` already carries the key — Jun-4 deploy
succeeded).
**Fix:** add `NODE_ENCRYPTION_KEY` to `.env.example`,
`.env.production.example`, and the `docs/deployment.md` required-env table,
clearly distinguishing it from `PLUGIN_CONFIG_ENCRYPTION_KEY`.
Other new knobs (`JUDGE_MAX_OUTPUT_BYTES`, `JUDGE_COMPILE_TIMEOUT_MS`,
`JUDGE_COMPILE_MEMORY_MB`, `JUDGE_OCI_RUNTIME`, `PRIVACY_CONTACT_EMAIL`) are
documented (gVisor has a dedicated doc).

### DS3 — AGENTS.md language table self-declares drift tolerance (no finding)
The table header says to treat `languages.ts`/`docs/languages.md` as source of
truth when drifting — the documented contract makes the static table advisory.
OK as-is.

### DS4 — In-code contract comments verified accurate (no finding)
- `claim-query.ts` header (token fence, SKIP LOCKED, named params) — matches.
- `use-server-source-draft.ts` SAFETY INVARIANTS — verified true (tracer T4).
- `worker-staleness.ts` two-threshold doc — matches sweep implementation.
- `verify-db-backup.sh` usage comment matches its opt-in restore-test behavior.
- The carried DOC-C5-2 (`staleClaimTimeoutMs` dead field in /register payload
  docs) is unchanged — RE-DEFER (Rust worker only deserializes).

### DS5 — README `/api/v1/time` doc (carried C7-DS-1) — unchanged, RE-DEFER
(README rewrite cycle precondition unmet.)

## Final sweep
Grepped the delta's new i18n keys (en/ko both updated — `messages/` diff
symmetric); checked SECURITY.md against the new gVisor option (gVisor doc
cross-links correctly); checked that no doc instructs `docker system prune`
variants forbidden by CLAUDE.md (deploy docs comply — explicit warnings
present). No HIGH/MEDIUM doc mismatch.
