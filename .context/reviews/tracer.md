# Cycle 3 — tracer

Repository: `/Users/hletrd/flash-shared/judgekit` (head `207623f9`). Read-only pass.
Method: observation-first; competing hypotheses per flow; evidence for/against; ranked verdict; discriminating probe. All file:line citations verified against the current tree this cycle.

Status legend vs. prior cycles:
- **RESOLVED** = prior-cycle finding no longer reproduces (code changed).
- **CONFIRMED** = reproduces this cycle with the cited evidence.
- **DEFENSE-IN-DEPTH** = the code path exists as described, but the deployed configuration / a boot guard makes it non-exploitable in the shipped topology; the concern is hardening, not an active vuln.
- **NOT REAL** = the premise of the threat does not match the code.

---

## Cross-flow summary

| Flow | Prior ID | Cycle-3 verdict | Severity if holds | Confidence |
|---|---|---|---|---|
| 1. Restore audit durability (R1) | C2-R1 | **RESOLVED** | — | HIGH |
| 1. Restore DB-before-files atomicity (R2 / AGG-1) | C2-R2 | **CONFIRMED** (mitigated) | HIGH | HIGH |
| 1. Restore concurrent-restore lock (AGG-23) | C2 | **CONFIRMED** | MEDIUM | HIGH |
| 2. SSE re-auth on group/capability revoke (NEW-M2) | C2-AGG-28 | **CONFIRMED** | MEDIUM | HIGH |
| 3. Anti-cheat Origin fail-open (NEW-M9 / AGG-29) | new | **DEFENSE-IN-DEPTH** | LOW (deployed) / MEDIUM (code) | HIGH |
| 4. X-Real-IP trusted at hops=0 (C2-H7) | C2-H7 | **DEFENSE-IN-DEPTH** | LOW (deployed) | HIGH |
| 5. Recruiting-token brute-force race (NEW-M7) | new | **NOT REAL** | — | HIGH |
| 6. Judge `/claim` shared-token + IP allowlist (NEW-H5) | new | **CONFIRMED** (config-gated) | HIGH if token leaks | HIGH |

The two highest-value actions this cycle: (a) close **R2/AGG-1** with atomic file staging, and (b) decide whether `JUDGE_ALLOWED_IPS` should be promoted from "recommended" to "required" so NEW-H5 stops being load-bearing on the shared token alone.

---

## Flow 1 — Restore end-to-end

### Observation
`POST /api/v1/admin/restore` walks: password re-check → `takePreRestoreSnapshot` → `importDatabase` → (ZIP only) `restoreParsedBackupFiles` → `recordAuditEventDurable`. The route now imports `recordAuditEventDurable` (`route.ts:6`) and uses the **durable** helper at both audit call sites (`route.ts:183` failure, `route.ts:209` success). This is a material change from cycle 2 (which flagged the buffered variant at this call site as R1).

### Causal chain (file:line hops)
1. `route.ts:149` — `takePreRestoreSnapshot(user.id)` runs before any destructive change.
2. `route.ts:156-161` — if snapshot is `null` and `ALLOW_UNSNAPSHOTTED_RESTORE !== "1"`, returns 500 `preRestoreSnapshotFailed` **before** the import. Snapshot-null is gated.
3. `route.ts:163` — `importDatabase(data)`; the truncate+insert is one `db.transaction` (`import.ts:134`). Any failure inside (truncate fail `:159`, schema drift `:202`, batch insert fail `:226`) throws → tx rolls back → outer catch (`:236-247`) zeros `tableResults` and returns `{success:false, message:"Import failed and was rolled back. No data was changed."}`.
4. `route.ts:165-172` — import-fail branch surfaces `preRestoreSnapshotPath` in the 500 body. Operator has the rollback handle.
5. `route.ts:178-202` — ZIP-only file restore. First throw jumps to the catch at `:181`, which fires `recordAuditEventDurable` (`:183`) with `action: system_settings.database_restore_files_failed` including `preRestoreSnapshotPath` and the error, then returns 500 with `preRestoreSnapshotPath`.
6. `route.ts:209-221` — success audit, durable, past tense, with `filesRestored` count.

### Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible |
|------|------------|------------|-------------------|--------------------------|
| 1 | R1 (audit durability) is RESOLVED; the shipped code uses durable at both sites | HIGH | Strong (direct read) | `route.ts:6,183,209` all reference `recordAuditEventDurable`; cycle-2 R1 cited `recordAuditEvent` (buffered) — that line no longer exists |
| 2 | R2 / AGG-1 window is STILL OPEN: DB commits before files; `writeUploadedFile` is a direct write with no temp+rename; first failure aborts the loop and leaves DB rows pointing at absent blobs | HIGH | Strong (direct read) | `storage.ts:27-30` `writeFile(..., {mode:0o644})` to final path; `export-with-files.ts:351-360` no per-file try/catch |
| 3 | AGG-23 (no concurrent-restore lock) is STILL OPEN | HIGH | Strong (absence confirmed) | `grep` for `advisory` / `FOR UPDATE` in `route.ts` and `import.ts` returns nothing |

### Evidence For
- **R1 resolved:** `route.ts:6` `import { recordAuditEventDurable }`; `route.ts:183` and `:209` both `await recordAuditEventDurable(...)`. `events.ts:275-285` confirms durable = immediate awaited insert with buffer fallback, never throws.
- **R2 still open:** `storage.ts:27-30` writes directly to `resolveStoredPath(storedName)` — no temp file, no `rename`. `export-with-files.ts:355-357` is a bare `for...of` with `await writeUploadedFile(...)`; no try/catch inside the loop; first throw propagates to `route.ts:181`. By then `importDatabase` has committed at `route.ts:163`, so the `files` table already asserts every uploaded file exists.
- **AGG-23 still open:** neither `route.ts` nor `import.ts:107-250` contains any `pg_advisory_xact_lock` or mutex. Two concurrent admin restores race on the same truncate+insert tx and on the same upload directory.

### Evidence Against / Gaps
- R2 is **mitigated, not bare**: the durable failure audit (`route.ts:183`) now records the snapshot path, and the 500 body surfaces it (`route.ts:198`). The operator's rollback handle exists. This downgrades R2 from "silent corruption" (cycle 2) to "recoverable inconsistency with an audit trail" — but the DB still asserts absent files until manual rollback.
- Crash between `importDatabase` commit (`:163`) and the durable failure audit (`:183`): in that narrow window no audit row exists for the restore attempt at all. The pre-restore snapshot on disk is the only recovery artifact. The window is small (a few `await`s) but nonzero.
- **Buffered-audit reinsertion (cycle-2 L1) re-verified:** `auditEvents` IS in the import table set (`export.ts:204`), so `importDatabase` deletes+repopulates it inside the tx. The in-memory `_auditBuffer` (`events.ts:168`) is NOT cleared by the import tx; the next 5 s flush (`events.ts:184-220`) re-inserts any pre-restore buffered events into the freshly-restored table. Minor (those events really did happen) but the restored DB's audit log is not a clean "post-restore" view.

### Rebuttal Round
- Best challenge to R2-leader: "the snapshot is the rollback artifact, so partial file writes are recoverable." Rebuttal: recovery requires a human to notice the 500, find the snapshot path in the response body, and manually restore. There is no automatic compensating action and no per-file cleanup of the half-written blobs already on disk. The audit trail helps detection but does not close the consistency window.
- Best challenge to "R1 fully resolved": the post-import in-memory buffer still holds pre-restore events that get re-inserted post-flush (L1). R1's *durability* claim is resolved; its *cleanliness* claim has a residual nit.

### Current Best Explanation
R1 is resolved in code. R2/AGG-1 is still a real consistency window but is now instrumented (durable audit + snapshot path surfaced). AGG-23 is unchanged. The cycle-2 → cycle-3 diff on this route is a genuine fix; the remaining work is the file-restore atomicity (Phase B) and the concurrent-restore lock.

### Critical Unknown
Whether the operator runbook actually consumes `preRestoreSnapshotPath` from the 500 body. The code surfaces it; whether anyone reads it under load is unverified.

### Discriminating Probe
Inject a synthetic throw inside `restoreParsedBackupFiles` (mock `writeUploadedFile` to reject on the Nth call) and assert: (a) the durable `database_restore_files_failed` row appears in `auditEvents`, (b) the 500 body contains `preRestoreSnapshotPath`, (c) at least one `files` row references a path that does not exist on disk. All three together = R2 confirmed live; only (a)+(b) = R2 mitigated.

### Uncertainty Notes
- R2 severity assumes the `files` table is consulted on read (broken uploads surface as 404/ENOENT to end users). Not re-traced at the read path this cycle.
- AGG-23 severity assumes two admins can restore concurrently in practice; operationally rare, hence MEDIUM.

---

## Flow 2 — SSE re-auth (NEW-M2 / C2-AGG-28)

### Observation
A submission SSE connection authorizes once at connect via `canAccessSubmission` (`submissions/[id]/events/route.ts:334`). A 30 s throttle re-runs `getApiUser` on poll ticks. `canAccessSubmission` is **not** re-invoked on the open connection.

