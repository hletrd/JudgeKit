# Cycle 1 Aggregate Review

Date: 2026-06-26
Repository: `/Users/hletrd/flash-shared/judgekit`
Head: `0b0ac198`
Prior reviews: 2026-06-24 cycle (archived under `_archive/2026-06-24/`).

## Fan-Out Status

All 12 review agents completed successfully (4 hit transient 429 rate limits on the first batch and were retried in the background; all returned on retry). Per-agent files live alongside this one:

- `code-reviewer.md` — 68 findings (CR-1 CRITICAL, CR-2..CR-38 + 30 LOW)
- `security-reviewer.md` — 21 findings (SEC-1..SEC-21; 6 High)
- `architect.md` — 10 findings (ARCH-1..ARCH-10)
- `critic.md` — 13 findings (CRIT-1 CRITICAL + 6 MAJOR + 6 MINOR)
- `debugger.md` — 23 findings (DBG-1 Critical, DBG-2 High, DBG-3..DBG-23)
- `designer.md` — 32 findings (D-1..D-32; P0/P1/P2)
- `document-specialist.md` — 6 findings (DOC-1..DOC-6)
- `perf-reviewer.md` — 15 findings (PERF-1..PERF-15)
- `test-engineer.md` — 18 findings (TE-1..TE-18)
- `tracer.md` — 8 findings (TR-1..TR-8)
- `verifier.md` — 9 acceptance checks + 4 findings (V-8a, V-8b, V-6 residual, observation)
- `feature-dev-code-reviewer.md` — 5 findings (FDR-1..FDR-5)

No agent failures this cycle.

---

## Cross-Agent Disagreement (resolve by manual validation)

**`problems/[id]` GET `referenceSolution` leak — CR-2 vs security-reviewer.**
- **code-reviewer CR-2 (HIGH)** + **verifier observation**: GET at `src/app/api/v1/problems/[id]/route.ts:60` uses a *local* `const canManageProblem = caps.has("problems.edit") || problemStub.authorId === user.id` that is **looser** than the imported strict function used by PATCH (L101)/DELETE (L222), which also enforces group-teaching scope. A `problems.edit` holder who does NOT teach the problem's group reads hidden test cases + reference solution under GET but would be denied by PATCH/DELETE. Asymmetry confirmed by verifier.
- **security-reviewer**: read the same lines and concluded "correctly uses `canManageProblem` (caps OR author) and strips `referenceSolution` for non-managers" — focused on whether *students* (who lack `problems.edit`) get it; they do not.
- **Resolution recommendation:** the asymmetry is a confirmed fact. Tighten GET to call the imported strict `canManageProblem(id, user.id, user.role)` to match PATCH/DELETE. Treat as **HIGH** pending intent confirmation (if `problems.edit` is meant to grant global hidden-test read, downgrade to doc-note; the PATCH/DELETE strictness strongly suggests it is not).

---

## CRITICAL Issues (must be fixed this cycle)

### AGG-1 — Restore commits DB before files are written (data-integrity window)
**Source agreement (5 agents):** tracer TR-1 · debugger DBG-1 · critic CRIT-2 · code-reviewer CR-5 · perf-reviewer PERF-1
**Locations:** `src/app/api/v1/admin/restore/route.ts:165` (`importDatabase` commits) → `:176-178` (`restoreParsedBackupFiles` writes disk); `src/lib/db/import.ts:125-212`; `src/lib/db/export-with-files.ts:304-360`; `src/lib/files/storage.ts:27-30` (silent overwrite, no rename/fsync — TR-8)
**Problem:** On ZIP restore, the DB transaction commits at `importDatabase` resolve; only then are uploaded files written. A post-commit FS failure (ENOSPC, EIO, permission, partial write mid-loop) leaves the live DB referencing absent/partial blobs. Response says "restoreFailed" while the DB has already swapped. No compensating rollback; pre-restore snapshot is manual recovery only. Commit `34d27adf` ("pending file count") was **cosmetic** — it fixed the audit summary text, not the ordering.
**Fix:** Stage files to a temp dir before commit; on DB-commit success, atomically rename into place (same FS); on rollback delete staged. Short-term: on any `restoreParsedBackupFiles` error, auto-replay the pre-restore snapshot before returning 500; return honest partial-success body.

