# Cycle 2 — critic

**VERDICT: REVISE**

**Overall Assessment**: Phase A delivered 10/12 solid fixes at mostly the right altitude (A3, A8, A9, A10, A11, A12 are clean; A1, A4, A5 are sound). However, **A2 (restore audit) does not deliver what AGG-3 explicitly asked for or what the plan claimed** — it uses fire-and-forget `recordAuditEvent` instead of the `recordAuditEventDurable` variant that already exists and is used for less-critical operations (role changes, settings). **A7 closes the XFF hole but relocates the spoof surface to an unconditionally-trusted `X-Real-IP` header.** **A6 adds a security comment where the plan promised Zod schemas.** Phase B scope is mostly defensible; AGG-1 + AGG-3-durable are the highest-leverage picks this cycle. No silent security drops detected in Phase C, but one AGG-ID inconsistency needs fixing.

**Pre-commitment Predictions vs Actuals**:
- Predicted A2 might still lose audit on edge cases → **CONFIRMED** (fire-and-forget; lost on crash).
- Predicted A6 would miss a branch → partially confirmed: systemContent is admin-controlled (safe), but Zod validation was replaced with a comment.
- Predicted A7 might break `=0` semantics → **CONFIRMED** (X-Real-IP residual spoof).
- Predicted A10 would use a serial-mutex band-aid → **WRONG**: it did the proper pure-function refactor. Good.

---

## REGRESSION CHECK

| ID | Fix | Verdict | Notes |
|---|---|---|---|
| A1 | env perms + startup guard | **PASS (minor gaps)** | All `.env*` files confirmed 0600; guard correctly throws on group/other bits. Guard walks the candidate list and returns the FIRST existing — if multiple exist with different perms, only one is inspected. Deploy-time files (`.env.deploy*`) aren't in the candidate list (acceptable: not loaded at runtime). |
| A2 | restore audit durable | **FAIL — see C-1** | Moved post-commit (fixes truncate-wipe) but uses fire-and-forget `recordAuditEvent`, not `recordAuditEventDurable` that AGG-3 explicitly named. |
| A3 | group DELETE IDOR | **PASS** | `instructorId` fetched inside tx with `for("update")`; `canManageGroupResourcesAsync` + `groups.view_all` gate mirrors PATCH/GET. Negative-authz test asserts `dbDeleteMock` not called. |
| A4 | student→co_instructor | **PASS** | `getRoleLevel <= 0` gate; 409 `instructorRoleInvalid` is consistent with sibling ownership-transfer gate (`groups/[id]/route.ts:161`). |
| A5 | api-keys PATCH escalation | **PASS (benign edge)** | `targetRole = body.role ?? existing.role` correctly consults existing role. Null-role case is benign (null-role key has no privileges). |
| A6 | chat-widget sanitize | **PARTIAL — see C-2** | `body.messages` and `toolResult` sanitized; systemContent is admin-controlled (verified — no hole). But plan's "Zod-validate `toolArgs` per tool" was delivered as a comment only. |
| A7 | XFF `TRUSTED_PROXY_HOPS=0` | **PARTIAL — see C-3** | XFF path correctly skipped when `trustedHops === 0`. Falls through to unconditionally-trusted `X-Real-IP`. |
| A8 | compiler import-time throw | **PASS** | `logger.error` replaces `throw`; test asserts module loads + `executeCompilerRun` returns the configError stderr. |
| A9 | function export fields | **PASS** | `problemType/functionSpec/referenceSolution` added to SELECT; route test + validator round-trip test are real (would fail on buggy version). |
| A10 | Rust validation env-race | **PASS (best fix of the set)** | Proper root-cause: pure `validate_docker_image_with_config(image, is_production, trusted_prefixes)`; tests inject config. No `unsafe set_var`. |
| A11 | problem GET strict gate | **PASS (perf note — F-1)** | Routes through `canManageProblem` (DB hit) replacing local-only check. Test asserts referenceSolution + hidden testCases stripped for out-of-group `problems.edit` holder. |
| A12 | migration drift git clean | **PASS (edge — F-3)** | Surgical node-based restore replaces `git clean -fd`. Source-text test + behavior test. |

---

## CRITICAL / MAJOR REGRESSION FINDINGS

