# Deep code review — 2026-04-12 (post-remediation)

## Scope
This is a fresh **post-remediation** deep review of the current codebase after the earlier deep-review fixes landed.

Coverage was hotspot-focused across:
- realtime/SSE and anti-cheat coordination
- admin Docker management routes
- compiler execution/runtime isolation behavior
- dangerous HTML rendering surfaces
- deployment/runtime documentation consistency

This is a grounded project-wide review of the highest-risk areas, not a literal line-by-line annotation of every file.

## Overall assessment
The project is in noticeably better shape than before. The recently fixed Docker-route policy issues, runner fallback behavior, and runtime-truth plan debt are all real improvements. I did **not** find any new CRITICAL issues.

### Severity summary
- **CRITICAL:** 0
- **HIGH:** 1
- **MEDIUM:** 2
- **LOW:** 2

## Strengths
- Security-sensitive admin Docker routes are now much more consistent and better tested.
- Compiler execution now fails closed by default in runner-backed deployments.
- Review/remediation traceability is unusually strong for a project this size.
- Current docs are substantially more honest than before about scaling and runtime assumptions.

## Findings

### HIGH

#### 1. `REALTIME_COORDINATION_BACKEND` is treated as if shared coordination exists, but no shared coordination implementation is wired in
- **Files:**
  - `src/lib/realtime/realtime-coordination.ts:12-23,40-54`
  - `src/app/api/v1/submissions/[id]/events/route.ts:23-67`
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:14-16,73-79`
  - `docs/deployment.md:155-164`
- **Evidence:**
  - `getRealtimeCoordinationStatus()` marks `redis` and `postgresql` as shared backends purely from the env string.
  - `getUnsupportedRealtimeGuard()` returns `null` when that env var is set, which disables the runtime guard.
  - The affected routes still keep all realtime coordination in process-local structures (`Set`/`Map` for SSE, `LRUCache` for anti-cheat heartbeat dedupe).
  - There is no Redis/PostgreSQL coordination client or shared-state implementation referenced by these routes.
- **Risk:** a production operator can set `REALTIME_COORDINATION_BACKEND=redis` or `postgresql`, believe the deployment is now safe for multiple app instances, and silently bypass the fail-closed guard while still running with incorrect process-local coordination.
- **Recommendation:** do one of these, explicitly:
  1. implement real shared coordination and keep the current env contract, or
  2. remove `redis`/`postgresql` as “supported” values until the implementation exists, or
  3. rename the env into an explicit override/acknowledgement flag that does **not** imply shared-state support.

### MEDIUM

#### 2. The multi-instance realtime guard is still easy to bypass accidentally because it depends on manually supplied replica-count env vars
- **Files:**
  - `src/lib/realtime/realtime-coordination.ts:6-16`
  - `README.md:218-223`
  - `docs/deployment.md:155-164`
- **Evidence:**
  - `parseReplicaCount()` defaults to `1` when `APP_INSTANCE_COUNT` / `WEB_CONCURRENCY` are unset.
  - The runtime guard therefore does not trigger in a replicated deployment unless those envs are deliberately set.
  - The README scaling note still warns about single-instance assumptions, but it does not surface the runtime-guard knobs the way the deployment docs do.
- **Risk:** a horizontally scaled deployment can still run without protection if the replica-count env is missing or misconfigured.
- **Recommendation:** fail closed more conservatively in production-like environments, or require an explicit `APP_INSTANCE_COUNT=1` declaration when shared realtime coordination is absent. At minimum, document the required envs in the primary README/runtime env references, not only deployment docs.

#### 3. Failed or denied Docker image pulls are still not audit logged
- **File:** `src/app/api/v1/admin/docker/images/route.ts:70-93`
- **Evidence:**
  - successful pulls now emit `docker_image.pulled`
  - invalid or failed pull attempts return 400/500 directly with no audit event
  - sibling build/remove mutations already maintain stronger mutation traceability
- **Risk:** lower incident-response visibility for security-sensitive admin operations, especially if someone repeatedly probes or misuses image pull behavior.
- **Recommendation:** log failed and denied pull attempts with a distinct action namespace (for example `docker_image.pull_failed` / `docker_image.pull_rejected`) and include the requested image tag plus failure reason.

### LOW

#### 4. The build route still performs a synchronous filesystem existence check inside the request path
- **File:** `src/app/api/v1/admin/docker/images/build/route.ts:46-54`
- **Evidence:** `existsSync(dockerfilePath)` is still executed directly in the route handler.
- **Risk:** minor request-path sync I/O in an admin surface; not a security problem, but still avoidable.
- **Recommendation:** switch to `fs/promises.access()` or precompute/cache Dockerfile availability if this path is expected to be hit often.

#### 5. The legacy HTML rendering path remains broad and keeps a fairly permissive sanitized HTML surface alive
- **Files:**
  - `src/components/problem-description.tsx:41-48`
  - `src/lib/security/sanitize-html.ts:18-74`
- **Evidence:**
  - the renderer still routes “legacy HTML-looking” descriptions into `dangerouslySetInnerHTML`
  - allowed tags/attrs still include `div`, `span`, `table`, and `class`
  - protection is currently delegated to DOMPurify plus custom URL restrictions
- **Risk:** not an immediate vulnerability based on current code, but it keeps a broader long-term HTML policy surface than the markdown-only path and makes future review harder.
- **Recommendation:** continue shrinking this legacy path over time, or formalize a smaller supported HTML subset if old problem statements still depend on it.

## Recommendation
**RECOMMENDATION: REQUEST CHANGES**

The codebase is in good shape overall, but I would still request changes because the current realtime-scaling contract is stronger in docs/config than in actual implementation. That is the one finding I would treat as genuinely important before calling the current architecture “deep-review clean.”

## Suggested next steps
1. Fix the realtime backend contract mismatch first.
2. Tighten replica-count detection / fail-closed behavior for realtime routes.
3. Add audit logging for rejected/failed Docker pulls.
4. Optionally clean up the remaining low-severity request-path and legacy-HTML debt.