### AGG-2 — Pre-restore snapshot & "full-fidelity" backup silently strip auth fields
**Source agreement (4 agents):** critic CRIT-1 · document-specialist DOC-2, DOC-3 · security-reviewer SEC-19
**Locations:** `src/lib/db/pre-restore-snapshot.ts:34-38,84-86` (comment claims "contains password hashes"); `src/lib/db/export.ts:104-106` (`EXPORT_ALWAYS_REDACT_COLUMNS` applied even when `sanitize:false`); `src/lib/security/secrets.ts:36-42`; `docs/data-retention-policy.md:48` ("all fields included")
**Problem:** `streamDatabaseExport({ sanitize: false })` still nullifies `passwordHash`, session/OAuth/API-key tokens, SMTP/hCaptcha secrets. The emergency-rollback artifact is not a faithful rollback — operators restoring under duress lose every credential; nobody can log in. Same root cause makes the "full-fidelity backup" docs false.
**Fix:** Add a `mode: "snapshot"` (or `redactSecrets: false`) bypass for internal snapshots (file is already 0o600 in a 0o700 dir); correct `docs/data-retention-policy.md:48` and the snapshot comment.

### AGG-3 — Restore audit event destroyed by the import transaction
**Source agreement:** code-reviewer CR-4 (also migrate/import `route.ts:98-107`)
**Locations:** `src/app/api/v1/admin/restore/route.ts:151-163` (`recordAuditEvent` fires BEFORE `importDatabase`, which truncates `auditEvents`)
**Problem:** The restore audit is recorded then immediately truncated by the import. The repo already fixed this exact pattern for user deletion (`76e27d31`).
**Fix:** Use a post-commit durable audit (`recordAuditEventDurable`) mirroring the user-deletion fix.

---

## HIGH Issues

### AGG-4 — Group DELETE IDOR: capability-only auth, no ownership check
**Source agreement (2 agents):** code-reviewer CR-1 (CRITICAL) · security-reviewer SEC-2
**Locations:** `src/app/api/v1/groups/[id]/route.ts:192-217` (DELETE)
**Problem:** DELETE checks only `capabilities: ["groups.delete"]`; never calls `canManageGroupResourcesAsync`. Sibling PATCH (L127) and GET (L58) correctly call it. Any `groups.delete` holder deletes ANY group (assignments, enrollments, contest config) when submission count is zero.
**Fix:** Mirror PATCH — fetch `instructorId` inside the tx, call `canManageGroupResourcesAsync`, deny unless `groups.view_all`.

### AGG-5 — Student→co_instructor group-scoped privilege escalation
**Source agreement (2 agents):** code-reviewer CR-12 · security-reviewer SEC-3
**Locations:** `src/app/api/v1/groups/[id]/instructors/route.ts:74-100` (POST)
**Problem:** Actor is gated, but the **target** user's role is fetched then ignored. A student colluding with any co_instructor gets `role: "co_instructor"` — reads all submissions, overrides scores, exports roster PII — while global role stays `student`.
**Fix:** Mirror ownership-transfer gate (`groups/[id]/route.ts:160`): reject `getRoleLevel(targetUser.role) <= 0`.

### AGG-6 — `problems/[id]` GET reference-solution leak via variable shadow
**Source agreement:** code-reviewer CR-2 · verifier observation (security-reviewer disagrees — see Disagreement above)
**Locations:** `src/app/api/v1/problems/[id]/route.ts:60,65,72-82`
**Fix:** Rename local boolean; route GET through the imported strict `canManageProblem`.

### AGG-7 — `admin/api-keys/[id]` PATCH escalation gap
**Source agreement (2 agents):** code-reviewer CR-3 · security-reviewer SEC-7
**Locations:** `src/app/api/v1/admin/api-keys/[id]/route.ts:51-86`
**Problem:** Escalation check fires only when `body.role !== undefined`; existing key's role never fetched, so `isActive`/`name`/`expiryDays` on a higher-privilege key skip the check.
**Fix:** Fetch existing key's role; gate every field mutation on `canManageRoleAsync(user.role, existing.role ?? body.role)`.

