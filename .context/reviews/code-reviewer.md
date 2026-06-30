# Code Quality & Logic Review

Date: 2026-06-30
Scope: entire repository
Summary: The cycle-1 changes harden IP extraction, move compiler input validations earlier, add scoped rate-limiting to access-code joins, and extend similarity-check authorization. The code is generally well-structured, but several logic, maintainability, and edge-case issues remain — especially around workspace cleanup in the compiler local-fallback path, abort-signal coordination with the Rust similarity sidecar, and minor validation/canonicalization gaps.
Findings count: 8

## HIGH: Compiler local-fallback workspace cannot be cleaned up after chown to sandbox uid
- **File**: `src/lib/compiler/execute.ts` (lines 724-758, 842-848)
- **Problem**: The local fallback creates a temp workspace, writes the source file, then `chown`s both the directory and the source file to `SANDBOX_UID`/`SANDBOX_GID` (65534/nobody) and narrows permissions to `0o700`/`0o600` (`src/lib/compiler/execute.ts:744-758`). The `finally` block then tries `rm(workspaceDir, { recursive: true, force: true })` (`src/lib/compiler/execute.ts:842-848`). The production Dockerfile runs the Next.js app as the `nextjs` user (uid 1001) (`Dockerfile:62-63,108`). A directory owned by uid 65534 with mode `0o700` is not traversable or removable by uid 1001, so `rm()` will throw `EACCES`, the temp directory leaks on disk, and the caught warning masks the leak.
- **Failure scenario**: In any environment where local fallback is enabled (e.g., a developer runs with `ENABLE_COMPILER_LOCAL_FALLBACK=1`, or an operator enables it during a runner-sidecar incident), every compile request leaves a `compiler-*` directory under `/tmp`/`$COMPILER_WORKSPACE_DIR`. Over time this fills the root or workspace filesystem. Because the error is only logged at warn level, the leak is not visible to operators unless they specifically monitor logs or disk usage.
- **Suggested fix**: Before attempting `rm`, re-chown the workspace back to the process uid (or a group shared with the sandbox uid) inside the `finally` block, or spawn a short-lived privileged cleanup container. A simpler short-term fix is to run `chmod -R 777` on the workspace before `rm` so the process uid can delete it, accepting the transient permission widening only for cleanup. Alternatively, gate local fallback behind a loud runtime warning that the feature leaks workspaces in non-root deployments.
- **Cross-references**: `Dockerfile:108` (USER nextjs), `src/lib/compiler/execute.test.ts` (tests runner-auth precedence but does not exercise local workspace cleanup).

## HIGH: Similarity-check Rust sidecar ignores the route's AbortSignal and swallows abort errors
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (lines 44-64), `src/lib/assignments/code-similarity.ts` (lines 319-399), `src/lib/assignments/code-similarity-client.ts` (lines 35-62)
- **Problem**: The route creates a 30-second `AbortController` and passes the signal into `runAndStoreSimilarityCheck` (`route.ts:50`). That signal is forwarded only to the TypeScript fallback path (`code-similarity.ts:390`). The Rust sidecar call in `computeSimilarityRust` uses its own hard-coded `AbortSignal.timeout(25_000)` and does not accept, compose, or propagate the caller's signal (`code-similarity-client.ts:45-54`). It also catches all exceptions and returns `null`, so an abort/timeout is indistinguishable from an unreachable service.
- **Failure scenario**: If the Rust sidecar is slow but not quite 25 seconds, or if the operator/caller wants to abort earlier, the route cannot cancel the sidecar request. The route catch block (`route.ts:51-62`) only handles `AbortError` or messages containing `"timed out"`; a Rust-sidecar timeout returns `null`, falls through to the TS fallback, and may consume the full 30 seconds without returning the explicit `timed_out` status the test expects. The dashboard will see either a generic error or stale fallback results instead of the documented `status: "timed_out"` response.
- **Suggested fix**: Add an optional `signal?: AbortSignal` parameter to `computeSimilarityRust` and compose it with the internal timeout via `AbortSignal.any` (or a manual `AbortController` that listens to both). Re-throw `AbortError` instead of returning `null` so callers can distinguish cancellation/timeouts from sidecar unavailability, and update `runSimilarityCheck` to catch and re-throw those aborts.
- **Cross-references**: `tests/unit/api/similarity-check.route.test.ts` (timeout test mocks the TS path; Rust path behavior is untested).

