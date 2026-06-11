# Security Reviewer — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)
**Scope:** OWASP-style pass over the cycle-1 diff + auth/authz surfaces, the
112-route API inventory, secrets handling, deploy script, and sandbox config.

## Findings

### SEC2-1 — `code_snapshots` write surface weaker than its siblings (MEDIUM, High confidence, CONFIRMED)
`src/app/api/v1/code-snapshots/route.ts:14-19` accepts arbitrary `language`
strings of unbounded length (only `min(1)`); submissions and drafts both gate
on `isJudgeLanguage`. Storage-flooding / timeline-pollution vector for any
authenticated user (rate limits bound the QPS but not the per-row size of the
`language` column). Fix: registry gate + (implicitly) the 400 path. Note the
route's authz is otherwise correct: `canAccessProblem` +
`validateAssignmentSubmission` + dual IP/user rate limits.

### SEC2-2 — `code_snapshots` retained forever (MEDIUM, High confidence, CONFIRMED — privacy/data-minimization)
The table holds every examinee's in-progress source every ~10 s
(`problem-submission-form.tsx:140-182`) with IP-adjacent anti-cheat context,
yet it is the ONLY sensitive operational table missing from the retention
pruner: `src/lib/data-retention-maintenance.ts:135-140` covers 7 tables;
`src/lib/data-retention.ts` has no `codeSnapshots` key;
`docs/data-retention-policy.md` has no row. Anti-cheat events themselves are
pruned at 180 d, so the raw keystroke-adjacent evidence outlives the derived
signals — backwards from a privacy standpoint and unbounded on disk. Fix:
prune on `createdAt` (`cs_created_at_idx` already exists in schema.pg.ts)
with default aligned to `antiCheatEvents` (180 d), env-overridable, + policy
doc row + test.

### SEC2-3 — Rate-limit first-insert race (LOW-MEDIUM, Medium confidence)
Shared with code-reviewer CR2-2. Security angle: the failure mode is
fail-OPEN-ish noise (a 500, not a bypass) — no limit evasion, but a
crash-on-contention in the security-control path is still a robustness defect
in the control itself. Fix as CR2-2.

### SEC2-4 — Deploy: BuildKit history-store corruption blocks worker-image refresh (HIGH ops, CONFIRMED on auraedu — injected DEFERRED-OPS-1)
Confirmed diagnosis (Docker 29.1.3 / buildx v0.20.0): "Internal: unknown blob
sha256:... in history" aborts language-image builds; the corrupted ref lives
in the BuildKit HISTORY store — `docker builder prune -af` (which
`deploy-docker.sh:368` already runs) does NOT clear it; `docker buildx
history rm --all` does. Corruption re-occurs under the one-shot ~90-target
parallel bake at `deploy-docker.sh:651-656`. Security relevance: a deploy
path that cannot rebuild judge images delays shipping sandbox/runtime fixes
to the judging fleet. Fix (scheduled): cap/serialize the all-languages build,
auto-detect the signature and run `docker buildx history rm --all` + retry
once, document the runbook signature.

## Audited and found sound (no action)
- **New exam-extend endpoint** (`exam-sessions/[userId]/route.ts`): gated by
  `canManageGroupResourcesAsync` (same write-power gate as score overrides);
  windowed-only; extension-only (zod 1..600 int + lib re-check); durably
  audited with actor/target/minutes/new-deadline. No IDOR: group → assignment
  → session chain is verified (`assignment.groupId !== id` → 404).
- **ipOverlap report** (`anti-cheat/route.ts:184-233`): read-only aggregation
  behind `canMonitorContest`; assignment-scoped named params; LIMIT 100; no
  new data collection. Indexes exist (`ace_assignment_*`).
- **Anti-cheat POST** keeps the strict Origin pinning (SEC M-8) and contest
  boundary checks on DB time.
- **Draft PUT language gate (cycle-1 F2)** verified in place; DELETE
  deliberately permissive (documented).
- **`/api/v1/test/seed`**: triple-gated (NODE_ENV !== production AND
  PLAYWRIGHT_AUTH_TOKEN set AND localhost via hop-validated extractClientIp
  AND timing-safe bearer compare). Inert in production.
- **proxy.ts auth cache**: TTL capped at 10 s; negative caching documented;
  CSP nonce from crypto.getRandomValues.
- **Secrets:** `.env.production` 0600 both sides; remote backfill never
  rotates existing values; no secrets in repo (spot-checked .env.example).
- **make_interval extension SQL** is fully parameterized via drizzle sql
  template (`exam-sessions.ts:151`).

## Residual risks (carried, with exit criteria in the cycle-1 register)
- PS2 (no fullscreen-presence signal — documented posture), TA1 (TA exam
  content separation), per-assignment AI-override granularity (TR2). All
  policy-level, unchanged preconditions.
