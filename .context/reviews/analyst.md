# Analyst Review — Cycle 3

*Date: 2026-06-30 | Scope: Full repository (systems-analysis & product-risk angle)*

This review combines direct reading of the critical-path files (submission create/claim/report,
auth, deploy, scoring, rate-limit, judge worker) with four parallel deep-dive sweeps
(judge worker Rust, auth/authorization, contest/scoring, rate-limit/API security). All
sub-agent claims were cross-validated against the actual source before inclusion; speculative
or already-mitigated agent findings were downgraded or dropped and are noted where relevant.

The codebase is large (636 src TS/TSX files, ~150 judge Dockerfiles, ~320 test files, a Rust
judge worker, and three Rust sidecars). It is unusually well-hardened — most "obvious" attacks
are already closed with documented rationale tied to prior RPF cycles. The findings below are
the residual risks after that hardening.

## File Inventory

### Core submission / judge data flow (read in full)
- src/app/api/v1/submissions/route.ts (GET list + POST create; advisory-lock + tx rate limiting)
- src/app/api/v1/judge/claim/route.ts (atomic claim, per-worker auth, capacity gating)
- src/lib/judge/claim-query.ts (the extracted claim SQL — worker_slot/candidate/claimed/prev_worker_release/worker_bump CTEs)
- src/app/api/v1/judge/poll/route.ts (result report endpoint — in-progress + final paths)
- src/lib/judge/verdict.ts (score = passed/total*100, metric aggregation, diagnostic truncation)
- src/lib/judge/auth.ts (per-worker token hash auth)
- src/lib/judge/languages.ts (language → docker image/compile/run command catalog)
- src/lib/judge/ip-allowlist.ts, src/lib/judge/worker-staleness.ts
- src/app/api/v1/submissions/[id]/rejudge/route.ts, src/lib/submissions/visibility.ts
- src/lib/db/schema.pg.ts (full schema)

### Judge worker (Rust) — judge-worker-rs/src/*
- main.rs, api.rs, docker.rs, executor.rs, runner.rs, languages.rs, comparator.rs, config.rs, types.rs, validation.rs
- Dockerfile.judge-worker, docker-compose.worker.yml, docker/seccomp-profile.json (278 lines)

### Auth & authorization (read in full)
- src/lib/api/auth.ts, src/lib/api/handler.ts, src/lib/api/api-key-auth.ts
- src/lib/auth/config.ts, src/lib/auth/session-security.ts, src/lib/auth/recruiting-token.ts
- src/lib/security/csrf.ts, src/lib/security/ip.ts, src/lib/capabilities/*

### Contest / scoring / exam (read in full)
- src/lib/assignments/leaderboard.ts, contest-scoring.ts, scoring.ts, exam-sessions.ts, recruiting-invitations.ts
- src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts, contests/join/route.ts

### Rate limiting / API security (read in full)
- src/lib/security/rate-limit.ts, rate-limit-core.ts, api-rate-limit.ts, rate-limiter-client.ts
- src/lib/security/encryption.ts, derive-key.ts, timing.ts, password-hash.ts
- src/lib/files/storage.ts, validation.ts; src/app/api/v1/files/[id]/route.ts
- src/app/api/v1/compiler/run/route.ts, playground/run/route.ts

### Deploy / infra (read in full)
- deploy-docker.sh (1704 lines), docker-compose.production.yml, Dockerfile.judge-worker
- src/app/api/metrics/route.ts, src/app/api/internal/cleanup/route.ts, src/app/api/v1/test/seed/route.ts
- src/lib/data-retention.ts (skim)

### Not fully examined (see Final Sweep)
- The ~140 per-language docker/Dockerfile.judge-*.* files (sampled the catalog, not each Dockerfile)
- Function-judging adapters (src/lib/judge/function-judging/adapters/*) — examined the registry/assemble entry points only
- Most React components under src/app/**/(*.tsx) and src/components (UI; out of systems-risk scope)
- Email providers, plugins/chat-widget internals (skimmed)

