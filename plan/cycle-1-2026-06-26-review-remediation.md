# Cycle 1 (2026-06-26) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (2026-06-26 cycle, head `0b0ac198`)
Prior cycle-1 plan (`cycle-1-review-remediation.md`) archived — its items (chrono, trusted registries, var→let) all verified DONE by this cycle's verifier.

Repo rules honored: semantic commits + gitmoji, GPG-signed, fine-grained (one fix per commit), every commit includes relevant tests (`.context/development/conventions.md`, AGENTS.md), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT deferred (CLAUDE.md "Secrets & Credentials"; AGENTS.md testing rules).

This is cycle 1 of an iterated loop. Phase A is implemented this cycle (PROMPT 3); Phase B is scheduled for subsequent cycles (planned, not deferred); Phase C records low-severity deferrals with provenance.

---

## Phase A — Implement this cycle

### A1. AGG-11 / SEC-1 — Tighten `.env*` file permissions to 0600 + startup guard
- Files: `.env`, `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`, `.env.worv` (chmod 600); `src/lib/security/env.ts` (add production mode check)
- Severity: HIGH (policy violation: CLAUDE.md "Secrets & Credentials" via AGENTS.md:427)
- Do: `chmod 600` the six files; add a startup check that `fs.statSync`-validates the loaded env file mode in production and refuses to boot if group/other bits are set.
- Tests: unit test for the mode validator.
- Exit: files 0600; startup guard tested; `.env.production` already 0600.

### A2. AGG-3 / CR-4 — Restore audit must survive the import transaction
- Files: `src/app/api/v1/admin/restore/route.ts:151-163`; mirror `src/app/api/v1/users/[id]/route.ts:491-506` (post-commit durable audit pattern)
- Severity: HIGH (audit integrity)
- Do: record the restore audit AFTER `importDatabase` commits (post-commit), reusing the durable-audit helper used by user deletion.
- Tests: extend `tests/unit/api/admin-restore*.test.ts` to assert audit survives a successful import (mock import to truncate auditEvents, then assert the post-commit audit row exists).
- Exit: restore audit row present after successful restore; test covers the truncate-survival case.