## MEDIUM: IPv4 validator accepts leading-zero octets, breaking canonicalization
- **File**: `src/lib/security/ip.ts` (lines 18-24)
- **Problem**: `isValidIpv4` validates each octet with `Number.isInteger(number) && number >= 0 && number <= 255` after a regex that permits one-to-three-digit octets. `Number("01")` evaluates to `1`, so addresses like `192.168.01.001` pass validation. Downstream consumers (rate-limit keys, judge IP allowlist) may therefore treat the same client as multiple distinct keys (`192.168.1.1` vs `192.168.01.001`).
- **Failure scenario**: A determined client can bypass per-IP rate limits or allowlist entries by submitting syntactically different but semantically identical IPv4 strings in `X-Forwarded-For`. Although the hop-trust logic limits spoofing, any trusted proxy that preserves the client's literal octets could surface this.
- **Suggested fix**: Reject octets with leading zeros (except the single digit `0`) in `isValidIpv4`, or normalize octets to decimal before returning. Align the change with `src/lib/judge/ip-allowlist.ts` so both call sites use the same canonical form.
- **Cross-references**: `src/lib/security/ip.test.ts` (does not cover leading-zero inputs), `src/lib/judge/ip-allowlist.ts`.

## MEDIUM: `code-similarity-client.ts` uses `console.warn` instead of the project logger
- **File**: `src/lib/assignments/code-similarity-client.ts` (line 6)
- **Problem**: The module logs a missing-auth warning with `console.warn(...)` rather than the structured `logger` used everywhere else in `src/lib`. This bypasses the configured logging transport, makes log aggregation inconsistent, and will print to stdout/stderr in tests and production in a different format than other security warnings.
- **Failure scenario**: In production, this warning is emitted at module load if `CODE_SIMILARITY_URL` is set without `CODE_SIMILARITY_AUTH_TOKEN`. It will not carry request context, timestamps, or severity metadata expected by log consumers.
- **Suggested fix**: Import `logger` from `@/lib/logger` and replace the `console.warn` call with `logger.warn(...)`.
- **Cross-references**: `src/lib/compiler/execute.ts` (uses `logger.warn` for the analogous runner-auth warning).

## MEDIUM: `parseTimestampEpochMs` does not handle Docker's nanosecond timestamps
- **File**: `src/lib/compiler/execute.ts` (lines 254-266, 277-301)
- **Problem**: The JSDoc states the helper handles `"2024-01-15T10:30:45.123456789Z"`, but it delegates to `Date.parse`, which only supports millisecond precision and may return `NaN` for nine-digit fractional seconds depending on the JS engine. When `Date.parse` returns `NaN`, `inspectContainerState` falls back to `null` for `durationMs`.
- **Failure scenario**: On Node.js versions where `Date.parse` rejects nanosecond timestamps, container inspection loses the accurate execution duration and falls back to wall-clock duration, which includes Docker setup/teardown overhead. This skews execution-time reporting and could cause near-limit submissions to be misjudged.
- **Suggested fix**: Truncate the fractional seconds to three digits before calling `Date.parse`, or use a small regex/parser that explicitly handles nanoseconds.
- **Cross-references**: `src/lib/compiler/execute.ts:485-503` (fallback to `wallDurationMs`).

