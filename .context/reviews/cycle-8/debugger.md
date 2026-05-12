# Debugger Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** debugger

---

## Findings

### D1 — LOW — `submissionSubscribers` Map may leak on abrupt disconnect

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:179-209`
- **Description:** The `submissionSubscribers` Map stores callback sets per submission ID. Subscribers are removed via the `abort` signal listener and the `close()` function. However, in edge cases like TCP partition without FIN/RST, the abort signal may not fire, leaving the callback in the Map indefinitely. The Map size is bounded by `MAX_GLOBAL_SSE_CONNECTIONS` (500), so this is a bounded leak.
- **Confidence:** MEDIUM
- **Suggested fix:** Add a periodic sweep in the cleanup timer that removes callbacks whose associated connection is no longer in `activeConnectionSet` or `connectionInfoMap`.

### D2 — LOW — `node-shutdown.ts` SIGTERM handler may terminate in-flight requests

- **File:** `src/lib/audit/node-shutdown.ts:37-43`
- **Description:** The SIGTERM handler calls `processLike.exit(0)` after flushing the audit buffer. This forces immediate process termination, potentially dropping in-flight HTTP requests that have not yet completed. In containerized environments, the orchestrator typically sends SIGTERM and waits for a grace period before sending SIGKILL.
- **Confidence:** LOW
- **Suggested fix:** Remove the explicit `process.exit(0)` call from the SIGTERM handler and let Node.js exit naturally once the event loop drains.

### D3 — LOW — `cleanupContainer` timeout is short for busy Docker daemon

- **File:** `src/lib/compiler/execute.ts:300-306`
- **Description:** `cleanupContainer` uses a 5-second timeout for `docker rm -f`. If the Docker daemon is under heavy load (e.g., during a burst of concurrent compilations), the removal may fail and log a warning, leaving a dangling container.
- **Confidence:** LOW
- **Suggested fix:** Increase timeout to 15 seconds or add a retry loop.
