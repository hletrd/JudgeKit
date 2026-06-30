# Architect Review — JudgeKit (Cycle 3 / 2026-06-30)

**Date:** 2026-06-30  
**Scope:** Entire repository, with emphasis on files changed in the current cycle (`deploy-docker.sh`, `static-site/nginx.conf`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts`, `src/app/api/v1/contests/join/route.ts`, `src/lib/compiler/execute.ts`, `src/lib/security/ip.ts`) and cross-cutting architecture (API route organization, judge/worker boundaries, DB schema/migrations, deployment topology).  
**Findings count:** 16

---

## Summary

The current cycle hardens several trust boundaries (IP spoofing resistance, static-site directory listings, access-code rate limiting, compiler-runner input validation) but introduces one significant deployment regression: removing the global `client_max_body_size 50M;` from the generated nginx config leaves file-upload routes subject to the 1 MiB nginx default, which conflicts with the application's 50 MiB default upload limit. Beyond the current diff, long-standing architectural risks remain around migration-journal integrity, process-local cache coherence under horizontal scale-out, and frozen runtime configuration captured at module-load time.

---

## Findings

---

### CRITICAL: Removing global nginx `client_max_body_size` breaks file uploads

- **Severity:** CRITICAL
- **Confidence:** HIGH
- **File:** `deploy-docker.sh:1473,1543` (removed lines); `src/app/api/v1/files/route.ts:35`; `src/lib/system-settings-config.ts:61`

**Problem:**  
The deploy script no longer emits `client_max_body_size 50M;` at the `server {}` level. The generated production nginx config now contains only three explicit body-size directives:

- `/api/auth/` → `1m`
- `/api/v1/judge/poll` → `50M`
- `/api/v1/judge/` → `1m`

All other routes, including `POST /api/v1/files`, fall into the catch-all `location / {}`, which sets no `client_max_body_size`. Nginx therefore applies its default of 1 MiB. The application, however, defaults `uploadMaxFileSizeBytes` to 50 MiB and allows ZIP/image/attachment uploads up to that size. Any upload larger than 1 MiB will be rejected by nginx with `413 Request Entity Too Large` before the application can validate it.

**Failure scenario:**  
An instructor uploads a 10 MiB PDF attachment or a ZIP archive of test data. The browser POSTs to `/api/v1/files`; nginx returns 413. The admin UI shows a generic upload failure. The bug is silent because unit tests mock the request object and never exercise the nginx layer; the existing `judge-report-nginx.test.ts` only verifies the judge-report endpoint.

**Suggested fix:**  
Add an explicit `location /api/v1/files/ { client_max_body_size 50M; ... }` block (or derive the limit from the configured `uploadMaxFileSizeBytes` at deploy time). Keep the global default restrictive; scope the larger limit only to routes that legitimately accept large bodies. Add a deployment test that asserts `/api/v1/files/` has a body limit matching the configured upload maximum.

**Cross-references:**  
- `tests/unit/infra/judge-report-nginx.test.ts` — covers judge report body size but not uploads  
- `tests/unit/infra/deploy-security.test.ts` — covers static-site autoindex but not upload body size  
- `src/lib/files/validation.ts` — application-level size checks that nginx will now preempt

---

### HIGH: Inline SQL patches bypass the Drizzle migration journal

- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `deploy-docker.sh:1250-1262`; `src/lib/db/migrate.ts:1-7`; `scripts/check-migration-drift.sh:1-28`

**Problem:**  
`deploy-docker.sh` applies additive schema changes via raw `psql` after `drizzle-kit push`:

```bash
ALTER TABLE problems ADD COLUMN IF NOT EXISTS default_language text;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS default_language text;
```

Because `ADD COLUMN IF NOT EXISTS` is idempotent, `drizzle-kit push` sees the column present and does not generate a journal entry. The columns exist in `schema.pg.ts`, but the migration journal (`drizzle/pg/`) never records them. The `db:check` drift guard compares schema to journal snapshots, so it cannot detect this bypass. A disaster-recovery replay from the journal would therefore produce a schema missing these columns.

**Failure scenario:**  
Production database is rebuilt from journal migrations after a catastrophic failure. The app starts, but any query selecting `problems.default_language` or `system_settings.default_language` fails at runtime. The drift guard passed in CI because it never compared the deployed DB to the journal.

**Suggested fix:**  
Eliminate the raw `psql` pre-patches. Add new columns only through `drizzle-kit generate` so the journal stays the single source of truth. If a zero-downtime additive change must happen outside `push`, wrap it in a committed journal migration using Drizzle's `sql` escape hatch rather than external `psql`.

**Cross-references:**  
- `src/lib/db/schema.pg.ts:275` (`problems.defaultLanguage`)  
- `src/lib/db/schema.pg.ts:606` (`systemSettings.defaultLanguage`)  
- `scripts/check-migration-drift.sh` — drift guard that misses this pattern

---

### HIGH: Process-local caches have no cross-instance invalidation

- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/lib/system-settings-config.ts:84`; `src/lib/capabilities/cache.ts:17`; `src/lib/assignments/contest-analytics-cache.ts:27`

**Problem:**  
`resolveCapabilities`, `getConfiguredSettings`, and the analytics LRU are module-level, in-process singletons. Invalidation only clears the current process. In a horizontally scaled deployment, an admin change to role capabilities or system settings propagates only to the replica that handled the write; other replicas serve stale data until their TTLs expire (15 s for settings, 60 s for capabilities/analytics).

**Failure scenario:**  
An admin revokes the `MANAGE_CONTESTS` capability from a role. The replica processing the write clears its cache; the other replicas continue to authorize `MANAGE_CONTESTS` actions for up to 60 s. A user can create or delete contests during that window under a role that no longer has permission.

**Suggested fix:**  
Short-term: reduce capabilities cache TTL to ~5 s. Correct solution: introduce a DB version counter or Redis pub/sub invalidation so all replicas observe writes promptly.

**Cross-references:**  
- `src/lib/capabilities/cache.ts` — role capability cache  
- `src/lib/system-settings-config.ts` — settings cache  
- `src/lib/assignments/contest-analytics-cache.ts` — analytics LRU

---

### HIGH: Session `maxAge` is captured at module-load time

- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/lib/auth/config.ts:325`

**Problem:**  
`session: { strategy: "jwt", maxAge: getSessionMaxAgeSeconds() }` evaluates `getSessionMaxAgeSeconds()` once when the module is first loaded. The value is frozen for the lifetime of the process. If an operator changes `sessionMaxAgeSeconds` in the admin UI, new JWTs are still signed with the old `maxAge` until the process restarts.

**Failure scenario:**  
During a security incident, an operator reduces session lifetime from 30 days to 1 hour. Existing sessions expire as expected (JWT `exp`), but newly issued sessions still receive a 30-day `exp`. The operator believes the change is active; it is not. There is no UI warning that a restart is required.

**Suggested fix:**  
Move enforcement to the `jwt` callback: read the current `sessionMaxAgeSeconds` on each validation and return `null` if `now - iat` exceeds the configured lifetime. Alternatively, add a prominent admin UI notice that changes require a restart.

**Cross-references:**  
- `src/lib/auth/session-security.ts` — token invalidation logic  
- `src/lib/system-settings-config.ts` — settings cache used by `getSessionMaxAgeSeconds`

---

### HIGH: `submissions.judgeWorkerId` lacks a foreign key constraint

- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/lib/db/schema.pg.ts:487,507`

**Problem:**  
`submissions.judgeWorkerId` is declared as plain `text` with no `.references(() => judgeWorkers.id)`. When a worker row is deleted, historical submissions retain the old string with no cascade behavior or referential integrity.

**Failure scenario:**  
Operations decommissions `worker-0` by deleting its `judgeWorkers` row. Later, an audit query joins `submissions` to `judgeWorkers` on `judge_worker_id`. All historical submissions from that worker disappear from the join. Forensic attribution is silently lost.

**Suggested fix:**  
Add `references(() => judgeWorkers.id, { onDelete: "set null" })` to preserve the historical row while nullifying the worker reference on deletion. Generate a migration with `drizzle-kit generate`.

**Cross-references:**  
- `src/lib/db/schema.pg.ts:487` — column definition  
- `src/lib/judge/auth.ts` — worker registration

---

### HIGH: `/api/v1/judge/poll` route path is baked into the Rust worker binary

- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/poll/route.ts:1-5`; `judge-worker-rs/src/main.rs` (worker startup)

**Problem:**  
The route name `/api/v1/judge/poll` is semantically misleading (it receives worker results, not poll responses) and is permanently frozen because the Rust worker binary hard-codes the URL. Renaming or restructuring judge routes requires a coordinated app + worker redeploy.

**Failure scenario:**  
A future refactor moves judge routes to `/api/judge/v1/...`. The `poll` endpoint is updated, but the worker binary on `worker-0` is not immediately redeployed. Workers claim submissions, execute them, POST results to a 404, and retry without backoff. Submissions remain stuck in "judging" state.

**Suggested fix:**  
Externalize the result-submission URL as a worker env var (read at startup), add an `/api/v1/judge/results` alias that proxies to the real handler, and document the frozen path prominently in `AGENTS.md`.

**Cross-references:**  
- `judge-worker-rs/src/main.rs` — worker main loop  
- `src/app/api/v1/judge/claim/route.ts` — corresponding claim endpoint

---

### MEDIUM: Similarity-check authorization duplicates the handler's authz model

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24,37`

**Problem:**  
The route uses `auth: true` in `createApiHandler` and then performs its own authorization inside the handler via `canRunSimilarityCheck`. That function layers `canManageContest`, capability resolution, group-TA check, and assigned-group check. This bypasses the handler's built-in `{ capabilities: [...] }` authz and scatters the same access-control semantics across route files, making it easy for future routes to drift from the canonical model.

**Failure scenario:**  
A new admin route is added that also needs `anti_cheat.run_similarity`. The developer uses `createApiHandler({ auth: { capabilities: ["anti_cheat.run_similarity"] }})`, which does not include the TA/assigned-group exceptions that `canRunSimilarityCheck` adds. Two routes with the same intent enforce different authorization rules.

**Suggested fix:**  
Move `canRunSimilarityCheck` into a shared helper (e.g., `src/lib/assignments/contests.ts`) and make `createApiHandler` capable of accepting it, or standardize on capability checks for the API surface and keep TA/assignment checks as an explicit secondary gate documented in the helper. At minimum, the route should not both skip handler authz and reimplement it.

**Cross-references:**  
- `src/lib/api/handler.ts` — handler authz logic  
- `src/lib/assignments/contests.ts` — `canManageContest`  
- `tests/unit/api/similarity-check.route.test.ts` — current test coverage

---

### MEDIUM: Compiler-run validation is duplicated and can drift between TS and Rust runners

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/compiler/execute.ts:177-251`; `judge-worker-rs/src/runner.rs:124-162`

**Problem:**  
`execute.ts` now validates Docker image names, source size, and shell commands *before* delegating to the Rust runner. The Rust runner performs its own `validate_shell_command`. The TypeScript validator is stricter (it also checks command prefixes), and the comments explicitly note that the two must be "kept in lock-step." Any future change to one validator that is not mirrored in the other creates a behavioral split: a command accepted by the Rust runner may be rejected locally, or vice versa.

**Failure scenario:**  
A language maintainer adds a legitimate command prefix (e.g., `zig`) to `ALLOWED_COMMAND_PREFIXES` in `execute.ts` but forgets to update the Rust runner's denylist. Local fallback works; Rust-runner path rejects valid submissions. Alternatively, the Rust runner relaxes a rule and the local fallback becomes the stricter, unexpected failure mode.

**Suggested fix:**  
Make the Rust runner the single source of truth for command validation: send the command to the runner and let it reject with a structured error. The local fallback can keep a minimal, permissive safety net. Add a unit test that asserts both validators accept/reject the same representative command set.

**Cross-references:**  
- `judge-worker-rs/src/runner.rs:124` — Rust validator  
- `src/lib/judge/docker-image-validation.ts` — image allowlist  
- `tests/unit/compiler/execute.test.ts` — execute tests

---

### MEDIUM: Access-code failure rate limits accumulate without success reset

- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/contests/join/route.ts:29-37`; `src/lib/security/api-rate-limit.ts:198-222`

**Problem:**  
On a failed access-code redemption, the route consumes two additional rate-limit buckets: one keyed to the user (`contest:join:invalid:user:<id>`) and one keyed to the code hash (`contest:join:invalid-code:code:<hash>`). The global `contest:join` limit is already consumed by `createApiHandler`. There is no mechanism to reset or forgive these invalid-attempt counters when a user eventually redeems a valid code. A user who mistypes several codes can be locked out of the success path until the window expires, even after supplying a valid code.

**Failure scenario:**  
A student mistypes an access code 30 times in one minute (the default API window), then receives the correct code from the instructor. The per-user invalid bucket is now at its limit; the next redemption attempt—valid or not—is blocked with 429 for the remainder of the window.

**Suggested fix:**  
Treat invalid-code attempts as part of the same `contest:join` bucket rather than adding separate buckets, or reset the invalid-attempt counters on a successful redemption. If separate buckets are required for code-guessing protection, use a higher threshold for the invalid bucket than for the success bucket.

**Cross-references:**  
- `src/lib/security/api-rate-limit.ts` — `consumeUserApiRateLimit` implementation  
- `tests/unit/api/contests.route.test.ts:297-313` — tests for invalid-code rate limiting

---

### MEDIUM: Similarity-check timeout starts before the expensive work

- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:44-65`; `src/lib/assignments/code-similarity.ts:319-390`

**Problem:**  
The route arms a 30-second `AbortController` timeout, then awaits `getContestAssignment`, authorization checks, and the database query before starting `runAndStoreSimilarityCheck`. The actual similarity work (Rust sidecar with a 25 s timeout, or the TypeScript fallback) therefore has less than the full 30 s. More importantly, the raw SQL query that fetches the best submission per user/problem/language does not observe the abort signal, so a slow query can consume the entire budget and leave no time for computation.

**Failure scenario:**  
On a large assignment, the CTE query takes 20 s due to lock contention or missing indexes. The route aborts the similarity computation shortly after it begins, returning `timed_out` even though the expensive query—not the computation—caused the timeout. The operator sees repeated "timeout" reports and misdiagnoses the sidecar as the bottleneck.

**Suggested fix:**  
Start the abort timer immediately before `runSimilarityCheck`, not at the route entry. Pass the abort signal into the raw query path (Drizzle does not natively support it, but a `Promise.race` with an abort rejection can bound it). Alternatively, add a separate query timeout and return a distinct error so operators can distinguish query slowness from computation slowness.

**Cross-references:**  
- `src/lib/assignments/code-similarity-client.ts:53` — Rust sidecar 25 s timeout  
- `src/lib/assignments/code-similarity.ts:330` — raw CTE query

---

### MEDIUM: `minPasswordLength` system setting is dead code

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/db/schema.pg.ts:591`; `src/lib/security/password.ts`; `src/lib/validators/profile.ts`

**Problem:**  
`systemSettings.minPasswordLength` exists in the schema and admin UI, but `grep` finds no runtime reference to `minPasswordLength` or `min_password_length` in any validator, server action, or route. Password validation hard-codes a minimum of 8 characters (`FIXED_MIN_PASSWORD_LENGTH = 8`).

**Failure scenario:**  
An operator sets `minPasswordLength = 16` in the admin UI, expecting stronger passwords. Users continue to register with 8-character passwords. A security audit reports the setting is non-functional.

**Suggested fix:**  
Either consume `minPasswordLength` from cached system settings in the password validators, or remove the column and admin field entirely. Half-implemented settings create false confidence.

**Cross-references:**  
- `src/lib/security/password.ts` — hard-coded minimum  
- `src/lib/validators/profile.ts` — profile password validation

---

### MEDIUM: Analytics cache mixes DB clock and app clock

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/assignments/contest-analytics-cache.ts:47,62`

**Problem:**  
Cache entries are written with `createdAt: await getDbNowMs()` (DB server clock) but aged with `Date.now() - cached.createdAt` (app server clock). If the two clocks drift, the computed age is wrong. App clock behind DB clock produces negative ages and suppresses background refresh; app clock ahead produces premature refreshes.

**Failure scenario:**  
After a VM live-migration, the DB clock is 30 s ahead of the app clock. Cache entries are timestamped 30 s in the future relative to `Date.now()`. For 30 s after each write, `age` is negative and the 60 s stale threshold is never crossed. Leaderboard data is served up to 90 s stale.

**Suggested fix:**  
Use a consistent clock source. Replace `createdAt: await getDbNowMs()` with `createdAt: Date.now()` (simpler, no extra DB round-trip) so both write and read use app time.

**Cross-references:**  
- `src/lib/db-time.ts` — `getDbNowMs` implementation  
- `src/lib/assignments/contest-analytics.ts` — analytics computation

---

### MEDIUM: `deploy-docker.sh` exceeds modularization threshold

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `deploy-docker.sh:1-1704`

**Problem:**  
The deploy script is over 1,700 lines and mixes Docker builds, BuildKit recovery, DB migration, raw SQL patches, nginx generation, health checks, and environment validation. A failure in any concern aborts the whole deploy with no per-phase rollback or idempotency guarantee. The inline SQL patches (see HIGH finding above) are a direct symptom of this accumulation.

**Failure scenario:**  
A typo in the nginx config generation section causes the script to fail after migrations have already run and new containers have started. The operator must manually determine which phases completed and which need rollback.

**Suggested fix:**  
Extract phase scripts (`scripts/deploy/01-build.sh`, `02-migrate.sh`, `03-up.sh`, `04-healthcheck.sh`) and make `deploy-docker.sh` a thin sequencer. This also enables CI to test migration phases independently.

**Cross-references:**  
- `scripts/check-migration-drift.sh` — migration validation  
- `scripts/rebuild-worker-language-images.sh` — already extracted recovery script

---

### LOW: `extractClientIp` returns a dev-only sentinel that collapses rate limiting

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/security/ip.ts:130`

**Problem:**  
In non-production environments, `extractClientIp` returns `"0.0.0.0"` when no proxy headers are present. All rate-limit keys that depend on IP collapse to the same value, so a load test or multiple developers behind the same router share a single bucket and can accidentally trigger 429s.

**Failure scenario:**  
Two developers on the same office network run E2E tests against a staging instance. Both appear as `0.0.0.0`. The first developer's test run exhausts the IP-based rate limit; the second developer's run immediately receives 429 responses unrelated to their own activity.

**Suggested fix:**  
In non-production, derive a more granular fallback from the request socket's `remoteAddress` when available, or document that `0.0.0.0` is intentional and that dev/staging deployments should always set `X-Forwarded-For`. Add a debug log when the sentinel is used.

**Cross-references:**  
- `src/lib/security/rate-limit.ts` — login rate-limit key derivation  
- `src/lib/security/api-rate-limit.ts:160` — API rate-limit key derivation

---

### LOW: Static-site nginx change removes directory listings but keeps other attack surface

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `static-site/nginx.conf:21`; `static-site/static.nginx.conf`

**Problem:**  
`autoindex on` was changed to `autoindex off`, which is correct hardening. However, `static-site/static.nginx.conf` still lacks explicit `autoindex off;`, relying on the nginx default (which is off). If a future refactor copies the wrong template or changes the default, directory listings could return.

**Failure scenario:**  
A future deploy script switches from `nginx.conf` to `static.nginx.conf` for the static host. The `static.nginx.conf` file does not explicitly disable autoindex, and a directory without an index file begins listing its contents.

**Suggested fix:**  
Add `autoindex off;` explicitly to both `static-site/nginx.conf` and `static-site/static.nginx.conf`, and extend the deploy-security test to assert the directive in both files.

**Cross-references:**  
- `tests/unit/infra/deploy-security.test.ts:51-56` — only checks `static-site/nginx.conf`  
- `static-site/deploy.sh` — deployment script that copies the config

---

### LOW: Source-code normalizer is language-agnostic and may mis-handle whitespace-sensitive languages

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/assignments/code-similarity.ts:27-111`

**Problem:**  
`normalizeSource` collapses all whitespace (including newlines) to a single space for every language. For Python, Haskell, YAML, and other whitespace-sensitive languages, this destroys semantic structure before n-gram comparison, making the similarity score less meaningful and potentially generating false negatives for copied code that differs only in indentation.

**Failure scenario:**  
Two Python submissions are identical except that one uses 2-space indentation and the other uses 4-space indentation. After normalization, both are reduced to a single line of tokens with no indentation preserved; the Jaccard similarity may drop below the 0.85 threshold even though the code is semantically identical.

**Suggested fix:**  
Make the normalizer language-aware: preserve significant whitespace for whitespace-sensitive languages, or skip whitespace normalization for those languages. At minimum, document the limitation in `docs/languages.md` and the admin anti-cheat UI so reviewers do not treat low scores on Python/Haskell as definitive evidence of independent work.

**Cross-references:**  
- `src/lib/assignments/code-similarity-client.ts` — Rust sidecar uses the same normalization if it mirrors TS  
- `docs/languages.md` — language documentation

---

## Final Sweep

**Verified clean / low risk:**

- `src/lib/security/ip.ts` — the tightened XFF-to-X-Real-IP fallback correctly returns `null` in production when the XFF chain is shorter than `TRUSTED_PROXY_HOPS`; this closes a spoofing path.
- `src/lib/compiler/execute.ts` — moving validation before Rust-runner delegation is the correct order; local fallback remains gated by `SHOULD_ALLOW_LOCAL_FALLBACK`.
- `src/app/api/v1/contests/join/route.ts` — the recruiting-candidate guard correctly blocks access-code joins, and the code-scoped rate limit uses a SHA-256 prefix with negligible collision probability.
- `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` — the `finally`-based `clearTimeout` correctly disarms the timeout even when `runAndStoreSimilarityCheck` throws a non-abort error.
- `static-site/nginx.conf` — `autoindex off;` is present.

**Areas needing manual validation:**

- The actual nginx behavior for `POST /api/v1/files` with a 10 MiB payload after the global 50M removal should be confirmed with a real deploy or `nginx -t` against the generated config.
- The Rust similarity sidecar's normalization algorithm should be compared to the TypeScript implementation to confirm they are byte-compatible; divergence would cause inconsistent results between fallback and sidecar paths.
- The process-local cache invalidation behavior should be validated under at least two app replicas (e.g., local Docker Compose with `APP_INSTANCE_COUNT=2`) before the next horizontal-scale deployment.

---

## Priority Matrix

| # | Finding | Severity | Effort | Impact |
|---|---------|----------|--------|--------|
| 1 | nginx file-upload body-size regression | CRITICAL | Low | Breaks all uploads > 1 MiB in production |
| 2 | Inline SQL patches bypass migration journal | HIGH | Medium | Disaster-recovery journal replay incomplete |
| 3 | Process-local caches, no cross-instance invalidation | HIGH | Medium–High | Permission drift on multi-instance deploy |
| 4 | Session `maxAge` frozen at module load | HIGH | Low | Security setting changes require restart |
| 5 | `submissions.judgeWorkerId` missing FK | HIGH | Low | Dangling worker references, silent audit gaps |
| 6 | `/api/v1/judge/poll` path baked into worker binary | HIGH | Medium | Route refactor requires coordinated redeploy |
| 7 | Similarity-check authorization layering | MEDIUM | Low | Inconsistent authz across routes |
| 8 | Dual TS/Rust command validators can drift | MEDIUM | Medium | Split behavior between runner and fallback |
| 9 | Access-code failure limits accumulate | MEDIUM | Low | Lockout after transient mistypes |
| 10 | Similarity-check timeout budget | MEDIUM | Low | Misdiagnosed timeouts under query pressure |
| 11 | `minPasswordLength` dead setting | MEDIUM | Low | False security control |
| 12 | Analytics cache clock skew | MEDIUM | Low | Stale leaderboard under clock drift |
| 13 | `deploy-docker.sh` monolithic | MEDIUM | High | Deploy brittleness, poor failure isolation |
| 14 | Dev-only IP sentinel collapses rate limits | LOW | Low | Local/staging false positives |
| 15 | Static-site autoindex not explicit in both configs | LOW | Low | Future template swap risk |
| 16 | Language-agnostic similarity normalizer | LOW | Low | Reduced accuracy on whitespace-sensitive languages |