### Causal chain
1. Connect: `route.ts:213` `getApiUser(request)` (identity); `route.ts:334` `canAccessSubmission(submission, user.id, user.role)` (authorization).
2. Shared poll timer ticks every `ssePollIntervalMs` (≥1 000 ms) → per-subscriber `onPollResult`.
3. Throttle at `route.ts:~378-417`: if `now - lastAuthCheck >= 30_000` the IIFE at `route.ts:386-407` runs `const reAuthUser = await getApiUser(request); if (!reAuthUser || reAuthUser.id !== viewerId) { close(); return; }`.
4. **`canAccessSubmission` appears exactly once in this file** — line 334, connect only (confirmed by grep). The re-auth IIFE does not reload the submission row and does not re-call it.

### Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible |
|------|------------|------------|-------------------|--------------------------|
| 1 | NEW-M2 holds: group-membership / capability revoke is NOT caught on an open SSE until `sseTimeoutMs` (~5 min default); only identity revoke is caught within ~30 s | HIGH | Strong (single-call grep + IIFE body) | `canAccessSubmission` grep returns 1 hit at `:334`; the IIFE compares identity only |
| 2 | The 30 s throttle is itself best-effort and can slip by `ssePollIntervalMs` | MEDIUM | Moderate (timer composition) | Re-auth runs inside the poll callback, not on its own timer; worst case ≈ `ssePollIntervalMs + 30_000` |

### Evidence For
- `route.ts:386-407` IIFE body calls `getApiUser` and compares `reAuthUser.id !== viewerId`. There is no `canAccessSubmission(reloadedSubmission, ...)` call.
- `canAccessSubmission` (`permissions.ts:292-320`) routes instructor/TA access through `canViewAssignmentSubmissions` → `hasGroupInstructorRole`. Group removal flips this to false, but nothing on the open connection re-checks it.
- Comment at `route.ts:~377-379` states intent: "deactivated users don't keep receiving data." The design target is account deactivation, not group revoke.

### Evidence Against / Gaps
- Identity-level revoke (session token invalidated, `isActive=false`, API key deactivated) IS caught — `getApiUser` → `getActiveAuthUserById` → `isTokenInvalidated`. So the gap is scoped to authorization (group/capability), not authentication.
- Owner of the submission (`submission.userId === viewerId`) keeps access by design even after group removal — not a bug.

### Rebuttal Round
- Best challenge: "5-minute exposure is bounded by `sseTimeoutMs`, so it's not a real leak." Rebuttal: 5 minutes of a revoked TA continuing to see live status/terminal events (including `queryFullSubmission` output at `route.ts:325-352`) is a real authorization lag, especially in an exam-contest setting where the SSE carries result data. Severity is bounded but nonzero.

### Current Best Explanation
NEW-M2 is confirmed. The re-auth path validates identity every ~30 s but never re-runs `canAccessSubmission`. Revoked group membership or a `submissions.view_all` capability removal persists on an open connection until the SSE times out.

### Critical Unknown
Whether the product's threat model treats group-membership revoke as "must take effect within seconds on already-open realtime connections." If yes, this is a real authz bug; if "session-level only," it is acceptable.

### Discriminating Probe
In an integration test: open SSE as an instructor, remove the instructor from the group via a second admin session, advance fake timers past 30 s + one poll tick, and assert whether the connection closes. If it stays open past the tick, NEW-M2 is confirmed at the behavior level (not just code-reading).

### Uncertainty Notes
- Line numbers in the IIFE are approximate (~386-407); the single-hit grep on `canAccessSubmission` is the load-bearing fact and is exact.
- Terminal-result send (`route.ts:325-352`) has no per-event auth at all; it relies entirely on the throttled identity check upstream.

---

## Flow 3 — Anti-cheat Origin / AUTH_URL fail-open (NEW-M9 / AGG-29)

### Observation
Three independent Origin checks exist, each with its own allowlist seed. Only the anti-cheat POST and the global CSRF check are in scope for NEW-M9.

### Causal chain
- **CSRF** (`csrf.ts:30-74`): mutation routes only. `getExpectedHost` (`csrf.ts:7-17`) returns `getAuthUrlObject()?.host`, or `null` in production if AUTH_URL is unset. The Origin step at `csrf.ts:56-71` is gated by `if (origin && expectedHost)` — when `expectedHost` is `null`, the Origin comparison is **skipped** (fail-open). `X-Requested-With` and `Sec-Fetch-Site` still apply.
- **Anti-cheat POST** (`contests/[assignmentId]/anti-cheat/route.ts:63-79`): production-only; requires Origin to be present (`:65-67`, fail-closed on absence); if `expectedHost = getAuthUrlObject()?.host` is undefined, the host-equality block is skipped (`if (expectedHost)` at `:70`) — any non-empty Origin passes (fail-open on host-match).
- **Server actions** (`server-actions.ts:20-44`): when `getTrustedAuthHosts()` returns empty, prod falls through to `trustedHosts.has(originHost)` = false (fail-closed).

### Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible |
|------|------------|------------|-------------------|--------------------------|
| 1 | The CSRF/anti-cheat fail-open CODE exists as described, but is UNREACHABLE in deployed production because `validateAuthUrl()` throws at boot if AUTH_URL is unset | HIGH | Strong (boot guard + deploy script) | `env.ts:124-139` throws in prod when AUTH_URL missing; `auth/config.ts:149` evaluates it at boot; `deploy-docker.sh:553,1239` auto-derives AUTH_URL from DOMAIN |
| 2 | The fail-open is exploitable because AUTH_URL could be unset | LOW | Weak (requires bypass) | Requires either bypassing the boot guard or an operator deleting AUTH_URL from `.env.production` post-deploy |

### Evidence For
- H1: `validateAuthUrl()` (`env.ts:124`) throws `AUTH_URL must be set in production` and is reached via `auth/config.ts:149` (NextAuth config module load). The app does not serve traffic with AUTH_URL unset.
- H1: `deploy-docker.sh:553-557` derives `AUTH_URL=https://${DOMAIN}` and `:1239-1240` writes it into remote `.env.production`. `DOMAIN` is required (`:139`).
- H1: `assertProductionConfig()` (`production-config.ts:54-89`) does NOT include AUTH_URL in its required list, but the separate NextAuth-boot guard covers it. Both layers would have to miss.
- Code-level fail-open is real: `csrf.ts:56` skips Origin when `expectedHost` is null; anti-cheat `route.ts:70` skips host-match when `expectedHost` is undefined.

### Evidence Against / Gaps
- The fail-open logic is genuinely present in code. If a future refactor moved the AUTH_URL guard out of the NextAuth config path (or lazy-loaded auth config after traffic started), the window would reopen.
- `assertProductionConfig()` not listing AUTH_URL is a minor smell — the prod-config validator is the natural home for "required in production" env vars.

### Rebuttal Round
- Best challenge to H1: "boot guard aside, the CSRF check is structurally weak — it skips Origin whenever expectedHost is null, so any code path that computes expectedHost from a different source could silently disable it." Rebuttal: today there is exactly one source (`getAuthUrlObject().host`) and it is gated at boot. The structural weakness is a hardening opportunity, not an active vuln.

### Current Best Explanation
NEW-M9 / AGG-29 is **defense-in-depth**, not actively exploitable in the shipped topology. The fail-open code exists, but `validateAuthUrl()` + the deploy script make AUTH_URL-unset-in-production unreachable under normal boot. Recommend: (a) add AUTH_URL to `PRODUCTION_REQUIRED_ENV_VARS` so the env validator also enforces it (belt-and-suspenders), and (b) consider making the CSRF Origin check fail-closed when `expectedHost` is null in production.

### Critical Unknown
Whether any deployment target boots NextAuth config lazily (after traffic starts) such that the boot guard runs late. The algo/worv/auraedu targets all use the same `deploy-docker.sh`, so this is unlikely but unverified for custom targets.

### Discriminating Probe
Grep deployment runbooks / Dockerfile entrypoint for the order of (a) process ready to accept traffic vs. (b) `auth/config.ts` module evaluation. If (a) precedes (b), the boot guard is not actually a boot guard and H1 downgrades.

### Uncertainty Notes
- The maum.ai `.env.production:3` sets `AUTH_URL=http://oj-internal.maum.ai` (HTTP, internal hostname). `getAuthUrlObject().host` will resolve correctly; `shouldUseSecureAuthCookie()` returns false because it is not HTTPS — a separate cookie-security concern, not in scope here.

---

## Flow 4 — IP extraction at trustedHops 0/1/2 (C2-H7)

### Observation
`extractClientIp` (`ip.ts:68-129`) gates XFF on `trustedHops > 0` (`:97`). After commit `23851d69` reverted the cycle-2 gate, `X-Real-IP` is read unconditionally whenever control reaches `:114` (XFF absent, hops=0, or under-hop failure) — only `isValidIp` filters it.

