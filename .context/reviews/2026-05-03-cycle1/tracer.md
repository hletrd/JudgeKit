# Tracer Review — Cycle 1 (2026-05-03)

**Reviewer:** tracer
**Scope:** Causal tracing of suspicious flows, competing hypotheses
**HEAD:** 689cf61d

---

## Traced Flow: Docker Build Authorization Path

### Hypothesis: An admin API user can build non-judge Docker images through the remote worker path.

**Trace:**
1. Admin user sends POST to `/api/v1/admin/docker/images/build` with `dockerfilePath: "docker/Dockerfile.code-similarity"`
2. Route handler calls `buildDockerImage(imageName, dockerfilePath)`
3. At `docker/client.ts:349`, the check is `dockerfilePath.startsWith("docker/Dockerfile.")` — passes
4. At `docker/client.ts:352`, the traversal check `/\.\.|[/\\]/.test(dockerfilePath.slice("docker/Dockerfile.".length))` — `code-similarity` has no traversal, passes
5. Request goes to worker via `callWorkerJson("/docker/build", ...)`
6. Worker receives the build request and executes `docker build -f docker/Dockerfile.code-similarity`

**Verdict:** CONFIRMED. The remote path allows building non-judge images. The local path (line 159) would reject this because it requires the `judge-` infix. The competing hypothesis that the worker has its own validation was not confirmed — the Rust worker's validation (referenced in comment at line 160) checks for the `judge-` infix, but this is the app-side validation that is inconsistent.

**Fix:** Align the app-side remote validation to match the local path's `docker/Dockerfile.judge-` prefix.

## Traced Flow: RUNNER_AUTH_TOKEN Fallback

### Hypothesis: If JUDGE_AUTH_TOKEN is set but RUNNER_AUTH_TOKEN is not, docker API calls use the judge token.

**Trace:**
1. Module loads, `RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || process.env.JUDGE_AUTH_TOKEN || ""`
2. If only `JUDGE_AUTH_TOKEN` is set, `RUNNER_AUTH_TOKEN` gets the judge token value
3. `USE_WORKER_DOCKER_API = Boolean(JUDGE_WORKER_URL && RUNNER_AUTH_TOKEN)` — true
4. `callWorkerJson()` sends `Authorization: Bearer ${RUNNER_AUTH_TOKEN}` — uses the judge token

**Verdict:** CONFIRMED. The fallback means a single secret grants access to both the judge submission API and the Docker management API on the worker. If the judge token is compromised, the attacker also gains docker management access.

**Fix:** Remove the fallback. Require `RUNNER_AUTH_TOKEN` explicitly for docker operations.
