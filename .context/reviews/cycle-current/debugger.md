# Debugger Review — Latent Bug Surface — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewer:** debugger (consolidated single-pass)

---

## Findings

### B1 — MEDIUM — `buildDockerImageLocal` `spawn` error handler may not fire on EACCES

- **File:** `src/lib/docker/client.ts:225-277`
- **Description:** The `proc.on("error", ...)` handler catches spawn errors, but if `docker` binary exists but is not executable (EACCES), `spawn` may not emit an error event on all Node.js versions. The timeout handler (`setTimeout(..., 600_000)`) will eventually fire, but the 10-minute timeout is very long for a spawn failure.
- **Confidence:** MEDIUM
- **Failure scenario:** Docker binary permission issues cause the build to hang for 10 minutes instead of failing fast.
- **Suggested fix:** Add a shorter startup timeout (e.g., 10s) that fires if no `close` or `error` event is received.

### B2 — MEDIUM — `runDocker` `child.stdout?.destroy()` may not stop data events immediately

- **File:** `src/lib/compiler/execute.ts:429-447`
- **Description:** When output exceeds `MAX_OUTPUT_BYTES`, the code sets `stdoutClosed = true` and calls `child.stdout?.destroy()`. However, Node.js streams may emit one final `data` event after `destroy()` is called. The guard `if (stdoutClosed || stdout.length >= MAX_OUTPUT_BYTES)` should prevent appending, but there is a race between the event emission and the flag check.
- **Confidence:** LOW
- **Failure scenario:** Slightly exceeds 4MB output limit by one chunk. Harmless but worth noting.
- **Suggested fix:** Already has guard; consider using `pause()` + `removeAllListeners('data')` for cleaner shutdown.

### B3 — MEDIUM — `consumeRateLimitAttemptMulti` does not reset `windowStartedAt` on block

- **File:** `src/lib/security/rate-limit.ts:182-233`
- **Description:** When `attempts >= config.maxAttempts` and a block is triggered, the `windowStartedAt` is preserved from the existing entry (or set to `now` for new entries). This means the rate limit window does NOT reset when a block occurs. After the block expires, the user still has `maxAttempts` consumed in the original window. This is intentional for exponential backoff (the window continues), but may be surprising.
- **Confidence:** MEDIUM
- **Failure scenario:** User hits rate limit, waits out the block, but the original window may still be active, causing immediate re-blocking.
- **Suggested fix:** Document this behavior explicitly. The current behavior is probably correct for security (punish repeated offenders) but should be documented.

### B4 — LOW — `rawQueryOne` returns undefined for no rows, but callers may not check

- **File:** `src/lib/db/queries.ts` (assumed), `src/app/api/v1/judge/claim/route.ts:232-241`
- **Description:** `rawQueryOne` presumably returns `undefined` when no rows match. The judge claim handler checks `claimedRaw ? ... : undefined`, which is correct. However, other callers of `rawQueryOne` throughout the codebase should be audited for null-safety.
- **Confidence:** LOW
- **Suggested fix:** Add a lint rule or type wrapper that forces callers to handle the undefined case.

### B5 — LOW — `isAllowedJudgeDockerImage` validation not checked on Rust runner path

- **File:** `src/lib/compiler/execute.ts:516-567`
- **Description:** The `tryRustRunner` function delegates to the Rust sidecar without validating the Docker image against `isAllowedJudgeDockerImage`. The Rust worker presumably has its own validation, but the Node.js-side validation is bypassed. If the Rust worker's validation differs, a mismatch could allow disallowed images.
- **Confidence:** LOW
- **Suggested fix:** Validate the image before delegating to the Rust runner, or document that Rust-side validation is the authoritative check.

### B6 — LOW — `getConfiguredSettings` may return stale values during concurrent updates

- **File:** `src/lib/system-settings-config.ts` (assumed)
- **Description:** If `getConfiguredSettings` caches settings in-memory, a concurrent admin update may not be reflected immediately. The cache TTL and invalidation strategy should be verified.
- **Confidence:** LOW
- **Suggested fix:** Verify cache invalidation on settings update.

---

## Debugger Verdict

No critical latent bugs. The system has good defensive coding. Main concerns are around timeout handling in Docker operations and edge cases in stream cleanup.