## MEDIUM: `validateShellCommandStrict` rejects legitimate environment-variable prefixes
- **File**: `src/lib/compiler/execute.ts` (lines 189-251)
- **Problem**: The stricter validator splits a command on `&&` or `;` and requires each segment's first token to match an allowed compiler prefix. If a segment begins with an environment assignment such as `CC=gcc gcc ...` or `LANG=C ./a.out`, the first token is `CC=gcc`, which does not match any prefix and the whole command is rejected.
- **Failure scenario**: An admin who legitimately configures a language with an env-var prefix (e.g., to set `PATH`, `CC`, `RUSTFLAGS`, or locale) will find submissions failing with `"Invalid compile command"` or `"Invalid run command"` even though the underlying `validateShellCommand` regex would have accepted it. The Rust runner uses its own validator, so the same command may succeed via the runner but fail in local fallback, creating inconsistent behavior between the two paths.
- **Suggested fix**: Strip leading `KEY=VALUE` assignments before checking the command prefix, or move the prefix check into the Rust runner and keep the local fallback validation aligned with it. At minimum document that env-var prefixes are unsupported in local fallback.
- **Cross-references**: `src/lib/compiler/execute.test.ts` (tests metacharacter rejection but not env-var prefixes).

## LOW: Similarity-check timeout handler treats any "timed out" message as a timeout
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (lines 51-62)
- **Problem**: The catch block returns the `timed_out` envelope if `error.name === "AbortError"` OR `error.message.includes("timed out")`. The string match is broad: any downstream error whose message happens to contain the words "timed out" (e.g., a database timeout or a third-party service timeout) will be reported as a scan timeout.
- **Failure scenario**: A database query timeout inside `runAndStoreSimilarityCheck` could be surfaced to the dashboard as `status: "timed_out"`, `reason: "timeout"`, misleading an admin into thinking the similarity engine was slow rather than that the database is unhealthy.
- **Suggested fix**: Only treat `AbortError` / `DOMException` with name `"AbortError"` as the scan timeout. For other errors, let them propagate to the generic `createApiHandler` error handler (returning 500) so operators see the real failure mode.
- **Cross-references**: `src/lib/assignments/code-similarity.ts:286` (throws `DOMException("Similarity check timed out", "AbortError")`).

## LOW: Static-site nginx config lacks basic security headers
- **File**: `static-site/nginx.conf` (lines 1-23)
- **Problem**: The static-site server enables gzip and caching but does not set `server_tokens off;`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or a CSP. The recent change correctly disables `autoindex`, but the config still leaks the nginx version and leaves the static origin open to trivial clickjacking/MIME-sniffing attacks.
- **Failure scenario**: An attacker can frame the static site, exploit version-specific nginx vulnerabilities, or leverage MIME sniffing if an HTML/JS file is uploaded to the static root.
- **Suggested fix**: Add `server_tokens off;` at server scope and a default headers block: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` or `SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin`. If the site serves untrusted user content, add a restrictive CSP.
- **Cross-references**: `tests/unit/infra/deploy-security.test.ts` (checks `autoindex off` but not response headers).

## Final sweep
- **Skipped / not manually validated**: Full Rust worker review, Drizzle migration drift, all 100+ language Dockerfiles, and end-to-end runtime behavior of the similarity sidecar. The findings above were derived from static inspection of `src/`, tests, Docker config, and deployment scripts.
- **Items needing manual validation**:
  1. Confirm whether `fs.rm` fails with `EACCES` on a `0o700` directory owned by uid 65534 when the process runs as uid 1001 (compiler workspace cleanup).
  2. Verify whether `Date.parse("2024-01-15T10:30:45.123456789Z")` returns a number or `NaN` on the deployed Node.js 24 runtime.
  3. Exercise the similarity-check route against a slow/stuck Rust sidecar to confirm the `timed_out` status is returned or document the fallback behavior.
  4. Check whether any existing `language_configs` rows use env-var prefixes that would be rejected by the new `validateShellCommandStrict` in local fallback.
- **Commonly missed issues checked**: race conditions (access-code redemption is wrapped in a transaction; rate-limit consumption is not atomic with redemption, which is acceptable), auth bypasses (no obvious bypass in reviewed routes), injection (raw SQL in similarity check is parameterized), secret leakage (no hardcoded secrets found in reviewed files), disabled tests (none noted), stale TODOs (only template stubs and one Next.js upstream workaround remain).