### Causal chain (per hops value)
- **hops=0:** XFF skipped entirely (`:97` short-circuit). Falls through to X-Real-IP at `:114-117`. Returns X-Real-IP if valid; else `null` (prod) / `"0.0.0.0"` (dev).
- **hops=1, XFF="1.2.3.4, 10.0.0.1":** `parts.length=2 >= trustedHops+1=2`; `clientIndex = 2-2 = 0` → `parts[0]="1.2.3.4"`.
- **hops=2, same XFF:** `parts.length=2 < 3`; warns; falls through to X-Real-IP.

### Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible |
|------|------------|------------|-------------------|--------------------------|
| 1 | C2-H7 is DEFENSE-IN-DEPTH: X-Real-IP-at-hops=0 is header-trusted in code, but deployed nginx overwrites both XFF and X-Real-IP from `$remote_addr`, so the header is not client-controllable on the public ingress leg | HIGH | Strong (nginx configs + env files) | `deploy.sh:256-257` and `online-judge.nginx.conf:60-61,74-75,85-86,97-98` SET both headers to `$remote_addr`; `$proxy_add_x_forwarded_for` appears only in `static-site/static.nginx.conf:24` (a different service) |
| 2 | C2-H7 is exploitable because TRUSTED_PROXY_HOPS could be set to 0 | LOW | Weak (env unset) | `TRUSTED_PROXY_HOPS` is unset in every env/compose file; code default at `ip.ts:12` is `"1"` → deployed hops=1, not 0 |

### Evidence For
- H1 (deployed hops is 1, not 0): `grep -ci TRUSTED` returns 0 across `.env.production`, `.env.production.example`, `.env.deploy.*`, `.env`, `docker-compose.production.yml`. Default at `ip.ts:12` parses `"1"`.
- H1 (nginx overwrites both headers): `scripts/online-judge.nginx.conf:60-61` and `deploy.sh:256-257` both use `X-Real-IP $remote_addr` and `X-Forwarded-For $remote_addr` (NOT `$proxy_add_x_forwarded_for`). No `real_ip_recursive` / `set_real_ip_from` anywhere — not needed because headers are replaced, not appended.
- H1 (the only genuine hops=0 leg is worker→app): `docker-compose.production.yml:138` `JUDGE_BASE_URL=http://app:3000/api/v1`, no nginx; the peer is a `JUDGE_AUTH_TOKEN`-authenticated internal worker.
- Spoofing scenario walk-through: at deployed hops=1, a client sending `X-Forwarded-For: spoofed, realclient` has its header **replaced** by nginx with `$remote_addr` (single element). At the app, `parts.length=1 < trustedHops+1=2` → gate fails → falls back to X-Real-IP, which nginx also overwrote. Returns nginx's `$remote_addr`. **Not spoofable.**

### Evidence Against / Gaps
- The code-level concern is real: `ip.ts:113-117` has no hop validation on X-Real-IP. If a future deployment forwards X-Real-IP through unset, or switches XFF to `$proxy_add_x_forwarded_for` without `set_real_ip_from`, the spoof returns.
- The revert commit message (`23851d69`) explicitly defers on this: "verify every production nginx config overwrites X-Real-IP; if any target forwards it client-controlled, re-open." This cycle verified all four app-facing nginx stanzas overwrite it.

### Rebuttal Round
- Best challenge to H1: "worker→app is hops=0 and trusts X-Real-IP; an attacker who reaches the internal network can spoof." Rebuttal: reaching that leg requires already being inside the docker network AND holding `JUDGE_AUTH_TOKEN`; the IP check is not the boundary there.

### Current Best Explanation
C2-H7 is **defense-in-depth**. Under the shipped nginx topology (XFF and X-Real-IP both overwritten from `$remote_addr`, deployed hops=1), the X-Real-IP-trusted-at-hops=0 path is not reachable by an external attacker. The revert was the correct call given the deployed configs. Residual hardening: either document the nginx-overwrite requirement as a deploy gate, or reintroduce a narrower hop gate on X-Real-IP that does not break the worker→app leg (e.g., gate only when XFF is present, rather than unconditional).

### Critical Unknown
Whether any non-repo deployment target (a customer-managed nginx, a Cloudflare-fronted path) forwards X-Real-IP client-controlled. The repo only proves the shipped configs are safe.

### Discriminating Probe
Diff every production nginx stanza against a known-safe template in CI (`grep -L 'X-Real-IP \$remote_addr'` over deployed configs). If any config forwards the header through, re-open C2-H7 for that target.

### Uncertainty Notes
- The `tests/unit/judge/ip-allowlist.test.ts:8-16,27` pin `TRUSTED_PROXY_HOPS=0` to model the worker→app internal leg — that is a test fixture, not the public-ingress config.

---

## Flow 5 — Recruiting-token concurrent redemption (NEW-M7)