### C-1 — A2 restore audit is NOT durable despite AGG-3 explicitly requiring it (MAJOR)
- **Confidence**: HIGH
- **Evidence**:
  - AGG-3 (`_aggregate.md:52-56`) says: `"Use a post-commit durable audit (recordAuditEventDurable) mirroring the user-deletion fix."`
  - Plan A2 says: `"record the restore audit AFTER importDatabase commits (post-commit), reusing the durable-audit helper used by user deletion."`
  - Actual fix `src/app/api/v1/admin/restore/route.ts:168` calls `recordAuditEvent({...})` — **not awaited, not the Durable variant**.
  - The plan's reference is doubly wrong: user-deletion itself uses fire-and-forget `recordAuditEvent` (`src/app/api/v1/users/[id]/route.ts:506`, verified), NOT durable. So "mirror user-deletion" was never going to produce a durable audit.
  - `recordAuditEventDurable` (`src/lib/audit/events.ts:275`) exists precisely for this — `"Durably record a security-critical audit event: insert it IMMEDIATELY and await the write, so the integrity-trail entry survives a hard crash (SIGKILL/OOM/docker kill)"` — and is already used for **less** critical operations: role changes, system settings, exam sessions.
- **Why this matters (Realist Check)**: A database restore is the single most destructive admin operation (TRUNCATEs every table). It is the operation most likely to run under memory pressure (large import) and the one where the integrity trail matters most. `recordAuditEvent` pushes to a 5s in-memory buffer that is wiped on hard crash. Survives Realist Check at MAJOR — never downgrade integrity-trail findings.
- **Fix**: `await recordAuditEventDurable({...})` (one-line change; the helper already falls back to buffer on insert failure so it never throws). Update the Phase B AGG-41 entry to reference this site explicitly.

### C-2 — A6 "Zod-validate toolArgs per tool" was delivered as a comment, not schemas (MAJOR → MINOR after Realist Check)
- **Confidence**: HIGH
- **Evidence**: Plan A6: `"Zod-validate toolArgs per tool; add threat-surface comment at executeTool."`. Diff only adds the comment at `src/lib/plugins/chat-widget/tools.ts:68-74` but the switch cases were unchanged. Handlers use ad-hoc coercion: `Number(args.limit) || 5` (`tools.ts:131`), `String(args.submissionId ?? "")` (`tools.ts:169`).
- **Recalibration**: MAJOR → **MINOR** (plan-impl gap, not a security regression). Every handler re-scopes DB lookups to `context.userId` / `context.problemId` (verified across all 5 handlers), so there is **no exploitable IDOR today**.
- **Fix**: Either add the per-tool Zod schemas (small effort) or amend the plan/Phase B to explicitly drop Zod in favor of the documented scoping contract. Don't leave the comment promising validation that doesn't exist.

### C-3 — A7 leaves X-Real-IP as an unconditionally-trusted spoof surface (MAJOR)
- **Confidence**: HIGH
- **Evidence**: Fix `src/lib/security/ip.ts:97` correctly skips XFF when `trustedHops === 0`. But `src/lib/security/ip.ts:113-117` trusts `X-Real-IP` whenever XFF is absent — with **no hop validation, no proxy trust check**. When `TRUSTED_PROXY_HOPS=0` (the SEC-8 scenario — "no trusted proxies"), every header is client-controlled, including `X-Real-IP`. The result drives rate-limit keys, audit IPs, and the judge IP allowlist (the ip-allowlist test was rewritten to use `x-real-ip`, confirming the allowlist keys off it).
- **Mitigating factor**: in deployments behind nginx (per CLAUDE.md), nginx sets X-Real-IP and should overwrite client-supplied values — but the code does not verify this. Keep MAJOR.
- **Fix**: When `trustedHops === 0`, also skip `X-Real-IP` and fall through to `request.socket.remoteAddress` (the actual socket peer). Reserve `X-Real-IP` trust for `trustedHops > 0` deployments where a proxy is guaranteed to set it.

---

## PHASE-B CRITIQUE

**Highest-leverage this cycle (pick these first):**
1. **AGG-1 (restore DB-before-files atomicity)** + **AGG-3/C-1 (durable audit)**. Together these fully close the restore integrity story. C-1 is a one-line change; doing it now (not "next cycle") removes the most embarrassing gap from Phase A.
2. **AGG-2 (snapshot/full-fidelity redacts auth)**. After a restore-from-snapshot, **nobody can log in**. Silent correctness hole in the documented disaster-recovery path — higher priority than its Phase B placement suggests.
3. **AGG-41 (unawaited `recordAuditEvent` at security-critical sites)**. Verified: **117 fire-and-forget `recordAuditEvent({` sites** in `src/app/api/`. Recommend a sub-cycle that converts the destructive/privilege routes (user delete, group delete, problem delete, api-key mutations, restore).