### A3. AGG-4 / CR-1 / SEC-2 — Group DELETE IDOR
- File: `src/app/api/v1/groups/[id]/route.ts:192-217` (DELETE)
- Severity: CRITICAL/HIGH (IDOR)
- Do: fetch `instructorId` inside the tx, call `canManageGroupResourcesAsync(...)`, deny unless `caps.has("groups.view_all")` — mirroring PATCH (L127) and GET (L58).
- Tests: negative-authz test (user with `groups.delete` but not owner/view_all → 403 on another instructor's group).
- Exit: non-owner `groups.delete` holder gets 403.

### A4. AGG-5 / CR-12 / SEC-3 — Student→co_instructor escalation
- File: `src/app/api/v1/groups/[id]/instructors/route.ts:74-100` (POST)
- Severity: HIGH (privilege escalation)
- Do: validate target user's role — reject `getRoleLevel(targetUser.role) <= 0` (mirror `groups/[id]/route.ts:160` ownership-transfer gate).
- Tests: student target → 409/403; valid instructor target → 201.
- Exit: student cannot be added as co_instructor.

### A5. AGG-7 / CR-3 / SEC-7 — api-keys PATCH escalation gap
- File: `src/app/api/v1/admin/api-keys/[id]/route.ts:51-86`
- Severity: HIGH (escalation)
- Do: fetch existing key's role; apply `canManageRoleAsync(user.role, existing.role ?? body.role)` to ALL field mutations (not only when `body.role` changes).
- Tests: manager toggling `isActive` on a higher-privilege key → 403.
- Exit: no field on a higher-privilege key can be mutated without role authority.

### A6. AGG-8 / CR-8 / SEC-6 — Chat-widget prompt injection
- File: `src/app/api/v1/plugins/chat-widget/chat/route.ts:370-376, 432-436`; `tools.ts:208`
- Severity: HIGH (academic-integrity)
- Do: apply `sanitizePromptInput` to every user-supplied message string and tool result before concatenation; Zod-validate `toolArgs` per tool; add threat-surface comment at `executeTool`.
- Tests: unit test that an injection payload in `body.messages` is neutralized before reaching the provider mock.
- Exit: `sanitizePromptInput` applied on both branches.

### A7. AGG-9 / CR-9 / SEC-8 — XFF spoofing when `TRUSTED_PROXY_HOPS=0`
- File: `src/lib/security/ip.ts:79-99`
- Severity: HIGH/MEDIUM (rate-limit/audit/allowlist poisoning)
- Do: when `trustedHops === 0`, ignore XFF entirely (fall through to socket remote address / X-Real-IP).
- Tests: unit test `extractClientIp` with `TRUSTED_PROXY_HOPS=0` + spoofed XFF → ignores XFF.
- Exit: `=0` no longer trusts any XFF entry.

### A8. AGG-13 / ARCH-1 — Import-time throw in `compiler/execute.ts`
- File: `src/lib/compiler/execute.ts:64-69`
- Severity: HIGH (hot-path crash on misconfig)
- Do: replace the `throw` with the logged-error + `COMPILER_RUNNER_CONFIG_ERROR` pattern already used in `src/lib/docker/client.ts:26-47` (the constant already exists downstream at L80-83 / L637-647).
- Tests: extend `tests/unit/compiler/execute-implementation.test.ts` to assert no throw on missing token; `configError` surfaced.
- Exit: module loads without throwing; misconfig returns configError.

### A9. AGG-19 / TR-3 — Per-problem export omits function-judging fields
- File: `src/app/api/v1/problems/[id]/export/route.ts:15-30`
- Severity: MEDIUM (silent data loss / wrong verdicts)
- Do: add `problemType`, `functionSpec`, `referenceSolution` to the SELECT and the serialized `problem` object.
- Tests: round-trip test (export a `function` problem → import → re-fetch asserts `problemType==="function"` and non-null `functionSpec`). Add `tests/unit/validators/problem-import.test.ts` coverage + a route-level export test (also closes TE-3).
- Exit: function problems survive export→import.

### A10. AGG-65 / V-8b / TE-10 — Rust `validation.rs` tests flaky under parallel (GATE-breaking)
- File: `judge-worker-rs/src/validation.rs` (tests at L167, L188 mutate shared env via `unsafe set_var`)
- Severity: MEDIUM (gate: `cargo test` fails 2/8 by default)
- Do: inject production/trusted config as a function parameter (read env once at the boundary); remove `unsafe { std::env::set_var/remove_var }` from tests. Alternatively gate env-dependent tests with a serial mutex.
- Tests: `cargo test validation` passes under default parallel execution.
- Exit: `cargo test` green without `--test-threads=1`.

### A11. AGG-6 / CR-2 — `problems/[id]` GET tighten to strict canManageProblem
- File: `src/app/api/v1/problems/[id]/route.ts:60,65,72-82`
- Severity: HIGH (resolves code-reviewer vs security-reviewer disagreement by tightening to PATCH/DELETE strictness)
- Do: rename the local boolean; route GET through the imported strict `canManageProblem(id, user.id, user.role)`.
- Tests: a `problems.edit` holder NOT in the problem's teaching group gets `referenceSolution` stripped + no hidden testCases.
- Exit: GET auth matches PATCH/DELETE; disagreement resolved.

### A12. AGG-69 / TE-16 — `check-migration-drift.sh` runs destructive `git clean -fdq`
- File: `scripts/check-migration-drift.sh:79`
- Severity: MEDIUM (destructive — silently deletes untracked migration files)
- Do: replace `git clean -fdq -- drizzle/` with a tracked-temp restore (copy the probe files to a temp dir before probing, or `git stash`/restore only the known probe outputs). Never delete untracked files.
- Tests: add a test asserting the script does not invoke `git clean` on `drizzle/` untracked files.
- Exit: no `git clean -fd` in the drift check path.

---

## Phase B — Scheduled for subsequent cycles (planned, NOT deferred)

These are data-loss/security/correctness items that are NOT deferrable under repo rules but are too large/risky to land safely in one cycle. Each has a concrete exit criterion and is picked up in a later cycle of this loop.

- **AGG-1 / TR-1 / DBG-1** Restore DB-before-files atomicity (full staging-then-rename design). This cycle's mitigation: A2 (audit) + the existing pre-restore snapshot. Full fix next cycle.
- **AGG-2 / CRIT-1 / DOC-2,3** Snapshot/full-fidelity `EXPORT_ALWAYS_REDACT_COLUMNS` bypass (`mode: "snapshot"`).
- **AGG-10 / SEC-4** Plaintext-decryption fallback default flip + re-encryption migration.
- **AGG-14 / ARCH-2** Deploy topology defaults invert CLAUDE.md.
- **AGG-15 / FDR-1** Panicked executor `catch_unwind`.
- **AGG-16 / DBG-2 / FDR-4** Docker inspect/remove/kill timeout wrapping.
- **AGG-17 / FDR-2** `MAX_TIME_LIMIT_MS` silent clamp (raise default / warn).
- **AGG-18 / CR-30 / PERF-2 / FDR-3** code-similarity Rust cap.
- **AGG-20 / DBG-4** TS compiler workspace 0777 → 0o700.
- **AGG-21..24** Backup memory stream + missing-file reporting + concurrent-restore lock + upload snapshot.
- **AGG-25..30** Authz medium queue (roles, ownership transfer, community scopes centralization, SSE re-auth, anti-cheat Origin/IP).
- **AGG-31..35** Crypto/config (key rotation, AUTH_SECRET entropy, CSRF Origin-required, AUTH_URL enforcement, hCaptcha throw).
- **AGG-36..40** Realtime/perf medium queue.
- **AGG-41..43** Audit reliability (unawaited recordAuditEvent, CSV injection, crash buffer).
- **AGG-45..50** Worker/infra medium (function-judging registry breadth, TLE race, temp-dir orphan, SELECT-then-UPDATE, execTransaction build-phase, startup deadline).
- **AGG-51..55** Docs (CSRF doc, AGENTS.md push-scan wording, validation.rs docstring, migration journal integrity, orphaned min_password_length column).
- **AGG-56..62** Designer P0/P1 (contrast, label htmlFor, h1, invalid CSS shadow, recruit form, empty/loading states, markdown INP).
- **AGG-63,66,67,68** Test gaps (user-deletion order assertion, restore audit mock, FK ordering runtime, poll stale-token).

---

## Phase C — Deferred (low severity, with provenance)

Each entry records: file+line · original severity/confidence (NOT downgraded) · reason · exit criterion. None are security/correctness/data-loss. Repo rule permitting deferral of low-priority polish: AGENTS.md:438 ("Outstanding deferred deploy-script polish items are tracked ... LOW-severity defense-in-depth and observability improvements, all with concrete exit criteria").

- **AGG-44 / CR-29** rate-limiter-rs backoff overflow. File `rate-limiter-rs/src/main.rs:263`. Severity LOW (code-reviewer) / Confidence LOW. **Note:** feature-dev re-verified `2u64.pow(exp)` with `exp ≤ 4` cannot overflow — disagreement. Reason: needs re-verification to resolve the disagreement before any change; not a confirmed bug. Exit: re-trace the arithmetic; if safe, close as non-issue; if not, fix. (Verify-first, not a silent drop.)
- **SEC-16** `DUMMY_PASSWORD_HASH` hardcoded constant. File `src/lib/auth/config.ts:51-52`. Severity LOW / Confidence HIGH. Reason: cosmetic; timing-parity test is the real safeguard. Exit: when Argon2 params next change.
- **SEC-17** Session cookie `SameSite=Lax`. File `src/lib/auth/config.ts:163`. Severity LOW / Confidence HIGH. Reason: no state-changing top-level-GET admin routes exist (theoretical). Exit: when an admin top-level-GET state change is added.
- **SEC-20** `AUTH_TRUST_HOST=true` doc gap. File `src/lib/security/env.ts:186-192`. Severity LOW / Confidence MEDIUM. Reason: documentation only. Exit: next deployment-runbook update.
- **SEC-21** API-key DB equality non-timing-safe. File `src/lib/api/api-key-auth.ts:56-67`. Severity LOW / Confidence LOW. Reason: 160-bit secret makes timing unexploitable (reviewer noted no fix required). Exit: if secret entropy is ever reduced.
- **ARCH-6** Promote gVisor to recommended. Files `docker-compose.{worker,production}.yml`. Severity MEDIUM / Confidence MEDIUM. Reason: defense-in-depth, host-install required, ~10-20% overhead — needs ops decision per target. Exit: after `docs/judge-worker-gvisor.md` validation pass. (Cross-listed in Phase B for the validation; deferral is the ops promotion only.)
- **ARCH-8** Settings cache process-local 60s TTL drift. File `src/lib/system-settings-config.ts:84-194`. Severity LOW / Confidence MEDIUM. Reason: only affects multi-instance (>1) deployments; current targets run single-instance. Exit: when `APP_INSTANCE_COUNT > 1` is deployed.
- **ARCH-9** `judgeClaimToken` partial unique index. File `src/lib/db/schema.pg.ts:485`. Severity LOW / Confidence HIGH. Reason: nanoid collision resistance already makes the optimistic-lock fence correct; index is defense-in-depth. Exit: next schema migration batch.
- **ARCH-10** Redundant `secret_token` drop paths. Files `drizzle/pg/0020_*.sql` + `deploy-docker.sh:1003-1024`. Severity LOW / Confidence HIGH. Reason: cross-reference comment only; both paths are correct under their deploy strategy. Exit: next migration cleanup.
- **AGG-12 / SEC-12** `postcss` XSS via `next`. Severity MEDIUM / Confidence HIGH. Reason: build-time only, bundled in `next`; fix is to keep `next` updated (already `^16.2.9`). Exit: next `next` patch bump. (Tracked, not silently dropped — will be closed when `next` is bumped.)
- **Designer P2 (D-11, D-16..D-32)** low-severity UI polish. Severity LOW. Reason: non-blocking UX polish. Exit: batched in a dedicated UX cycle.

## Progress Tracking
- [ ] A1 env perms + startup guard
- [ ] A2 restore audit durable
- [ ] A3 group DELETE IDOR
- [ ] A4 instructors POST target-role check
- [ ] A5 api-keys PATCH escalation
- [ ] A6 chat-widget sanitizePromptInput
- [ ] A7 XFF TRUSTED_PROXY_HOPS=0
- [ ] A8 compiler execute.ts logged-error
- [ ] A9 function export fields + round-trip test
- [ ] A10 Rust validation test env-race fix
- [ ] A11 problems/[id] GET strict canManageProblem
- [ ] A12 check-migration-drift git clean removal
- Gates (run after Phase A): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`
