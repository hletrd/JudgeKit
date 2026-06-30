# Critic Review — Cycle 1 / Cycle 3 hardening

Date: 2026-06-30  
Scope: entire repository, with emphasis on cycle-3 nginx/env hardening changes and their interaction with the broader codebase  
Summary: The cycle-3 remediation correctly addresses the listed aggregate findings (HTTP/2 syntax, env-profile permissions, IP fallback, contest join rate limiting, similarity-check TA authz, static-site autoindex). However, the implementation of A3 (nginx body limits) over-scopes the reduction and appears to break legitimate file uploads, and the implementation of A6 (compiler validation before Rust runner) exposes a latent bug in `validateShellCommandStrict` that now rejects all compiled-language run commands in production compiler-run/playground paths. Several other fixes are under-tested or leave related routes unexamined.  
Findings count: 10

## HIGH: A6 fix exposes `validateShellCommandStrict` rejecting all compiled-language run commands
- **File**: `src/lib/compiler/execute.ts` (lines 243-251, 664-688)
- **Problem**: The A6 fix moved Docker-image, source-size, and shell-command validation before `tryRustRunner`. The command validator is `validateShellCommandStrict`, which rejects any command whose first basename is not in the hardcoded `ALLOWED_COMMAND_PREFIXES`. Compiled-language run commands are stored as bare binary paths such as `'/workspace/solution'` (basename `solution`), which is not in the prefix list. Interpreted-language commands like `python3 ...` pass, but C/C++/Rust/Go/etc. run commands fail.
- **Failure scenario**: In production, `COMPILER_RUNNER_URL` is configured and `/api/v1/compiler/run` (and `/api/v1/playground/run`) now validate before delegating. A student using the in-app compiler for a compiled language receives `stderr: "Invalid run command"` and the Rust runner is never called. Before A6 this validation ran only in the local-fallback path, so the regression is a direct consequence of the otherwise-correct fix.
- **Suggested fix**: Do not use `validateShellCommandStrict` for the shared pre-runner validation. Use only `validateShellCommand` (shell-metacharacter denylist), which matches the Rust runner's `validate_shell_command`. Keep the stricter prefix check, if desired, only on the local-fallback path where it was originally enforced.
- **Cross-references**: `src/lib/judge/languages.ts:208` (`runCommand: ["/workspace/solution"]`), `src/lib/compiler/execute.test.ts:111-130` (only tests interpreted-language rejection), `judge-worker-rs/src/runner.rs:124-176` (no prefix check)

## HIGH: A3 nginx body-limit reduction breaks file uploads larger than 1 MB
- **File**: `scripts/online-judge.nginx.conf` (lines 92-93), `deploy-docker.sh` (generated `location /` block, ~line 1574-1575)
- **Problem**: The A3 fix removed the broad `client_max_body_size 50M;` from server blocks and left the catch-all `location /` at `client_max_body_size 1m;`. There is no dedicated location for `/api/v1/files`, `/api/v1/problems/import`, or other upload endpoints. This directly conflicts with `uploadMaxFileSizeBytes`, whose default is 50 MB.
- **Failure scenario**: An admin uploading a 5 MB attachment, or importing a problem with a 3 MB ZIP, is rejected by nginx with HTTP 413 before the application ever sees the request. The app-level validators and settings become dead code for any upload > 1 MB.
- **Suggested fix**: Add explicit `location` blocks for upload endpoints (`/api/v1/files`, `/api/v1/problems/import`, etc.) with `client_max_body_size 50M;`, or raise the catch-all to a safe intermediate value (e.g., 10m) and only narrow it where request size must be small. Add an infra test that asserts upload routes are not capped at 1m.
- **Cross-references**: `src/lib/system-settings-config.ts:61` (`uploadMaxFileSizeBytes: 50 * 1024 * 1024`), `src/lib/validators/files.ts`, `tests/unit/infra/judge-report-nginx.test.ts`

## MEDIUM: Contest join code-scoped rate limit uses the wrong abstraction and shares global config
- **File**: `src/app/api/v1/contests/join/route.ts` (lines 29-36), `src/lib/security/api-rate-limit.ts` (lines 198-222)
- **Problem**: The A8 fix consumes two limits on a failed join: a per-user limit and a per-code limit. The per-code limit reuses `consumeUserApiRateLimit` with a synthetic `code:<sha256>` "scope". That function is documented for "an authenticated user id, an `ip:<ip>` string, an `auth:<hash>` fallback, or a workerId" and keys the bucket with `:user:` infix. The code-scoped bucket therefore shares the same `apiRateLimitMax` / `apiRateLimitWindowMs` as every other API limit. Because the user limit is checked first, the code limit is never incremented once the per-user bucket is exhausted.
- **Failure scenario**: A distributed attacker with many accounts or IPs can brute-force many different codes. Each failed attempt consumes only the per-user budget, so the shared per-code budget provides little extra protection across distributed actors. The naming also misleads future maintainers into thinking the scope is always a user identity.
- **Suggested fix**: Introduce a dedicated `consumeScopedRateLimit(scope, endpoint)` helper (or reuse `consumeApiRateLimit` with a code-derived endpoint key) that does not carry the `:user:` infix and can have its own max/window config tuned for code brute-force protection.
- **Cross-references**: `src/lib/security/api-rate-limit.ts:156-179` (`consumeApiRateLimit`), `tests/unit/api/contests.route.test.ts:300-328`

