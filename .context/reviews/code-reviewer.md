# JudgeKit Deep Code-Quality Review — 2026-07-07

**Reviewer:** code-reviewer (single-agent focused pass)
**Scope:** Full stack — `src/lib`, `src/app/api`, `src/components`, `judge-worker-rs/src`, deploy scripts, docker. Emphasis on the post-2026-07-05 fixes that landed *after* the previous written review (dated 2026-07-03/05), plus a targeted hunt for new logic/correctness/security defects.
**Method note:** A parallel multi-agent fan-out was attempted first but all worker agents terminated on HTTP 429 (rate limit) before producing output. This review is therefore a direct, manually-verified pass. It concentrates on (a) confirming the correctness/completeness of the recent fixes and (b) new or still-open defects. It does **not** re-derive the full ~146-finding cycle-4 catalog — those remain in git history (`git show HEAD~1:.context/reviews/code-reviewer.md`) and in `plan/cycle-4-2026-07-03-deferred.md`. Repo rules respected: `src/lib/auth/config.ts` untouched; no `docker system prune --volumes`; no Korean letter-spacing changes.

Every finding cites `file:line`, gives a failure scenario and a fix, and is labelled Confidence (High/Medium/Low) and Severity (Critical/High/Medium/Low).

---

## Part 1 — Verification of the recent (post-review) fixes

All fixes I was asked to audit are **correct**. Recorded so future cycles don't re-flag them.

| Commit | Area | Verdict |
|---|---|---|
| `2e6ee0d4` | ZIP-slip in backup restore (`export-with-files.ts`) | ✅ Correct & complete |
| `269aa674` | Custom-role fail-open in `api/handler.ts` | ✅ Correct |
| `f6ef5906` | Rust run-command validator accepts `/workspace/*` (`runner.rs`) | ✅ Correct, lock-step with `execute.ts` |
| `a12e3baa` | Judge IP allowlist fail-closed (`ip-allowlist.ts`) | ✅ Fail-closed in prod |
| `da607d36` | Claim-duration cap via embedded token ts (`poll/route.ts`) | ✅ Indefinite-extension closed |
| `8129b03f` | Worker runs as root for sandbox chown | ⚠️ Works; least-privilege concern (see F-2) |
| `784840cf` | `AUTH_TRUST_HOST=true` + `JUDGE_ALLOW_ANY` target-aware | ✅ Correct & consistent |
| `8d94874a` | `target/` excluded from deploy rsync | ✅ Applied to both app + worker rsync |