### Observation
Recruiting tokens are claimed inside the NextAuth Credentials `authorize` callback (`auth/config.ts:177-202` → `redeemRecruitingToken`). The schema has **no** `uses` / `maxUses` column.

### Causal chain
1. Client: `recruit-start-form.tsx:81` `signIn("credentials", { recruitToken, ... })`.
2. `auth/config.ts:192-200` applies an IP-scoped rate limit (`getRateLimitKey("login", headers)`), deliberately NOT cleared on success.
3. `redeemRecruitingToken` (`recruiting-invitations.ts:520`) opens `db.transaction` (`:527`).
4. Plain SELECT by `tokenHash` (`:533-551`) — no `FOR UPDATE`. (See why below.)
5. Per-invitation brute-force lockout check (`:560-563`, `MAX_FAILED_REDEEM_ATTEMPTS=5`), incremented atomically via `jsonb_set` (`:96-115`).
6. **Atomic conditional UPDATE** at `:742-758`: `UPDATE ... SET status='redeemed', userId=..., redeemedAt=... WHERE id=invitation.id AND status='pending' AND (expiresAt IS NULL OR expiresAt > NOW()) RETURNING id`.
7. Empty `updated` → throw `alreadyRedeemed` → rollback (`:760-773`).

### Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible |
|------|------------|------------|-------------------|--------------------------|
| 1 | NEW-M7 is NOT REAL: there is no uses/maxUses counter to race past; the atomic conditional UPDATE serializes concurrent claimants via Postgres row-level locking | HIGH | Strong (schema + SQL) | `schema.pg.ts:999-1035` has no uses/maxUses; `:742-758` is a single atomic UPDATE gated on `status='pending'` |
| 2 | NEW-M7 is real via the plain SELECT (no FOR UPDATE) before the UPDATE | LOW | Weak (misreads MVCC) | The SELECT is read-only; the claim is the UPDATE, and Postgres locks the tuple on UPDATE regardless of how the row was read |

### Evidence For
- H1: schema (`schema.pg.ts:999-1035`) columns are `status`, `userId`, `redeemedAt`, `expiresAt`, `tokenHash`, `metadata` — no counter.
- H1: the claim is a single `UPDATE ... WHERE status='pending' ... RETURNING`. Two concurrent transactions both attempting this UPDATE on the same row: the first takes the tuple lock and commits; the second blocks, re-evaluates WHERE against the committed row (`status` no longer `pending`), updates 0 rows, returns empty, throws `alreadyRedeemed`. Exactly one redemption succeeds.
- H1: expiry is folded into the same atomic WHERE (`expiresAt > NOW()`), eliminating the JS-side clock-skew TOCTOU.
- H1: side effects of redeem (create user, enrollment, contest access token — `:710-739`) are all inside the SAME tx that flips `status`. Over-redemption is structurally impossible.

### Evidence Against / Gaps
- The plain SELECT inside the tx (`:533-551`) is not `FOR UPDATE`. This is fine because the UPDATE is the gate, but a reader skimming the code might flag it. Not a bug.
- `incrementFailedRedeemAttempt` / `resetFailedRedeemAttempt` are fire-and-forget outside the tx (`:619,647,778` are `void`-called). The author documents at `:88-94` that this can under/over-count, affecting lockout tightness — not redemption correctness.

### Rebuttal Round
- Best challenge to H1: "FOR UPDATE is missing, so the read is non-serializable." Rebuttal: `FOR UPDATE` matters when the read-then-write is two steps and you need to prevent the row from changing between them. Here the write IS the predicate — `UPDATE WHERE status='pending'` is self-serializing. The read at `:533` only fetches display fields and the id; the id is immutable.

### Current Best Explanation
NEW-M7 is **not real** as described. The threat assumes a multi-use-with-a-cap token; this codebase has single-use tokens claimed by an atomic conditional UPDATE. No over-redemption is possible. Close NEW-M7.

### Critical Unknown
Whether any OTHER recruiting flow (not this single-use path) has a multi-use counter. None found this cycle.

### Discriminating Probe
Concurrency test: spawn N parallel `redeemRecruitingToken` calls with the same token, assert exactly one returns `{ok:true}` and N-1 return `alreadyRedeemed`, and assert exactly one `users` + one `enrollments` row were created. This both confirms H1 and locks the property against future regression.

### Uncertainty Notes
- The IP rate limiter (`auth/config.ts:192-200`) is per-IP and non-clearing; combined with the per-invitation 5-fail lockout, brute-force is bounded. Not re-traced at the rate-limit implementation this cycle.

---