## Findings

### CRITICAL

#### C1: `contest:join` access-code redemption has no per-code brute-force lockout
- **File**: src/app/api/v1/contests/join/route.ts:11 → src/lib/assignments/access-codes.ts (redeemAccessCode); rate-limit key src/lib/security/rate-limit.ts:45-47
- **Scenario**: The only throttle on access-code redemption is `rateLimit: "contest:join"`, and `getRateLimitKey` keys purely on client IP (`${action}:${ip}`). `redeemAccessCode` does an equality lookup with no per-code failure counter and no global failure budget. The recruiting-token path deliberately added a per-invitation lockout (`MAX_FAILED_REDEEM_ATTEMPTS` in recruiting-invitations.ts) precisely to stop distributed brute-force — but the access-code path never got the equivalent. An attacker with N accounts and/or rotating IPs can test `apiRateLimitMax` codes per IP per window with no per-code accumulation. Instructors frequently choose short/guessable codes (the schema allows them), so the effective keyspace is far smaller than the theoretical 32^8. A guessed code grants contest enrollment (and submission access) to an unauthorized user.
- **Fix**: Mirror the recruiting-token defense: track failed access-code attempts per (assignmentId/code) in a counter with a lockout threshold, OR add a global per-IP "invalid access code" sub-limit independent of the success path, OR enforce a minimum code entropy at creation. At minimum, key a second rate-limit bucket on the submitted code prefix so distributed guessing of one code is bounded.
- **Confidence**: MEDIUM (real gap; exploitability depends on code entropy chosen by instructors, which the platform does not currently floor)

### HIGH

#### H1: `/poll` in-progress reports let an authenticated worker extend a claim indefinitely (claim starvation / no max-judge-time)
- **File**: src/app/api/v1/judge/poll/route.ts:82-118 (IN_PROGRESS path sets `judgeClaimedAt: dbNow` on every `judging`/`queued` report)
- **Scenario**: The stale-claim reclaim (claim-query.ts:48) only fires when `judge_claimed_at < NOW() - staleClaimTimeoutMs`. Each in-progress `/poll` report refreshes `judgeClaimedAt` to now, so a worker that keeps POSTing `status:"judging"` (buggy loop, a wedged container it never tears down, or a compromised/registered worker) holds the claim forever and the submission never becomes reclaimable. There is no server-side cap on total judging wall-time per submission. A single misbehaving registered worker can pin a submission in `judging` indefinitely, and the user sees a perpetual spinner. The activeTasks counter for that worker is also held, reducing fleet capacity.
- **Fix**: Track the original claim time separately (e.g., a `judge_first_claimed_at` or compare against `submitted_at`) and enforce an absolute max-judge-duration after which the claim is force-reclaimable regardless of in-progress heartbeats; OR cap the number of in-progress refreshes per claim token.
- **Confidence**: MEDIUM (requires a misbehaving-but-authenticated worker; the stale-claim self-heal does NOT cover a worker that keeps heartbeating in-progress)

#### H2: X-Forwarded-For with too-few hops falls through to spoofable X-Real-IP
- **File**: src/lib/security/ip.ts:97-117
- **Scenario**: When XFF is present but has fewer than `TRUSTED_PROXY_HOPS + 1` entries, the code logs a warning and does NOT return — it falls through to `headers.get("x-real-ip")` (line 114) and trusts it if syntactically valid. An attacker who can reach the app directly (or through a proxy that does not strip client-supplied X-Real-IP) sends a short/garbage XFF plus a forged `X-Real-IP`, and that forged value becomes the client IP. This feeds the judge IP allowlist (ip-allowlist.ts), all IP-keyed rate limits (getRateLimitKey), and audit logs. The intended hop-validation defense is bypassed for the X-Real-IP branch.
- **Fix**: When XFF is present at all, do NOT consult X-Real-IP — treat insufficient hops as "undeterminable" (return null in production) exactly as the XFF-absent path documents. The comment at line 113 already states the intent ("Only trust X-Real-IP when XFF is absent") but the code only enforces "absent", not "present-but-insufficient". Gate the X-Real-IP read on `!forwardedFor`.
- **Confidence**: HIGH (verified directly; correctly-configured nginx with `set_real_ip_from`+`real_ip_recursive` mitigates, but the app must not depend on that being correct)