**Mis-scoped / under-specified:**
- **AGG-10 (plaintext-decryption fallback default)** — migration is the hard part and is unscoped: rollback if a key is unwrappable after flip? Add: explicit opt-in flag name, one-shot migration script, and detection for already-plaintext secrets (don't double-encrypt).
- **AGG-17 (`MAX_TIME_LIMIT_MS` silent clamp)** — "raise default / warn" is under-specified: raise to *what*? The clamp hides a config error; the right fix is **reject** over-limit problems at authoring time, not warn-at-runtime.
- **AGG-25..30 "Authz medium queue"** is bundled as one line item — too coarse to be actionable. Split into individual entries with file:line, or they will silently languish.

**Phase C deferrals — no silent security drops, with one bookkeeping exception:**
- AGG-44 (rate-limiter overflow) Phase C entry is **appropriate** — "verify-first, not a silent drop".
- SEC-16/17/20/21, ARCH-6/8/9/10 deferrals are documented with severity/confidence preserved and concrete exit criteria. Acceptable.
- **AGG-12 inconsistency (bookkeeping)**: Plan Phase C says `"AGG-12 / SEC-12 postcss XSS via next"` but `_aggregate.md:107-110` AGG-12 is the **`next-auth@5.0.0-beta.31` exact-pin** finding (a different issue). Reconcile the ID so the postcss tracking isn't orphaned. `npm ls postcss` shows `next@16.2.9` bundles `postcss@8.4.31` — the "keep next bumped" exit is fine, just fix the AGG-ID.

---

## FINDINGS (new — multi-persona)

### F-1 — `canManageProblem` DB hit added to every problem GET (perf regression on hot path) — MAJOR
- **Persona**: SRE / staff engineer · **Confidence**: HIGH · **File**: `src/app/api/v1/problems/[id]/route.ts:65`
- **Problem**: A11 replaced a local check (both already-fetched values) with `await canManageProblem(id, user.id, user.role)`, which hits the DB to resolve teaching-group membership. This runs on every problem view — including every student opening a problem during a contest. The old code made 0 extra DB calls; the new code makes ≥1 per view.
- **Fix**: Either (a) extend the `problemStub` SELECT to include the teaching-group join so the gate is local, or (b) memoize `canManageProblem` per request, or (c) fast-path students (who can never manage) with a role-level short-circuit before the DB call.

### F-2 — `recordAuditEvent` vs `recordAuditEventDurable` is an abstraction footgun (117 sites) — MINOR
- **Persona**: New contributor / staff engineer · **Confidence**: HIGH · **File**: `src/lib/audit/events.ts:252` (fire-and-forget) vs `:275` (durable)
- **Problem**: The A2 author defaulted to `recordAuditEvent` exactly because it's the default everywhere (117 call sites vs ~5 durable). This is how AGG-3's explicit "use durable" instruction got silently lost.
- **Fix**: Rename to `bufferAuditEvent` / `persistAuditEvent`; add a lint rule or JSDoc `@security-critical` tag; or add a code-comment block at `recordAuditEvent` directing security-critical callers to the durable variant.

### F-3 — A12 drift-cleanup would discard developer's staged changes if a tracked drizzle file is modified by both probe and developer — MINOR
- **Persona**: DBA · **Confidence**: MEDIUM · **File**: `scripts/check-migration-drift.sh:90-104`
- **Problem**: Cleanup diffs `before`/`after` porcelain **strings**. If a developer has staged changes to a tracked drizzle file (`"M  file.sql"`) and the probe further modifies it (`"MM file.sql"`), the strings differ → treated as probe-only → `git checkout -- file.sql` → **discards both probe and developer changes**. The test only covers untracked-file preservation.
- **Fix**: Parse the path independent of status code and compare path sets, or `git stash push -- drizzle/` before the probe and `git stash pop` after.

### F-4 — A1 startup guard inspects only the first existing env file in priority order — MINOR
- **Persona**: SRE · **Confidence**: HIGH · **File**: `src/lib/security/env.ts:147-160` (`resolveLoadedEnvFilePath`)
- **Problem**: Returns the first existing entry of `[.env.production.local, .env.local, .env.production, .env]`. Next.js loads ALL matching env files, not just the first. A world-readable `.env` coexisting with a 0600 `.env.production.local` is never flagged.
- **Fix**: Iterate ALL existing candidates and assert each is 0600.

### F-5 — `.env.deploy.auraedu` is an undocumented fourth deploy target — MINOR
- **Confidence**: HIGH · **File**: `.env.deploy.auraedu` (gitignored, 0600 — not a leak)
- **Problem**: CLAUDE.md documents `algo` and `worker-0`; the plan lists `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`. A fourth target `auraedu` exists with no doc/plan provenance.
- **Fix**: Add `auraedu` to the deploy-targets doc or confirm it's stale and remove.

### F-6 — A2 audit summary says "files pending" but file restoration runs AFTER the audit — MINOR
- **Persona**: DBA · **Confidence**: HIGH · **File**: `src/app/api/v1/admin/restore/route.ts:168-184`
- **Problem**: `recordAuditEvent` fires at L168 (action `system_settings.database_restored`, implying success), then `restoreParsedBackupFiles` runs at L183. If file restoration throws, the audit already recorded success while the HTTP response says `restoreFailed` — contradictory signals during incident triage.
- **Fix**: Record the audit AFTER file restoration completes, or record a second `database_restore_files_failed` audit on partial failure.

### LOW findings (capped at 6)
- **L-1** A5: `targetRole = body.role ?? existing.role` — when `existing.role` is null, `canManageRoleAsync(user.role, null)` returns true (null has level -1). Benign but undocumented. `src/app/api/v1/admin/api-keys/[id]/route.ts:86`.
- **L-2** A6 sanitizer test pins one payload (`"Ignore previous instructions"` → `[REDACTED]`). A different phrasing bypasses the test assertion without bypassing the sanitizer — brittle. `tests/unit/api/plugins.route.test.ts:486+`.
- **L-3** A8 `RUNNER_AUTH_DISABLED=1` in production isn't covered by the new tests. The logger.error still fires when auth is explicitly disabled — possibly noisy. `src/lib/compiler/execute.ts:62-66`.
- **L-4** A12 `DRIFT_BEFORE`/`DRIFT_AFTER` parsing assumes porcelain v1 with no renames; undocumented. `scripts/check-migration-drift.sh:81-105`.
- **L-5** A1 chmod of the six env files isn't captured in git (modes aren't versioned). Re-clone won't get 0600 automatically — only the startup guard catches it. Worth a setup-script line.
- **L-6** A7 `Math.max(0, parsed)` clamps negative `TRUSTED_PROXY_HOPS` to 0 (fail-closed for XFF) — good — but the X-Real-IP fallthrough means negative values still trust a header. `src/lib/security/ip.ts:15`.