### AGG-8 — Chat-widget LLM prompt injection (sanitizer not applied)
**Source agreement (2 agents):** code-reviewer CR-8 · security-reviewer SEC-6
**Locations:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:370-376, 432-436`; `tools.ts:208`
**Problem:** `body.messages` and tool results concatenated raw; `sanitizePromptInput` exists and is used in `auto-review.ts:163` but never imported here. Academic-integrity vector.
**Fix:** Apply `sanitizePromptInput` to every user-supplied string + tool result; re-scope `toolArgs` to `context.userId`.

### AGG-9 — XFF spoofing when `TRUSTED_PROXY_HOPS=0` (+ default nginx append)
**Source agreement (2 agents):** code-reviewer CR-9, CR-10 · security-reviewer SEC-8
**Locations:** `src/lib/security/ip.ts:79-99`
**Problem:** `=0` (documented "no proxies") trusts the last client-controlled XFF entry; default `=1` + nginx append still selects attacker's pre-set value. IP drives rate-limit keys, login attribution, judge IP allowlist, audit logs.
**Fix:** When `trustedHops === 0`, ignore XFF entirely; document required nginx `X-Real-IP`/strip-and-rebuild.

### AGG-10 — Plaintext-decryption fallback has an inverted default
**Source agreement (2 agents):** code-reviewer CR-27 · security-reviewer SEC-4
**Locations:** `src/lib/plugins/secrets.ts:61` (`allowPlaintext ?? true`, inverted from `encryption.ts` default `false`); `hcaptcha.ts:23`; `smtp.ts:54`
**Fix:** Flip default to `false`; force explicit opt-in; one-shot re-encryption migration; delete fallback.

### AGG-11 — World-readable `.env*` files on disk
**Source agreement:** security-reviewer SEC-1
**Locations:** `.env`, `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`, `.env.worv` (mode 644; `.env.production` correctly 0600)
**Fix:** `chmod 600`; rotate `AUTH_SECRET`/`NODE_ENCRYPTION_KEY`/`PLUGIN_CONFIG_ENCRYPTION_KEY` if ever on a shared host; add startup mode check in `src/lib/security/env.ts`.

### AGG-12 — Stale `next-auth@5.0.0-beta.31` exact pin
**Source agreement:** security-reviewer SEC-5
**Locations:** `package.json` (`"next-auth": "5.0.0-beta.31"`, no `^`)
**Fix:** Track latest v5 beta / stable; `npm update` won't move an exact pin.

### AGG-13 — Import-time throw in `compiler/execute.ts` (sibling fix was incomplete)
**Source agreement:** architect ARCH-1
**Locations:** `src/lib/compiler/execute.ts:64-69` (hard `throw`) vs the fixed `src/lib/docker/client.ts:26-47` (logged error)
**Problem:** Commit `26cff8e4` replaced the throw in `docker/client.ts` but left the identical guard in `execute.ts` (on the hot judging path) as a throw — crashes the server at import on misconfig.
**Fix:** Mirror the `docker/client.ts` logged-error + `configError` pattern; the `COMPILER_RUNNER_CONFIG_ERROR` constant already exists downstream.

### AGG-14 — Deploy topology defaults invert CLAUDE.md
**Source agreement:** architect ARCH-2
**Locations:** `deploy-docker.sh:184-187` (`INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`, `SKIP_LANGUAGES=false`); `:119-123` sources only `.env.deploy`, never `.env.deploy.algo`
**Problem:** CLAUDE.md mandates app-only defaults; script defaults are the inverse. A bare `./deploy-docker.sh` against algo builds language images + starts a worker on the app host. `.env.deploy.algo` holds the safety overrides but no wrapper sources it.
**Fix:** Invert script defaults to match CLAUDE.md (safe-by-default), or add `--target=` flag sourcing `.env.deploy.${target}`.

### AGG-15 — Panicked executor task leaves submission stuck in "queued" (lost verdict)
**Source agreement (2 agents):** feature-dev FDR-1 · debugger DBG-3
**Locations:** `judge-worker-rs/src/main.rs:487-553` (`task_handles.retain` drops panicked JoinHandle); `executor.rs:931-1026`
**Problem:** A panic in `executor::execute` unwinds past `report_with_retry` and dead-letter — no result, no dead-letter JSON, submission stuck "Judging..." for the full 5-min `staleClaimTimeoutMs`; `active_tasks` counter leaks.
**Fix:** Wrap execute in `catch_unwind`; on panic, best-effort `report_result(... "runtime_error" ...)`.

### AGG-16 — Docker inspect/remove run outside any timeout (worker slot wedge)
**Source agreement (2 agents):** debugger DBG-2 · feature-dev FDR-4
**Locations:** `judge-worker-rs/src/docker.rs:451-493` (`inspect_container_state`, `remove_container`, `kill_container` await raw after the `child.wait()` timeout envelope)
**Fix:** Wrap each post-run Docker call in `tokio::time::timeout(10s, …)`; best-effort skip (cleanup sweep reaps).

### AGG-17 — `MAX_TIME_LIMIT_MS` default (30s) silently truncates server time limits
**Source agreement:** feature-dev FDR-2
**Locations:** `judge-worker-rs/src/executor.rs:28-33,534-535`; `src/app/api/v1/judge/claim/route.ts:367-372`
**Problem:** Server multiplies time limit up to 50× (2s→100s for slow VM languages); worker clamps to 30s default with no log → silent wrong TLEs.
**Fix:** Raise default to ≥120s, or log a warning whenever `submission.time_limit_ms > max_time_limit_ms()`.

### AGG-18 — code-similarity Rust sidecar: no submission cap, O(n²) DoS
**Source agreement (3 agents):** code-reviewer CR-30 · perf-reviewer PERF-2 · feature-dev FDR-3
**Locations:** `code-similarity-rs/src/main.rs:76-115`; `src/lib/assignments/code-similarity.ts:354-388` (TS `MAX_SUBMISSIONS_FOR_SIMILARITY=500` only guards the fallback branch)
**Fix:** Enforce the cap in the Rust handler (413/"too_many") AND check `rows.length > MAX` before calling `computeSimilarityRust`.

### AGG-19 — Per-problem export/import silently downgrades function problems
**Source agreement:** tracer TR-3
**Locations:** `src/app/api/v1/problems/[id]/export/route.ts:15-30` (omits `problemType`/`functionSpec`/`referenceSolution`); `src/app/api/v1/problems/import/route.ts:23,89-90` (defaults `"auto"`, nulls function fields)
**Fix:** Add the three fields to export SELECT + serialized object. (Full-DB export is unaffected — generic column serialization.)

### AGG-20 — Local compiler TS path still broadens workspace to 0777
**Source agreement:** debugger DBG-4
**Locations:** `src/lib/compiler/execute.ts:735-747` (chmod 0o777/0o666 on chown-success branch); Rust equivalent `executor.rs:331-360` already fixed to 0o700
**Fix:** Mirror the Rust 0o700 hardening in the TS path.

---

## MEDIUM Issues (grouped)

**Backup/restore pipeline (perf/reliability):**
- AGG-21 Backup-with-files loads DB+uploads+ZIP in memory (~2-3× RSS) — PERF-1, CR-7. Fix: streaming ZIP.
- AGG-22 Backup silently omits missing files (skipped count never reaches client) — CRIT-4. 
- AGG-23 No advisory lock against concurrent restores — CR-34.
- AGG-24 Pre-restore snapshot doesn't capture uploaded files — CR-6.

**Authz / IDOR:**
- AGG-25 `admin/roles/[id]` PATCH/DELETE allow editing roles above actor's level — CR-11.
- AGG-26 `groups/[id]` PATCH ownership transfer accepts any active user — CR-13.
- AGG-27 Community reply/vote enforce inconsistent scope→problemId (copy-paste drift) — SEC-9, CR-15, CR-16. Fix: centralize in `discussions/permissions.ts`.
- AGG-28 `submissions/[id]/events` SSE re-auth omits `canAccessSubmission` (≤30s stale) — CR-17.
- AGG-29 `contests/[assignmentId]/anti-cheat` Origin check skipped when AUTH_URL unset — CR-18.
- AGG-30 Anti-cheat per-IP rate limit frames NAT-shared honest candidates — CR-20.

**Crypto / config:**
- AGG-31 No key-rotation path for `PLUGIN_CONFIG_ENCRYPTION_KEY` — SEC-10.
- AGG-32 Weak `AUTH_SECRET` validation (length only, no entropy) — SEC-11.
- AGG-33 CSRF Origin check skipped when header absent — SEC-13, CR-36.
- AGG-34 `AUTH_URL` unset → host-header-derived reset links — SEC-14.
- AGG-35 hCaptcha verification throws uncaught on network failure — CR-26.

**Realtime / perf:**
- AGG-36 Realtime SSE acquire takes a global advisory lock + 4 SQL under it (~250 acq/s cap) — PERF-3.
- AGG-37 Rankings runs `first_accepts` CTE 3× per render, no ISR — PERF-4.
- AGG-38 Contest announcements + clarifications unbounded (no pagination) — PERF-5/6.
- AGG-39 Submission POST counts global pending queue under per-user lock — PERF-7.
- AGG-40 Audit-logs route materializes thousands of IDs into one `IN(...)` — PERF-9.

**Audit reliability:**
- AGG-41 Unawaited `recordAuditEvent` at security-critical sites (fire-and-forget) — TR-7. 
- AGG-42 Audit log injection via newlines (CSV export) — CR-22.
- AGG-43 Audit 5s fire-and-forget buffer lost on hard crash (SIGKILL/OOM) — CR-21.

**Worker / infra:**
- AGG-44 rate-limiter-rs backoff integer overflow — CR-29 (note: feature-dev re-verified `2u64.pow(exp)` with `exp ≤ 4` cannot overflow — **disagreement**; CR-29 likely stale, verify).
- AGG-45 Function-judging only registered for `cpp23` — CR-31.
- AGG-46 False-positive TLE on timer-vs-close race — CR-33.
- AGG-47 Compiler `mkdtemp`+`lstat`+`chmod` outside try/finally orphans temp dir — DBG-6.
- AGG-48 `releaseClaimedSubmission` SELECT-then-UPDATE (inconsistent with poll CAS) — ARCH-7.
- AGG-49 `execTransaction` silently drops txn semantics during build phase — ARCH-4.
- AGG-50 Startup awaits have no top-level deadline (instrumentation can hang ~5 min) — ARCH-5.

**Docs:**
- AGG-51 CSRF doc lists only `X-Requested-With`; impl also enforces `Sec-Fetch-Site`/`Origin` — DOC-1.
- AGG-52 AGENTS.md says push-scan "downgrades to warn"; script `die()`s — DOC-4.
- AGG-53 `validation.rs` docstring says prod rejects unqualified images; accepts when trusted list non-empty — DOC-5, V-8a.
- AGG-54 Migration journal duplicate prefixes (0012/0016/0027/0028) + gap (0029-0032); `migrate` escape hatch broken — ARCH-3, DOC-6.
- AGG-55 Drift: `min_password_length` DB column orphaned (no code reads it) — V-6 residual.

## UI/UX (WCAG / accessibility) — HIGH priority within designer lane
- AGG-56 `--muted-foreground` contrast 3.87:1 on white (fails WCAG AA 4.5:1) — D-1. One-line fix `globals.css:63`. Affects every Dialog/Sheet/AlertDescription, inactive nav, password hint.
- AGG-57 ~35 `<Label>` siblings lack `htmlFor`/`id` pairing (WCAG Level A 1.3.1/3.3.2) — D-2.
- AGG-58 11+ admin pages use `<h2>` as page title, no `<h1>` (Level A) — D-3.
- AGG-59 `leaderboard-table.tsx` invalid CSS `shadow-[..._hsl(var(--border))]` (`--border` is oklch) — D-4. Sticky columns render with no separator.
- AGG-60 Recruit start form has no `<form>` (Enter doesn't submit); error `<p>` lacks `aria-live` — D-7.
- AGG-61 `<EmptyState>` used at 3 of ~25 empty-list sites; ~20 routes lack `loading.tsx`/`error.tsx` — D-8, D-10.
- AGG-62 Live markdown preview re-parses react-markdown+KaTeX per keystroke (50-200ms INP) — D-12. Fix: `useDeferredValue`.

## Test gaps (green-but-broken / missing coverage)
- AGG-63 TE-1 user-deletion test name still says "records audit **before** deletion"; no order assertion; reverting `76e27d31` passes every test.
- AGG-64 TE-3 `problems/[id]/export` route has no test file (negative-authz undetectable).
- AGG-65 V-8b / TE-10 Rust `validation.rs` tests flaky under parallel execution (env-var race via `unsafe set_var`). `cargo test validation` fails 2/8 by default, passes `-- --test-threads=1`. **Gate-relevant** (`cargo test` is a GATE).
- AGG-66 TE-2 restore audit test uses `parseBackupZipMock` returning `uploads: []` — passes with wrong variable.
- AGG-67 TE-4 restore FK ordering/rollback is source-grep only, never exercised at runtime.
- AGG-68 TE-5 poll-route unit test always `rowCount: 1` — stale-token path uncovered.
- AGG-69 **TE-16 (destructive)** `scripts/check-migration-drift.sh:79` runs `git clean -fdq -- drizzle/` — silently deletes untracked migration files in a developer's working tree.

---

## Cross-Agent Agreement (high-signal — flagged by ≥2 agents)

| Topic | Agents | Unified ID |
|---|---|---|
| Restore DB-before-files ordering | tracer, debugger, critic, code-reviewer, perf | AGG-1 |
| Pre-restore/full-fidelity redacts auth fields | critic, document-specialist, security | AGG-2 |
| Group DELETE IDOR | code-reviewer, security | AGG-4 |
| Student→co_instructor escalation | code-reviewer, security | AGG-5 |
| api-keys PATCH escalation | code-reviewer, security | AGG-7 |
| Chat-widget prompt injection | code-reviewer, security | AGG-8 |
| XFF spoofing | code-reviewer, security | AGG-9 |
| Plaintext fallback default | code-reviewer, security | AGG-10 |
| code-similarity no-cap DoS | code-reviewer, perf, feature-dev | AGG-18 |
| Panicked executor task | feature-dev, debugger | AGG-15 |
| Docker inspect/remove timeout | feature-dev, debugger | AGG-16 |

## Items verified CORRECT / FIXED this cycle (not re-reported)
Per-problem export `canManageProblem` gate (TR-2, V-1) · user-deletion audit post-commit ordering (TR-4, V-3) · boot language-sync backfill-only (TR-5) · no silent prod Docker fallback (TR-6) · docker import-time throw→logged error (V-4) · reset-password client+server validation parity (V-5) · `minPasswordLength` removed from config (V-6, DOC verified) · chrono dead-letter (V-7) · trusted-registries production-empty rejection (V-8, partial) · server password policy applied at all 9 paths (V-9) · en/ko message parity (DOC) · rate-limiter backoff cannot overflow (FDR coverage note) · judge claim atomic CTE + optimistic-lock fence (architect) · ZIP slip/zip-bomb guards (security) · AES-256-GCM + Argon2id + constant-time token compare (security).

## Note on Deferrals
Detailed deferral records (file+line, original severity/confidence preserved, reason, exit criterion) are authored in PROMPT 2 under `plan/`. Per repo rules (CLAUDE.md, AGENTS.md, .context/**), security/correctness/data-loss findings are NOT silently dropped; any deferral of such findings will quote the permitting repo rule. Candidates likely deferred (low severity, out-of-cycle scope): SEC-17 (SameSite=Lax), SEC-21 (API-key timing), ARCH-6 (gVisor promotion), ARCH-8 (settings cache drift), ARCH-9/ARCH-10, the LOW designer P2 items, and rate-limiter-rs backoff (CR-29 vs FDR disagreement — needs verification first, not deferral).