#### H3: Proxy auth cache (and 60s capability cache) widen the post-revocation access window
- **File**: src/proxy.ts (authUserCache, AUTH_CACHE_TTL_MS default ~2s, capped ~10s) + src/lib/capabilities/cache.ts (~60s role→capability TTL)
- **Scenario**: After an admin deactivates a user or downgrades a role, the proxy serves cached auth for up to AUTH_CACHE_TTL_MS per instance (×N instances behind an LB), and capability resolution can lag up to ~60s. A user being removed mid-contest/exam, or an instructor downgraded to student, retains their prior access/capabilities for that window and can act on it (delete problems, exfiltrate, submit). The submission list endpoint already documents an intentional "students keep their own history" decision (submissions/route.ts:46-50), so this is specifically about elevated/active-state revocation latency.
- **Fix**: For high-impact transitions (deactivation, role downgrade, tokenInvalidatedAt bump), bypass or actively invalidate both caches — e.g., a cheap version/epoch column checked on each request, or push-invalidation across instances. At minimum, shorten the capability TTL for non-built-in roles and document the worst-case window in the operator runbook.
- **Confidence**: MEDIUM (behavior is documented as a known trade-off; flagged because the window scales with instance count and covers privilege downgrades, not just self-history)

#### H4: IOI "solved" flag and leaderboard live-rank diverge from a 100% late submission
- **File**: src/lib/assignments/contest-scoring.ts:398-408 (`solved: bestScore >= ap.points`) with scoring.ts:138-165 (late penalty multiplies the scaled score)
- **Scenario**: For IOI, `bestScore` is the late-penalty-adjusted, points-scaled value. A submission that passes 100% of tests but is submitted after the deadline gets `bestScore < points`, so `solved` is false even though every test passed. Any UI/analytics that counts "solved problems" from this flag will under-report, and a participant who fully solved a problem late is shown as unsolved. Separately, IOI `bestScore` repeating-decimal overrides (e.g., 33.33×3) can drift between the SQL ROUND(...,2) board total and the JS `Math.round(rawTotal*100)/100` live-rank total at the 0.01 epsilon boundary (leaderboard.ts isScoreTied), producing an off-by-one rank for the affected user.
- **Fix**: Define and document whether "solved" means "100% tests passed" (pre-penalty) or "earned full points" (post-penalty); compute `solved` from the pre-penalty percentage if the former is intended. For the float drift, run the live-rank sum through the identical rounding/ordering as the board, or store override totals as fixed-precision.
- **Confidence**: MEDIUM (the `solved` divergence is verified in code; the float-drift edge requires specific override values)

### MEDIUM

#### M1: Expensive sandbox endpoints (compiler/playground) share IP rate-limit budget and rely on per-user daily quota
- **File**: src/app/api/v1/compiler/run/route.ts:38-42, src/app/api/v1/playground/run/route.ts (similar)
- **Scenario**: Both spawn Docker containers. The short-window protection is the shared `apiRateLimitMax` per IP plus a per-user daily quota (compiler 500/day, playground 200/day via consumeUserDailyQuota). A user with multiple accounts (or recruiting candidates, who are auto-provisioned) can multiply the daily ceiling, and the per-minute IP cap is the global API max rather than a tight per-endpoint cap. Under coordinated abuse this is enough container churn to saturate a single worker.
- **Fix**: Add a tight dedicated per-endpoint short-window limit (e.g., compiler:run:burst keyed on userId) on top of the daily quota, and consider a global concurrency cap on standalone compile/run independent of the judge queue.
- **Confidence**: MEDIUM

