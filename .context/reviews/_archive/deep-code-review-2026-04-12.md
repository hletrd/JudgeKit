# Deep code review — 2026-04-12

## Scope
Project-wide hotspot review across:
- Next.js API/auth/proxy routes
- admin Docker management flows
- judge execution/runtime code
- contest SSE / anti-cheat paths
- backup/import/export/admin safety flows
- Rust sidecars and supporting scripts

This was a **deep, project-wide, hotspot-focused review**, not a literal line-by-line annotation of every file.

## Overall assessment
The repository is in materially better shape than a typical large app codebase: the recent remediation work left a strong trail of targeted tests, explicit plan artifacts, and improved capability-based authorization. I did **not** find any new CRITICAL issues.

### Severity summary
- **CRITICAL:** 0
- **HIGH:** 1
- **MEDIUM:** 3
- **LOW:** 2

## Strengths
- Strong recent hardening around authz, race conditions, and review-plan traceability.
- Good targeted unit coverage around historically risky surfaces.
- Honest deployment docs around PostgreSQL runtime and single-instance SSE/anti-cheat assumptions.
- Better-than-average separation between app, judge worker, and Docker control plane.

## Findings

### HIGH

#### 1. Admin Docker pull/remove routes still bypass the stricter trusted-registry allowlist
- **Files:** `src/app/api/v1/admin/docker/images/route.ts:66-103`, `src/lib/judge/docker-image-validation.ts:6-36`
- **Evidence:**
  - `POST` and `DELETE` currently allow any image that either starts with `judge-` **or merely contains** `/judge-`.
  - The shared helper `isAllowedJudgeDockerImage()` is stricter: it only allows local `judge-*` images or trusted-registry-prefixed `judge-*` images.
  - Example that would currently pass route validation but should not be accepted unless explicitly trusted: `evil.example.com/team/judge-python:latest`.
- **Risk:** supply-chain / administrative misuse risk; route policy is weaker than the repo’s intended image-trust model.
- **Recommendation:** replace the ad hoc `startsWith/includes` checks with `isAllowedJudgeDockerImage()` in both pull and remove flows, and keep one source of truth for image validation.

### MEDIUM

#### 2. Docker image pulls are not audit logged even though the sibling admin mutations are
- **File:** `src/app/api/v1/admin/docker/images/route.ts:66-84`
- **Evidence:**
  - `DELETE` logs `docker_image.removed`.
  - build/prune paths also audit.
  - `POST` pull returns success without any `recordAuditEvent()` call.
- **Risk:** incident response and administrative traceability gap on a security-relevant mutation.
- **Recommendation:** add an audit event for successful pulls (and optionally failed pulls if you want parity with build failures).

#### 3. SSE connection caps and anti-cheat heartbeat dedupe still rely on process-local memory, with documentation as the only safeguard
- **Files:**
  - `src/app/api/v1/submissions/[id]/events/route.ts:23-75`
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:14-15,73-79`
  - `docs/deployment.md:155-160`
- **Evidence:**
  - SSE connection tracking uses in-process `Set` / `Map` state.
  - anti-cheat heartbeat dedupe uses an in-process `LRUCache`.
  - deployment docs correctly say the web app is expected to run as a single instance.
- **Risk:** accidental multi-replica deployment silently breaks global/per-user SSE caps and anti-cheat dedupe semantics.
- **Recommendation:** either move these counters/dedup keys to shared state (Redis/PostgreSQL) or add a runtime warning / fail-fast when the app is configured in a replicated topology without shared coordination.

#### 4. Compiler runner fallback still defaults to local execution if the runner is unavailable
- **Files:**
  - `src/lib/compiler/execute.ts:375-439`
  - `README.md:227-229`
  - `docker-compose.production.yml:88-89`
- **Evidence:**
  - The code falls back to local Docker execution unless `DISABLE_COMPILER_LOCAL_FALLBACK` is set.
  - The shipped production compose explicitly sets `DISABLE_COMPILER_LOCAL_FALLBACK=1`, which implies the safer behavior is environment-dependent rather than code-default.
- **Risk:** non-standard deployments can silently drift from the intended architecture and attempt local Docker execution from the app process.
- **Recommendation:** invert the default when `COMPILER_RUNNER_URL` is configured: make local fallback opt-in for development rather than opt-out for production-like environments.

### LOW

#### 5. The admin Docker build route still mixes “trusted remote image” validation with “local Dockerfile build” assumptions
- **Files:** `src/app/api/v1/admin/docker/images/build/route.ts:33-45`, `src/lib/judge/docker-image-validation.ts:6-36`
- **Evidence:**
  - The route now uses `isAllowedJudgeDockerImage()`.
  - That helper can allow trusted-registry image names.
  - But the build route derives a local Dockerfile path directly from `langConfig.dockerImage`, e.g. `docker/Dockerfile.${imageName}`.
  - For a trusted remote tag like `registry.example.com/team/judge-rust:1.0`, the derived path becomes a nested local path that is not a meaningful local build target.
- **Risk:** inconsistent semantics and confusing operator UX.
- **Recommendation:** split the concepts explicitly:
  - **build** should accept only local `judge-*` image names that map to a local Dockerfile
  - **pull** should handle trusted remote registry tags

#### 6. The compiler hot path still performs a synchronous seccomp-profile existence check per run
- **File:** `src/lib/compiler/execute.ts:236-243`
- **Evidence:** `runDocker()` calls `existsSync(SECCOMP_PROFILE_PATH)` inside the request/judge execution path.
- **Risk:** minor but unnecessary sync filesystem work on a high-frequency path.
- **Recommendation:** resolve this once at module initialization (or cache it) instead of doing a sync stat per run.

## Recommendation
**RECOMMENDATION: REQUEST CHANGES**

The project is in good shape overall, but I would not sign off on a “deep review passed” label without at least fixing the Docker image route validation mismatch. The other issues are mostly architectural or observability hardening, not immediate release blockers.

## Suggested next steps
1. **Fix first:** unify `POST`/`DELETE` Docker image validation with `isAllowedJudgeDockerImage()`.
2. Add audit logging for image pulls.
3. Decide whether SSE / anti-cheat should stay documentation-constrained or move to shared coordination.
4. Make compiler local fallback opt-in when a runner URL is configured.
5. Clean up the remaining low-severity route/hot-path inconsistencies.