## MEDIUM: A9 TA/instructor capability validation is incomplete; related routes remain unexamined
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (lines 12-24), `src/app/api/v1/contests/[assignmentId]/announcements/route.ts` (line 19), `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts` (line 19)
- **Problem**: The A9 plan explicitly listed similarity, announcements, clarifications, and exam-session extension as routes to validate for TA/instructor capability mismatch. Only similarity-check was changed to allow TAs with `anti_cheat.run_similarity` via `canRunSimilarityCheck`. Announcements and clarifications still gate management actions behind `canManageContest`, which excludes TAs. The plan's "Rejected / Not-New Register" does not record that these other routes were validated and intentionally left unchanged.
- **Failure scenario**: If the original reviewer claim was correct that TAs should be able to post announcements or answer clarifications for their assigned groups, the fix is incomplete. If the claim was disproven, the plan lacks the evidence required by its own acceptance criteria, leaving future readers to guess whether the routes were reviewed.
- **Suggested fix**: Either (a) extend the same TA-with-capability pattern to announcements/clarifications management actions where policy intends TAs to help, or (b) add an explicit plan note documenting why `canManageContest` is the correct gate for each of those routes and citing the capability defaults.
- **Cross-references**: `src/lib/assignments/contests.ts:237-251` (`canMonitorContest`), `src/lib/capabilities/defaults.ts:30-31,74-75` (`anti_cheat.run_similarity`), `plan/cycle-3-2026-06-30-nginx-env-hardening.md` A9

## MEDIUM: Claim of identical TS/Rust validator contract is false
- **File**: `src/lib/compiler/execute.ts` (lines 664-666), `judge-worker-rs/src/runner.rs` (lines 124-176)
- **Problem**: The comment at `execute.ts:664-666` states that pre-runner validation "keeps the API contract identical between runner and local fallback modes." The Rust runner's `validate_shell_command` only denies shell metacharacters, command substitution, variable expansion, and the words `eval`/`source`. The TypeScript path also runs `validateShellCommandStrict`, which adds a hardcoded allowed-prefix check. The two validators therefore accept different command sets.
- **Failure scenario**: A command that is safe and accepted by the Rust runner (e.g., a compiled-language binary path, `ocamlfind`, `beef`, `deno`) is rejected by the TypeScript path. The comment becomes false documentation and the "identical contract" guarantee is violated.
- **Suggested fix**: Remove `validateShellCommandStrict` from the shared pre-runner validation so the TypeScript and Rust validators are truly in lock-step, as the comment claims. Keep the prefix check only for local fallback if it is still considered valuable there.
- **Cross-references**: `src/lib/compiler/execute.ts:177-251` (`validateShellCommand` / `validateShellCommandStrict`), `judge-worker-rs/src/runner.rs:160-161` ("Kept in lock-step with src/lib/compiler/execute.ts#validateShellCommand")

## MEDIUM: Dev-only `0.0.0.0` IP sentinel may be treated as a real address
- **File**: `src/lib/security/ip.ts` (line 130)
- **Problem**: `extractClientIp` returns `"0.0.0.0"` in non-production when no proxy header is present. The inline comment says `isJudgeIpAllowed` special-cases this sentinel, but other consumers such as rate-limit key derivation may not. The sentinel is indistinguishable from a literal `0.0.0.0` address and is returned from a function whose contract is "client IP or null".
- **Failure scenario**: In a dev/staging environment without a reverse proxy, all requests share the rate-limit key `0.0.0.0`, making per-IP rate-limit testing meaningless. A future consumer that does not know about the sentinel may write it to audit logs or allowlists as if it were a real client.
- **Suggested fix**: Return `null` consistently and let callers decide how to degrade. Update tests and any callers that relied on the sentinel.
- **Cross-references**: `src/lib/security/rate-limit.ts`, `src/lib/judge/ip-allowlist.ts`, `tests/unit/security/ip.test.ts:76-77`