#### M2: Worker memory reporting can mislabel usage as the limit when cgroup is unreadable
- **File**: judge-worker-rs/src/docker.rs:150-167 (read_cgroup_memory_peak), executor.rs fallback
- **Scenario**: When the worker runs where it cannot read the judged container's cgroup `memory.peak` (nested-container / namespace-isolated hosts), `memory_peak_kb` is None and the fallback reports the configured memory limit as the peak. A submission using half the limit is shown as having used the full limit, misleading users (they "optimize" memory unnecessarily) and corrupting any MLE-adjacent analytics. This is a correctness/UX bug, not a sandbox bypass — the actual `--memory` cgroup enforcement is unaffected.
- **Fix**: Distinguish "unmeasured" from "hit limit": report 0 / null (Option) when the cgroup read fails rather than substituting the limit, and surface "memory unavailable" in the UI.
- **Confidence**: MEDIUM

#### M3: Worker report retry does not distinguish claim-expired (4xx) from transient (5xx) — orphans submissions
- **File**: judge-worker-rs/src/executor.rs (report_with_retry) + poll/route.ts returns 403 invalidJudgeClaim on token mismatch
- **Scenario**: If the server reclaims a stale submission (giving it to another worker) while the original worker is finishing, the original worker's final `/poll` returns 403 (claim token no longer matches). The worker's retry loop treats all failures uniformly and retries, then dead-letters. The submission, meanwhile, depends entirely on the new claimant to finalize it. If the in-progress refresh kept the OLD worker's claim alive (see H1) the new worker never claims it; the two failure modes interact. At minimum, retrying a 403 claim-expired is wasted work and the diagnostic ("Report attempt failed") does not tell operators it was a claim race.
- **Fix**: On 401/403/invalidJudgeClaim, stop retrying immediately and log a distinct "claim lost/expired" reason; only retry 5xx/network errors.
- **Confidence**: MEDIUM

#### M4: No upfront bound on total test-case input size or test-case count sent to the worker
- **File**: src/app/api/v1/judge/claim/route.ts:319-329 (loads ALL test cases), judge-worker-rs/src/executor.rs (runs them all, especially when runAllTestCases=true for IOI)
- **Scenario**: A problem authored with many/large test cases (10k cases, or multi-MB inputs each) is returned in full to the worker on every claim and, in IOI mode, every case is executed and every per-case result is serialized back to `/poll`. This can OOM the worker, blow the HTTP body size on the report, and make a single submission monopolize the queue. There is no server-side cap on `count(test_cases)` or `sum(len(input))` per problem.
- **Fix**: Enforce a problem-authoring limit on test-case count and total input bytes; reject or chunk problems exceeding it. Add a worker-side guard that fails fast with a clear "problem too large" verdict rather than OOMing.
- **Confidence**: MEDIUM