## Flow 6 — Judge `/claim` shared-token + IP allowlist (NEW-H5)

### Observation
`/judge/claim` is AND-gated through IP allowlist then token. The token stage branches on `workerId`: per-worker hash lookup vs shared `JUDGE_AUTH_TOKEN`. The IP allowlist fails open when `JUDGE_ALLOWED_IPS` is unset, and that env var is "recommended" not "required."

### Causal chain
1. `claim/route.ts:123-125` — `if (!isJudgeIpAllowed(request)) return apiError("ipNotAllowed", 403);`
2. `claim/route.ts:171-180` — token stage: `workerId ? isJudgeAuthorizedForWorker(request, workerId) : isJudgeAuthorized(request)`.
3. `isJudgeAuthorized` (`judge/auth.ts:26-35`) constant-time-compares Bearer token to `getValidatedJudgeAuthToken()` (env `JUDGE_AUTH_TOKEN`, `env.ts:294-312`).
4. `isJudgeAuthorizedForWorker` (`judge/auth.ts:52-97`) hashes the Bearer and looks up `judge_workers.secretTokenHash`.
5. IP allowlist (`judge/ip-allowlist.ts:160-166`): `if (!allowlist) return true;` — **fail-open when unset**.

### Hypothesis Table

| Rank | Hypothesis | Confidence | Evidence Strength | Why it remains plausible |
|------|------------|------------|-------------------|--------------------------|
| 1 | NEW-H5 holds: with `JUDGE_ALLOWED_IPS` unset (the default), the shared `JUDGE_AUTH_TOKEN` alone grants unrestricted `/judge/claim` from any IP — and the shared-token (no-workerId) path skips capacity accounting, so a holder can exfiltrate source + test cases + expected outputs at the rate-limiter cadence | HIGH | Strong (direct read of gate + payload) | `ip-allowlist.ts:160-166` fail-open; `production-config.ts:43-52` lists it as recommended not required; `claim/route.ts:316-326,410-424` returns `sourceCode` + all `testCases` including `expectedOutput` |
| 2 | The blast radius is bounded by `consumeApiRateLimit("judge:claim")` and the per-call LIMIT 1 | MEDIUM | Moderate | `claim-query.ts:51,145` is LIMIT 1; `route.ts:163` rate-limit gate; but rate-limit only slows, does not prevent, exfiltration |
| 3 | IP spoofing can bypass the allowlist even when it IS set | LOW | Weak (cross-flow) | Depends on Flow 4: deployed nginx overwrites both XFF and X-Real-IP, so `extractClientIp` returns nginx's peer, not a spoofable value |

### Evidence For
- H1: `judge/ip-allowlist.ts:160-166` returns `true` when `getAllowlist()` is null. The comment literally says "allow all (temporary for worker access)."
- H1: `production-config.ts:43-52` puts `JUDGE_ALLOWED_IPS` in `PRODUCTION_RECOMMENDED_ENV_VARS` (warning only), NOT in `PRODUCTION_REQUIRED_ENV_VARS` (`:11-35`).
- H1: shared-token path (`workerId` omitted) reaches the same claim/return as per-worker; the `hasWorker=false` branch of `buildClaimSql` (`claim-query.ts:133-172`) skips the online check, capacity bump, `prev_worker_release`, and `worker_bump` CTEs.
- H1 payload: `route.ts:410-424` returns `sourceCode`, `testCases` (no visibility filter; `expectedOutput` included, `:316-326`), `timeLimitMs`, `memoryLimitMb`, `dockerImage`, `compileCommand`, `runCommand`, `claimToken`. A malicious claimant can also drive the verdict via `/judge/poll` using the returned `claimToken` (same dual gate, `poll/route.ts:70-74`).

### Evidence Against / Gaps
- The token comparison IS constant-time (`timing.ts:9-18` HMAC + `timingSafeEqual`), and `JUDGE_AUTH_TOKEN` has a 32-char min and rejects placeholders (`env.ts:294-312`). So the token itself is not brute-forceable.
- The IP allowlist, WHEN configured, fails closed on undetermined IP (`ip-allowlist.ts:171`). The fail-open is specifically the "unset" case.
- Per-Flow-4, IP spoofing does not bypass a configured allowlist under the deployed nginx.

### Rebuttal Round
- Best challenge to H1: "this is only exploitable if the token leaks, and the token is a secret — every system is broken if its secret leaks." Rebuttal: the issue is blast radius + defense-in-depth. A leaked shared token with no IP allowlist AND no capacity accounting is a full solution/test-case exfiltration API from any IP, with no per-worker throttling. Promoting `JUDGE_ALLOWED_IPS` to required (or making the shared-token path IP-locked to internal ranges) shrinks the blast radius of a token leak.
- Best challenge on severity: "rate limit caps it." Rebuttal: rate limit slows but does not prevent; one claim per window still drains the queue over time.