**ZIP-slip (`src/lib/db/export-with-files.ts`).** `assertSafeUploadStoredName` (168-178) rejects `/`, `\`, `..`, `\0`, empty; it is called at line 196 *before* the write stream opens (line 213) inside `streamEntryToStaging`, the single write choke-point. Both callers (`parseBackupZip` → `streamEntryToStaging`, and `restoreFilesFromZip` → `parseBackupZip`) route through it. The `path.dirname(stagedPath) !== stagingRoot` check (199) is a correct belt-and-suspenders; `stagingDir` is a fresh `mkdtemp` (339) so no pre-existing symlinks, and because `storedName` cannot contain `/` no traversal into a symlink is possible. Guard is genuinely pre-write, so no orphaned partial file on rejection. There is also a redundant `path.normalize`-based check in `parseBackupZip` (406-410). No sibling untrusted-archive path escapes the guard.

**Custom-role gate (`src/lib/api/handler.ts:204-225`).** Full truth table holds: built-in role not in `auth.roles` → always denied (206-214); custom role on a roles-only route (no capability gate) → denied (213 `!hasCapabilityGate`), closing the prior fail-open; custom role on a roles+capabilities route → falls through to the capability check (219-224); capabilities-only route → everyone is capability-checked. No remaining gap.

**Run-command validator (`judge-worker-rs/src/runner.rs:251-278`).** `/workspace/../etc/passwd` and every `..`-containing token fail the `!token.contains("..")` guard, fall through to the basename check (`passwd` is not an allowed prefix) and are rejected; legit `/workspace/solution` binaries pass; each `&&`/`;` segment is validated independently so `;rm -rf /` cannot be smuggled. Identical acceptance in `src/lib/compiler/execute.ts:280`. Execution is sandboxed (`--network=none`, read-only, uid 65534), so the string check is a correct defense-in-depth layer, not the boundary.

**Heartbeat cap (`src/app/api/v1/judge/poll/route.ts:84-102` + `claim-token.ts`).** In-progress reports still refresh `judgeClaimedAt` (113), but the token embeds `claimCreatedAt`; once `elapsed > maxJudgeClaimDurationMs` the report returns 403 `claimExpired` and the refresh transaction never runs, so the row becomes reclaimable after the stale timeout. The optimistic-lock fence (WHERE `judgeClaimToken = @claimToken`) prevents zombie double-writes. Indefinite extension is closed. (Residual: legacy tokens — see F-6.)

**`workspace.rs` symlink safety.** `chown_recursive` (32-48) uses `lchown` + `symlink_metadata`, so a malicious workspace symlink cannot make the (now-root) worker chown host paths. Well done and regression-tested.

**Deploy env vars.** `AUTH_TRUST_HOST=true`/`TRUST_HOST_OVERRIDE=1` set consistently in template (775), ensure (932), upsert (1014); all 8 generated nginx `location` blocks pin `X-Forwarded-Host $host` (8/8), so the "safe because nginx overwrites the forwarded host" claim holds with no bypassable location. `JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT` derives from `INCLUDE_WORKER` (integrated=1 / separated=0, lines 326-330) and is applied in template (793), ensure (939), upsert (1017); the fail-closed warning fires for separated hosts lacking `JUDGE_ALLOWED_IPS` (905-907, 1022-1024). `--exclude='target/'` is on both the app (962) and worker (1546) rsync invocations; no tracked `target/` dir exists so the non-anchored pattern is safe.

---

## Part 2 — Findings

### F-1 — Windowed-exam late penalty diverges between client display and authoritative leaderboard
- **Severity:** Medium **Confidence:** High (divergence confirmed) / Medium (real-world frequency)
- **Files:** `src/lib/assignments/scoring.ts:42-55` (TS) vs `:153-161` (SQL `buildIoiLatePenaltyCaseExpr`)
- **Problem:** For a windowed exam whose participant has a **null** personal deadline, the two scoring paths disagree:
  - TS `mapSubmissionPercentageToAssignmentPoints`: `if (examMode === "windowed" && personalDeadline)` is false, so it falls to `else if (deadline)` and applies the **global** deadline penalty.
  - SQL: the windowed branch requires `personal_deadline IS NOT NULL` (158) and the non-windowed branch requires `@examMode != 'windowed'` (153), so a windowed row with null personal deadline matches neither and hits the `ELSE` (161) — **no penalty**.
- **Failure scenario:** A candidate submits after the global deadline in a windowed exam but never had an `exam_sessions` row (or it was cleared), so `personal_deadline` is null. The recruit-results / candidate page (TS) shows a penalized score; the leaderboard, stats, and status board (SQL — the source of truth) show full points. Instructors and candidates see contradictory totals for the same submission.
- **Fix:** Make the TS `else if (deadline)` branch also require `examMode !== "windowed"`, matching the SQL. i.e. only apply the global-deadline penalty for non-windowed modes; for windowed with a null personal deadline apply no penalty (or decide the intended policy and encode it identically in both). Add a unit test pinning windowed+null-personal-deadline to the same result in both paths.

### F-2 — Judge worker runs as root for its entire lifetime; `CAP_CHOWN` would be least-privilege
- **Severity:** Medium **Confidence:** High
- **Files:** `docker-compose.production.yml` (worker `user: root` override, commit `8129b03f`); `judge-worker-rs/src/executor.rs:334`, `runner.rs:857`, `workspace.rs:86-101`
- **Problem:** The worker chowns each sandbox workspace to uid/gid 65534 before mounting it into the judge container, which needs `CAP_CHOWN`. The fix grants that by running the whole process as root, with no privilege drop after the chowns. The worker also holds a docker-socket-proxy handle. Any code-execution or command-construction defect in the worker process (HTTP/JSON handling, docker-arg assembly) therefore executes as root with docker access, rather than as an unprivileged uid.
- **Failure scenario:** A future bug that lets an attacker influence a `docker` argument or the worker's process state escalates to full root + docker control of the host, instead of uid-1000 + docker. The spawned judge containers are still sandboxed, so this is about the *worker process's own* blast radius, not the judged code.
- **Fix:** Keep `USER 1000` in the Dockerfile and grant only `cap_add: [CHOWN]` (plus `no-new-privileges` as today). `CAP_CHOWN` alone is sufficient for the arbitrary-uid chown the worker needs and is strictly less privileged than full root. If root is truly required, drop privileges after the chown or move the chown into a small setuid/`cap_chown` helper. This is a hardening improvement to a fix that itself correctly resolved the prior cleanup-leak (old C4-006); note the tradeoff explicitly rather than leaving it silent.

### F-3 — Sandbox email-verification staff bypass still uses a hard-coded built-in role list
- **Severity:** Low **Confidence:** High
- **File:** `src/lib/security/sandbox-gate.ts:77-82`
- **Problem:** The staff bypass of the verified-email gate is a string list (`instructor`/`admin`/`super_admin`/`assistant`). A custom role with equivalent or higher privilege does **not** bypass and must verify email — inconsistent with the *daily-quota* bypass 17 lines below (99), which correctly uses `caps.has("system.settings")`. The infrastructure to do it right is already imported in the same function.
- **Failure scenario:** An operator creates a custom `senior_instructor` role (with `system.settings`, `problems.create`, etc.). That user can't use the compiler/playground on an SMTP-less deployment while a built-in `instructor` can. Fail-safe direction (custom privileged roles are held to a *stricter* bar), so it's a consistency/maintainability defect, not a hole.
- **Fix:** Replace the role-string check with a capability or role-level check (e.g. `caps.has("system.settings")` or a `getRoleLevel` threshold), reusing the `resolveCapabilities(userRow.role)` result already computed for the quota bypass.

### F-4 — `encodeScalar` boolean encoding coerces a stringified `"false"` to `true`
- **Severity:** Low **Confidence:** Medium
- **File:** `src/lib/judge/function-judging/serialization.ts:37`
- **Problem:** `case "bool": return v ? "true" : "false"`. If a boolean function-judging value ever reaches this encoder as the string `"false"` (rather than a real boolean), `"false"` is truthy and the harness receives `true`. Function test-case values are stored as JSONB and normally parsed back as real booleans, so this is latent — but the codebase has a documented history of exactly this boolean-string class of bug (the deferred `db/import.ts` `"false" → true` finding).
- **Failure scenario:** A future import/CSV/form path that stores a boolean literal as the string `"false"` silently flips the expected/argument value, producing a wrong verdict on a boolean-return function problem with no error.
- **Fix:** Encode defensively: accept only real booleans or the exact strings `"true"`/`"false"`, throwing on anything else, rather than truthiness-coercing.

### F-5 — `JUDGE_ALLOW_ANY_JUDGE_IP` upsert stomps an operator's intentional value on separated hosts
- **Severity:** Low **Confidence:** High
- **File:** `deploy-docker.sh:1017` (`upsert_env_literal JUDGE_ALLOW_ANY_JUDGE_IP "${JUDGE_ALLOW_ANY_JUDGE_IP_DEFAULT}"`)
- **Problem:** `upsert_env_literal` overwrites on every deploy. On a separated host (`INCLUDE_WORKER=false` → default `0`), an operator who intentionally set `JUDGE_ALLOW_ANY_JUDGE_IP=1` (because network isolation is enforced by a firewall/security group, not by `JUDGE_ALLOWED_IPS`) has it reset to `0` on the next deploy, locking the remote worker out until they re-edit `.env.production`.
- **Failure scenario:** Post-deploy, a correctly-isolated separated worker can no longer register/claim because the app now denies its (allowlist-unmatched) IP; judging silently halts until someone notices and re-sets the flag.
- **Fix:** Use `ensure_env_literal` (backfill-only) for `JUDGE_ALLOW_ANY_JUDGE_IP` so an explicit operator value survives redeploys, or key the upsert off an explicit "deploy owns this" opt-in. (The same upsert-owns-the-value philosophy is applied to `AUTH_TRUST_HOST`, but there the correct value is unambiguous; here it is genuinely operator-dependent.)

### F-6 — Legacy claim tokens bypass the claim-duration cap
- **Severity:** Low **Confidence:** High (transitional)
- **File:** `src/app/api/v1/judge/poll/route.ts:91-102`; `src/lib/judge/claim-token.ts:22-24`
- **Problem:** `parseClaimToken` returns `claimCreatedAt: null` for tokens without an embedded timestamp, and the poll route only enforces the max-duration cap when `claimCreatedAt !== null` (92). A submission claimed before the `da607d36` deploy carries a legacy token and can be extended indefinitely via in-progress reports.
- **Failure scenario:** Only affects submissions in-flight across the deploy boundary; these drain within one stale-timeout window. Negligible in steady state.
- **Fix:** Treat a legacy (null-timestamp) token as already-expired for in-progress extension (force a re-claim), or backfill/rotate tokens on deploy. Low priority; document as accepted transitional behavior otherwise.

---

## Part 3 — Areas verified clean (no new defects)

- `src/lib/db/export-with-files.ts` streaming/staging (beyond the ZIP-slip fix) — per-entry streaming to disk; integrity manifest validated; abort-aware. (Whole-archive in-memory buffering for ZIP restore/export remains as previously deferred — `C4-US-014`/`C4-029` — bounded by the 512 MiB decompressed cap; not re-counted here.)
- `src/lib/judge/ip-allowlist.ts` — careful IPv4/IPv6 + CIDR matching; leading-zero-octet rejection; fail-closed on unknown IP when an allowlist exists.
- `src/lib/judge/function-judging/comparison.ts` + `serialization.ts` — server-authoritative float/exact mode resolution; int64 precision preserved via bigint/string with a loud throw on unsafe `number`; single-line-stdin assertion.
- `judge-worker-rs/src/comparator.rs:113-173` — float comparator handles NaN/Infinity explicitly, enforces equal token counts, abs-OR-rel tolerance.
- `judge-worker-rs/src/validation.rs` — docker-image/extension/dockerfile-path validators reject protocol, traversal, and non-`judge-*` namespaces; production requires a non-empty trusted-registry list.
- `src/lib/db-time.ts`, `src/lib/diff.ts`, `src/lib/pagination.ts`, `src/lib/validators/query-params.ts`, `src/lib/http/content-disposition.ts`, `src/lib/csv/escape-field.ts`, `src/lib/submissions/{id,status,visibility}.ts`, `src/lib/ops/admin-{health,metrics}.ts`, `src/lib/formatting.ts`, `src/lib/ratings.ts`, `src/lib/problems/catalog-numbers.ts` — reviewed directly; robust (bounded pagination, DB-authoritative time, CSV-injection prefixing, RFC-5987 filenames, layered submission-visibility redaction, Prometheus label escaping, `crypto.getRandomValues` IDs).

---

## Prioritized recommendations

1. **F-1 (Medium):** Align the TS and SQL late-penalty branches for windowed exams with a null personal deadline; add a cross-path unit test. This is the only finding that produces user-visible incorrect scores.
2. **F-2 (Medium):** Reduce the judge worker to `USER 1000` + `cap_add: [CHOWN]` instead of full root; document the tradeoff.
3. **F-3 / F-4 (Low):** Replace the hard-coded staff-role list in `sandbox-gate.ts` with a capability check; make `encodeScalar` bool encoding reject non-boolean inputs.
4. **F-5 / F-6 (Low):** Switch `JUDGE_ALLOW_ANY_JUDGE_IP` to backfill-only on separated hosts; treat legacy claim tokens as non-extendable.
5. **Deferred backlog:** The large architectural items (single-source rate limiting, real-time advisory-lock bottleneck, internal-service TLS, deploy-script decomposition, generated language-config contract, in-memory ZIP restore) remain valid and are tracked in `plan/cycle-4-2026-07-03-deferred.md`; none regressed.

---

*This cycle's pass verified the eight post-2026-07-05 fixes as correct and surfaced six new/still-open findings (1 Medium + 1 Medium hardening, 4 Low). Prior-cycle findings live in git history and the deferred plan; they were not re-enumerated here.*