#### M5: Text-type file uploads validated by null-byte scan, not magic bytes
- **File**: src/lib/files/validation.ts (text/* branch verifies absence of null bytes only)
- **Scenario**: A binary payload (e.g., an ELF) declared as `text/plain` that happens to lack null bytes in the sampled regions passes verification and is later served. Download path does fall back to `application/octet-stream` when magic bytes do not match (files/[id]/route.ts) and sets nosniff, which mitigates browser execution — but the validation contract for text types is weaker than for images.
- **Fix**: For text/* require the sampled bytes to be valid printable/UTF-8 text (reject control bytes other than tab/newline/CR), not merely null-free.
- **Confidence**: MEDIUM

#### M6: drizzle-kit push deploy strategy + additive psql repairs = recurring schema-drift risk
- **File**: deploy-docker.sh:1191-1264 (push, destructive-diff abort, then manual `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` repairs), and the Step-5b secret_token backfill (1105-1189)
- **Scenario**: The deploy uses `drizzle-kit push` (live diff) rather than journal migrations, and then patches specific columns with ad-hoc `ADD COLUMN IF NOT EXISTS`. This works but means the journaled migration SQL is effectively dead (the comment at 1108-1116 says push ignores journal SQL files), so any data-migration logic that lives only in journal files silently never runs on push deploys. Each new column that push "forgets" on an old DB needs another hand-written repair line; the secret_token saga is the documented precedent. Over time the source of truth for "what the prod schema actually is" diverges from both schema.pg.ts and the journal.
- **Fix**: Pick one strategy. Either commit to journaled `drizzle-kit migrate` (and keep meta/_journal + snapshots in sync, verified by the existing migration-drift test) or formally document push as authoritative and delete/quarantine the dead journal SQL so no one assumes those DO-blocks run. The current hybrid is the riskiest of the three.
- **Confidence**: MEDIUM (operational/maintainability risk; the current code has guards but the strategy invites recurring drift)

#### M7: Exam-session start computes personalDeadline before the conflict-insert; concurrent starts can yield a non-winner's expected deadline
- **File**: src/lib/assignments/exam-sessions.ts:~53-106 (check → compute personalDeadline → insert onConflictDoNothing → re-fetch)
- **Scenario**: Two concurrent start requests both pass the "no existing session" check and each compute `personalDeadline = dbNow + duration` against slightly different `dbNow`. One insert wins; both callers re-fetch the winner's row. The losing caller therefore receives a personalDeadline it did not compute (off by the inter-request delta). The re-fetch makes the stored value consistent (good), but a client that already started a local countdown from its request's optimistic value can be off by that delta. Low blast radius given a 120-min window, but the contract "the deadline I was told equals the deadline enforced" can be briefly violated for the loser.
- **Fix**: Compute personalDeadline inside the transaction after confirming no row exists, or always derive the client countdown from the server-returned row (never from a client-side start time).
- **Confidence**: MEDIUM

#### M8: Anonymous leaderboard still exposes full per-problem score vectors
- **File**: src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:70-85
- **Scenario**: Anonymous mode replaces username/name with `Participant <rank>` but returns each participant's full per-problem score/attempt breakdown. A viewer who also has any non-anonymous signal (an export, an anti-cheat report containing usernames, or simply knowing a few classmates' scores) can re-identify participants by matching the distinctive per-problem vector, especially in small cohorts. De-anonymization is straightforward when score vectors are near-unique.
- **Fix**: In anonymous mode, return only aggregate totals (and optionally coarse per-problem solved/unsolved), not exact per-problem scores; or gate per-problem detail behind an instructor opt-in.
- **Confidence**: MEDIUM

#### M9: API-key role downgrade and tokenInvalidatedAt comparison use whole-Date/created-before semantics with edge cases
- **File**: src/lib/api/api-key-auth.ts:84-92 (reject if createdAt < tokenInvalidatedAt) and 106-113 (effectiveRole)
- **Scenario**: A key created in the same second as a revocation, or immediately before a deliberate `tokenInvalidatedAt` bump, may or may not be rejected depending on millisecond truncation; and a key created AFTER a revocation is intentionally still valid (revocation only invalidates pre-existing keys). The effectiveRole min() correctly resolves custom-role levels via getRoleLevel, so the earlier "escalation" concern does not hold — but the revocation semantics (revoke does not kill keys minted after the revocation) should be explicit, since an attacker who can create a key right after a revocation keeps long-lived access.
- **Fix**: Document that session revocation does not retroactively cover keys minted after the revocation timestamp, and require an explicit per-key revoke for full lockout; use getTime() comparisons consistently (already does).
- **Confidence**: LOW

### LOW

#### L1: JWT `iat` fallback for authenticatedAt is safe but fragile by design
- **File**: src/lib/auth/session-security.ts:13-23, clearAuthToken sets authenticatedAt=0
- **Scenario**: A sub-agent flagged the `iat` fallback as a revocation bypass. On inspection it is NOT exploitable: `iat` is a NextAuth-signed claim an attacker cannot forge without AUTH_SECRET, and clearAuthToken deliberately sets authenticatedAt=0 (not delete) so a cleared token never falls back to iat. The residual risk is only maintainability: future code that constructs tokens without authenticatedAt would silently rely on iat. Keep as-is; add a comment/test pinning the invariant.
- **Confidence**: HIGH (that it is currently safe)

#### L2: Pagination offset has no explicit upper bound
- **File**: src/lib/api/pagination.ts (offset = (page-1)*limit)
- **Scenario**: With current MAX_PAGE/limit the offset is small and safe. If those config caps are ever raised, large OFFSET queries become a cheap way to force slow full scans. No overflow today.
- **Fix**: Add an explicit max-offset clamp so future config changes cannot introduce a slow-query DoS.
- **Confidence**: LOW

#### L3: Rate-limit / realtime eviction sweeps are best-effort with no retry
- **File**: src/lib/security/rate-limit.ts:53-63 (evictStaleEntries logs and continues on error)
- **Scenario**: If eviction repeatedly errors (permissions, connection), the rate_limits / realtime_coordination tables grow unbounded, slowly degrading the SELECT-FOR-UPDATE hot path. Bounded by the 24h pruners elsewhere but those can also fail silently.
- **Fix**: Emit a metric on eviction failure so monitoring catches a stuck sweep; consider a backstop bulk-delete on the retention pruner.
- **Confidence**: LOW

#### L4: `decrypt(..., { allowPlaintextFallback: true })` weakens the GCM guarantee where used
- **File**: src/lib/security/encryption.ts (decrypt plaintext-fallback option)
- **Scenario**: The fallback defaults off and is only meant for migration, but any production call site passing it accepts unauthenticated plaintext in an "encrypted" column, removing tamper-detection for that field.
- **Fix**: Audit/annotate all callers; assert the flag is only reachable from migration code paths, never request-time reads.
- **Confidence**: LOW

#### L5: ICPC score overrides intentionally not reflected on the leaderboard (gradebook/board mismatch)
- **File**: src/lib/assignments/contest-scoring.ts:285-288 (ICPC overrides deferred, N7-C7-ICPC)
- **Scenario**: An instructor's score override shows in the gradebook but not on the ICPC leaderboard, so a student sees inconsistent standings. Documented as deferred, but it is a live correctness inconsistency for ICPC contests that use overrides.
- **Fix**: Either implement ICPC override mapping (solved/penalty/AC-time semantics) or surface a clear UI warning that overrides do not affect ICPC ranking.
- **Confidence**: HIGH (that the mismatch exists)

#### L6: Deploy script SSH-helpers modular-extraction trigger already tripped
- **File**: deploy-docker.sh:94-103 (C3-AGG-5 trigger note: touch-count met at cycle 8)
- **Scenario**: The script's own carry-forward registry says the next SSH-helpers edit must schedule the modular extraction or document a fresh deferral. This is process drift, not a runtime bug, but the 1704-line monolith is approaching the 1500-line trigger and concentrates a lot of credential-handling logic in one place.
- **Fix**: Extract the SSH/remote/env-handling helpers into a sourced file as the script's own policy requires; reduces blast radius of future edits to credential paths.
- **Confidence**: HIGH (self-declared in the file)

## Strengths Observed (to avoid re-flagging in later cycles)
- Judge sandbox is strong: `--network none`, `--cap-drop=ALL`, `--read-only`, `--pids-limit 128`, `--memory`/`--memory-swap` capped equal, `no-new-privileges`, non-root user 65534, `nofile` ulimit, custom 278-line seccomp default-on, optional gVisor (`JUDGE_OCI_RUNTIME=runsc`). Docker access is via a read-only socket proxy with BUILD=0, not the raw socket.
- Claim is genuinely atomic: `FOR UPDATE SKIP LOCKED` + fresh claim-token fence + self-healing stale reclaim + activeTasks accounting with documented self-reclaim compensation. Final `/poll` writes are token-fenced (WHERE judgeClaimToken=claimToken), so zombie workers cannot double-write.
- Submission create is serialized per-user via `pg_advisory_xact_lock(hashtextextended(userId))` and enforces rate/pending/global-queue caps inside the transaction with DB time.
- Rate-limit core is TOCTOU-safe (SELECT FOR UPDATE + ON CONFLICT DO NOTHING) and the sidecar fast-path explicitly fails-open to the authoritative DB path (never fail-closed on sidecar outage).
- Per-worker token auth removed the shared-token exfiltration blast radius on /claim and /poll; shared token is bootstrap-only on /register.
- Leaderboard freeze IS enforced server-side (frozen board recomputes with a submitted_at < freeze cutoff for non-instructors; auto-unfreezes at late/deadline).
- Deploy has real data-safety: mandatory pre-deploy pg_dump (abort on failure), PG orphan-volume safety check, PGDATA pinning, destructive drizzle diff abort, volumes never pruned, app-server language/worker build guard tied to CLAUDE.md.
- Encryption uses AES-256-GCM with fresh IVs + tag validation and HKDF domain-separated keys; passwords use Argon2id (OWASP params) with transparent rehash; token compares are HMAC-then-timingSafeEqual.

## Final Sweep — Skipped/Missed Files
- **Per-language judge Dockerfiles (~140 files, docker/Dockerfile.judge-*)**: Not individually audited. Risk is concentrated in the few with `-dNOSAFER` (postscript/Ghostscript runCommand uses `-dNOSAFER`, languages.ts:854) and any image running interpreters with filesystem/network capability — but all run inside the `--network none --cap-drop=ALL --read-only` sandbox, so the blast radius is bounded. Recommend a follow-up pass specifically on postscript/`-dNOSAFER` and any image whose runCommand enables network or write access.
- **Function-judging adapters (src/lib/judge/function-judging/adapters/*)**: Only the registry + assemble entry points and the claim-time assembly fallback were examined. The per-language harness codegen (string escaping across 7 languages) is a plausible injection/correctness surface and has dedicated tests; a focused review of cross-language-string-escaping is warranted but was out of scope here.
- **Most React components / pages (src/app/**/*.tsx, src/components)**: Out of systems-risk scope; client-side authz is assumed non-authoritative (server routes are the boundary, which is the correct posture).
- **Email providers, plugins/chat-widget, OG route**: Skimmed only.
- **The three Rust sidecars beyond rate-limiter (code-similarity)**: Not read; both are auth-token-gated in compose and isolated.

## Summary
The single most actionable new risk is **C1**: access-code redemption lacks the per-code brute-force lockout that the analogous recruiting-token path already has, so contest enrollment is guessable when instructors pick weak codes. The judge-pipeline risks cluster around claim lifecycle gaps — **H1** (an authenticated worker can pin a submission in `judging` forever because in-progress reports refresh the stale-claim clock with no absolute max-judge-time) and **M3** (retry loop cannot tell a lost-claim 403 from a transient error). **H2** (XFF-too-few-hops falling through to a spoofable X-Real-IP) is a concrete, verified IP-trust bypass feeding the allowlist and all IP-keyed rate limits. **H3/H4** are revocation-latency and IOI scoring-consistency edges worth closing. Recommended priority: C1 → H1/H2 → M3/M6 → the remaining MEDIUMs. The sandbox, claim atomicity, deploy data-safety, and crypto are already strong and should not be re-litigated in later cycles.