### Current Best Explanation
NEW-H5 is confirmed as a **config-gated** finding. The code is correct as written (AND-gate, constant-time compare), but the IP allowlist's fail-open-when-unset combined with "recommended not required" makes the shared `JUDGE_AUTH_TOKEN` the sole boundary in default deployments. If that token leaks, the blast radius is full source + answer-key exfiltration and verdict forgery, with no IP restriction and no capacity accounting on the shared-token path.

### Critical Unknown
Whether the production deployments (algo / worv / auraedu) actually set `JUDGE_ALLOWED_IPS`. The repo env files do not surface it; needs operator confirmation.

### Discriminating Probe
Check the live `.env.production` on each deployed target for `JUDGE_ALLOWED_IPS`. If unset on any target that also runs a public `/judge/claim`, NEW-H5 is live there. Second probe: add `JUDGE_ALLOWED_IPS` to `PRODUCTION_REQUIRED_ENV_VARS` in a branch and see whether the deploy still boots on targets that rely on the shared token — this reveals which targets depend on the fail-open.

### Uncertainty Notes
- Shared-token path being "unrestricted claim" is by design for bootstrap (per `auth.ts:42-48` comment). The concern is that it stays usable after per-worker tokens exist.
- `JUDGE_AUTH_TOKEN` is also the gate for `/judge/register` (`register/route.ts:31`), so its blast radius extends to worker registration.

---

## Cycle-3 cross-cutting notes

### What got fixed since cycle 2
- **R1 (restore audit durability):** route now uses `recordAuditEventDurable` at both call sites. The cycle-2 discriminating probe ("swap `recordAuditEvent` → `recordAuditEventDurable`; if suite still passes, the exit criterion was never guarded") would now pass-fail-correctly. **Close R1.**
- **C2-AGG-2 / C2-AGG-3 (snapshot):** `takePreRestoreSnapshot` now streams to disk (no full-buffer), unlinks partial files on failure, and reads size via `fs.stat` separately from pipeline errors (`pre-restore-snapshot.ts:54-125`).
- **C2-H7 (X-Real-IP at hops=0):** the revert was the correct call given deployed nginx overwrites both headers from `$remote_addr`. **Close as defense-in-depth.**

### What is still open and load-bearing
- **R2 / AGG-1 (file-restore atomicity):** real, mitigated by snapshot + durable audit. Recommend Phase-B atomic staging (temp dir + rename + post-rename tx commit, or directory swap).
- **AGG-23 (concurrent-restore lock):** no mutex / advisory lock. Recommend `pg_advisory_xact_lock` keyed on a restore constant.
- **NEW-M2 (SSE re-auth on group revoke):** real authz lag bounded by `sseTimeoutMs`. Recommend re-calling `canAccessSubmission` in the 30 s throttle IIFE.
- **NEW-H5 (shared-token blast radius):** promote `JUDGE_ALLOWED_IPS` to required, OR IP-lock the shared-token path.

### What was down-ranked / closed this cycle
- **NEW-M7 (recruiting-token race):** not real — single-use atomic conditional UPDATE, no counter to race.
- **NEW-M9 / AGG-29 (Origin fail-open):** defense-in-depth — boot guard + deploy script make AUTH_URL-unset-in-prod unreachable. Hardening only.

### Top-priority probes for cycle 4
1. Inject a synthetic throw in `restoreParsedBackupFiles` and assert (a)+(b)+(c) from Flow 1's discriminating probe — turns R2 from code-reading into behavior.
2. SSE integration test with fake timers + mid-stream group removal — turns NEW-M2 from code-reading into behavior.
3. Live-deployment env audit for `JUDGE_ALLOWED_IPS` on algo / worv / auraedu — turns NEW-H5 from "if token leaks" into "is the gate actually present."

### Uncertainty notes (whole-pass)
- All line numbers cited are from the current tree (`207623f9`) and were re-read this cycle, except the SSE IIFE line range (~386-407), which is approximate; the load-bearing single-hit grep on `canAccessSubmission` is exact.
- No runtime reproduction was performed; all findings are code-traced, not observed at runtime. The discriminating probes above are the fastest path to behavior-level confirmation.
- Phase-B items AGG-2, AGG-10, AGG-14..20, AGG-24..62 (other than the ones explicitly re-traced) were not re-traced this cycle; their status is whatever the cycle-2 plan recorded.