## LOW: Similarity-check timeout returns HTTP 200 for a failed/timed-out operation
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (lines 48-65)
- **Problem**: The route aborts `runAndStoreSimilarityCheck` after 30 seconds and, on `AbortError` or a "timed out" message, returns `apiSuccess({ status: "timed_out", ... })` with HTTP 200.
- **Failure scenario**: API clients or UI code that treat HTTP 200 as "operation completed successfully" may cache or display the empty `pairs` list as a real result. A long-running similarity check that genuinely times out is semantically closer to a service timeout than a successful response.
- **Suggested fix**: Return HTTP 202 Accepted if the check is accepted for async processing, or HTTP 504 Gateway Timeout if the synchronous call could not finish in time. Keep the body payload for backward compatibility if needed.
- **Cross-references**: `tests/unit/api/similarity-check.route.test.ts:150-165` (expects 200)

## LOW: Compiler and submission source-size limits are inconsistent
- **File**: `src/lib/compiler/execute.ts` (line 19), `src/app/api/v1/compiler/run/route.ts` (lines 19-27), `src/lib/system-settings-config.ts` (line 51)
- **Problem**: `execute.ts` and the compiler route cap source code at 64 KB (`MAX_SOURCE_CODE_BYTES`), while the system setting `maxSourceCodeSizeBytes` defaults to 256 KB and submissions use `MAX_SOURCE_CODE_SIZE_BYTES` (also 256 KB). The compiler route even re-implements its own 64 KB Zod check.
- **Failure scenario**: A user can submit 200 KB of source code to a problem, but the same code fails in the interactive compiler or playground with "Source code exceeds maximum size limit (64KB)". This is confusing and makes the compiler an unreliable preview of actual judging.
- **Suggested fix**: Drive both paths from the configured `maxSourceCodeSizeBytes` setting, or at least align the compiler path with the submission limit.
- **Cross-references**: `src/lib/security/constants.ts:26`, `src/app/api/v1/playground/run/route.ts`

## LOW: Documentation contradicts itself on seccomp default policy
- **File**: `AGENTS.md` (lines 298-300), `.context/project/current-state.md` (lines 180-181)
- **Problem**: `AGENTS.md` describes the seccomp profile as using a "default-deny allow-list approach — default action is `SCMP_ACT_ERRNO`." `current-state.md` describes it as a "deny-list approach (default allow, block dangerous syscalls like mount/ptrace/bpf)." These are opposite policies.
- **Failure scenario**: An operator or reviewer reading the docs cannot tell whether the seccomp baseline is permissive-with-denials or restrictive-with-allowances. This undermines security review and incident response.
- **Suggested fix**: Reconcile the docs. Inspect `docker/seccomp-profile.json` to determine the actual policy and update the stale file (`current-state.md` is dated 2026-05-24). Remove or correct the inaccurate description.
- **Cross-references**: `docker/seccomp-profile.json`

## LOW: Static-site nginx still lacks TLS and security headers
- **File**: `static-site/nginx.conf`
- **Problem**: After disabling directory listings (A5), the static-site config still listens only on port 80, sets `server_name localhost`, and does not include HSTS, `X-Frame-Options`, `X-Content-Type-Options`, CSP, or a referrer policy.
- **Failure scenario**: If the static site is ever exposed directly (misconfigured DNS, direct IP access, testing), it runs without TLS and without clickjacking/mimetype protections. This is defense-in-depth, but the config should not rely on always being behind the main reverse proxy.
- **Suggested fix**: Add the same security headers used in `scripts/online-judge.nginx.conf`. Consider redirecting HTTP to HTTPS and documenting that the static site should be served behind the main TLS terminator.
- **Cross-references**: `scripts/online-judge.nginx.conf` (lines 50-54), `static-site/deploy.sh`

## Final sweep
- **Confirmed implemented and safe**: A1 (HTTP/2 syntax), A2 (env-profile chmod-before-source), A4 (Worv test guard), A5 (autoindex off), A7 (X-Real-IP fallback), A8 basic mechanism (per-user + per-code limits exist).
- **Needs manual validation**: A3 in a real deploy — attempt a > 1 MB file upload and a problem import to confirm nginx 413 before declaring the cycle healthy. A6 against an actual Rust runner — run compiler/playground for `cpp23`, `rust`, `go`, `ocaml`, `brainfuck`, and `deno` to confirm they are not rejected by `validateShellCommandStrict`.
- **Skipped areas**: No deep review of the 125-language table for full consistency with Rust configs, no runtime UI/a11y verification (designer noted local DB blocked browser execution), no performance load testing of the new similarity-check TA path or the extra rate-limit DB writes.
- **Commonly missed issues checked**: no obvious race conditions in the new code; no SQL injection; no secret leakage in the diff; no disabled tests; no `TODO`/`FIXME` introduced. The largest residual risks are the validator false-positives and the nginx upload regression noted above.