---

## FINAL SWEEP

**Missing / unhandled**:
- No concurrent-restore lock (two admins hitting POST `/restore` simultaneously interleave TRUNCATEs). AGG-21..24 in Phase B — flag for this cycle given the destructive blast radius.
- The 5s audit buffer window is silently relied upon for security-critical low-frequency events across 117 sites.
- No test asserts the restore audit survives a flush failure (C-1 scenario). The A2 test only asserts `importDatabaseMock` called before `recordAuditEventMock` — it does NOT assert durability or await behavior.

**Ambiguity risks**:
- Plan A2 `"reuse the durable-audit helper used by user deletion"` → Interpretation A: use `recordAuditEventDurable` (AGG-3 literal). Interpretation B: mirror whatever user-deletion does (fire-and-forget). Executor chose B; AGG-3 wanted A. **Risk**: the security-critical durability property is silently unmet (C-1).
- A7 plan `"fall through to socket remote address / X-Real-IP"` → Interpretation A: socket ONLY. Interpretation B: trust X-Real-IP unconditionally. Executor chose B; SEC-8's intent was A. **Risk**: spoof surface relocated, not closed (C-3).

**Verdict Justification**: THOROUGH mode throughout. Issues are localized (A2/A6/A7 implementation-vs-plan gaps), not systemic across all 12 fixes (A3/A8/A9/A10/A11/A12 are genuinely clean). Realist Check applied: C-2 downgraded MAJOR→MINOR; C-1 and C-3 held at MAJOR. For an upgrade to ACCEPT: (1) convert A2 to `await recordAuditEventDurable(...)`; (2) either add the A6 Zod schemas or amend the plan to drop them; (3) gate A7's X-Real-IP on `trustedHops > 0`; (4) reconcile the AGG-12 ID inconsistency.
