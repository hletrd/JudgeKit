# Implementation plan — `.context/reviews/deep-code-review-2026-04-12.md`

## Source review status
This plan is newly created from the deep whole-project review dated 2026-04-12.

## Planning scope
This document addresses all issues listed in:
- `.context/reviews/deep-code-review-2026-04-12.md`

**Planning-only note:** this artifact defines the remediation strategy and verification shape. It does **not** implement the fixes.

## Findings covered by this plan
1. Admin Docker pull/remove routes bypass the stricter trusted-registry allowlist.
2. Docker image pulls are not audit logged.
3. SSE connection caps and anti-cheat heartbeat dedupe rely on process-local memory only.
4. Compiler runner fallback still defaults to local execution when the runner is unavailable.
5. Admin Docker build mixes trusted-registry validation with local-Dockerfile assumptions.
6. Compiler hot path still performs a synchronous seccomp-profile existence check per run.

## Execution order
1. **Docker admin route hardening** — highest immediate security/correctness risk.
2. **Runner fallback policy tightening** — architecture and isolation correctness.
3. **SSE / anti-cheat shared-state hardening** — correctness under scale.
4. **Hot-path cleanup** — low-risk performance/maintainability cleanup.

## Phase 0 — Revalidate before changing code
Before implementation, re-check the exact source locations cited in the review:
- `src/app/api/v1/admin/docker/images/route.ts`
- `src/app/api/v1/admin/docker/images/build/route.ts`
- `src/lib/judge/docker-image-validation.ts`
- `src/lib/compiler/execute.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `README.md`, `docs/deployment.md`, `docs/judge-workers.md`

If any finding has already changed, update this plan before implementation.

## Phase 1 — Docker admin route policy unification
### Track 1A — Use one image-allowlist policy for build/pull/remove
**Severity:** HIGH

**Files**
- `src/app/api/v1/admin/docker/images/route.ts`
- `src/app/api/v1/admin/docker/images/build/route.ts`
- `src/lib/judge/docker-image-validation.ts`
- relevant unit tests under `tests/unit/api/`

**Plan**
- replace the ad hoc `startsWith("judge-") || includes("/judge-")` checks in Docker pull/remove with `isAllowedJudgeDockerImage()`
- keep build/pull/remove semantics explicit:
  - **build**: local `judge-*` images that map to local Dockerfiles only
  - **pull/remove**: local `judge-*` images or trusted-registry `judge-*` images
- reject untrusted registry-qualified `judge-*` tags uniformly across all admin Docker mutation routes
- ensure route error messages stay operator-friendly and deterministic
- **Status:** completed at `HEAD` on 2026-04-12 — pull/remove now use the shared allowlist, and build rejects registry-qualified images in favor of local-only Dockerfile builds.

**Tests**
- pull route rejects untrusted registry-qualified `judge-*` tags
- remove route rejects untrusted registry-qualified `judge-*` tags
- build route rejects trusted-registry tags when they do not map to a valid local build target
- existing allowlist helper tests remain green

### Track 1B — Audit log all Docker mutations consistently
**Severity:** MEDIUM

**Files**
- `src/app/api/v1/admin/docker/images/route.ts`
- tests for Docker admin routes

**Plan**
- add audit logging for successful image pulls
- decide whether failed pulls should emit audit events too for parity with build failures
- keep event naming aligned with the existing `docker_image.*` audit namespace
- **Status:** completed at `HEAD` on 2026-04-12 — successful pulls now emit `docker_image.pulled` audit events.

**Tests**
- successful pull emits an audit event
- failed pull behavior is asserted according to the chosen policy

### Track 1C — Clarify build-vs-pull operator contract
**Severity:** LOW

**Files**
- `src/app/api/v1/admin/docker/images/build/route.ts`
- admin language/image UI if needed
- `docs/deployment.md` or admin docs if needed

**Plan**
- make route behavior explicit that building is for local Dockerfiles only
- avoid deriving ambiguous local Dockerfile paths from registry-qualified image names
- if necessary, surface a clearer validation error when a registry-qualified image is configured for a build-only action
- **Status:** completed at `HEAD` on 2026-04-12 — the build route now returns a dedicated local-only validation error before Dockerfile lookup.

**Tests**
- route returns a targeted validation error for non-buildable registry-qualified image refs
- docs/UI tests only if text or labels change

## Phase 2 — Compiler runner architecture enforcement
### Track 2A — Make local fallback opt-in when a runner URL is configured
**Severity:** MEDIUM

**Files**
- `src/lib/compiler/execute.ts`
- `docker-compose.production.yml`
- `README.md`
- any tests around compiler execution behavior

**Plan**
- invert the effective default so that when `COMPILER_RUNNER_URL` is set, local Docker fallback is disabled unless explicitly enabled for development
- preserve a clear development escape hatch for local fallback
- keep current production behavior unchanged or stricter
- align docs/env comments with the new default
- **Status:** completed at `HEAD` on 2026-04-12 — runner-configured environments now disable local fallback by default, with explicit opt-in for development.

**Tests**
- execution returns a controlled “runner unavailable” result when runner URL is configured and fallback is not explicitly enabled
- development-mode or explicit opt-in fallback path still works as intended
- deployment docs/config assertions remain aligned

### Track 2B — Remove sync seccomp existence checks from the hot path
**Severity:** LOW

**Files**
- `src/lib/compiler/execute.ts`
- unit tests for compiler runtime implementation if present

**Plan**
- resolve/calculate seccomp profile availability once at module init or cache it behind a lazy singleton
- preserve the current warning behavior when the profile is absent
- keep fallback semantics unchanged
- **Status:** completed at `HEAD` on 2026-04-12 — seccomp profile availability is now cached outside the per-run hot path, and missing-profile warnings are emitted only once per process.

**Tests**
- implementation guard proving the seccomp path is not checked synchronously per run
- no regression in missing-profile warning behavior

## Phase 3 — Multi-instance correctness for SSE and anti-cheat
### Track 3A — Choose a supported scaling model
**Severity:** MEDIUM

**Files**
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `docs/deployment.md`
- `docs/judge-workers.md`
- possibly config/system-settings surfaces

**Decision required before implementation**
Pick one of these explicit strategies:
1. **Shared-state hardening** — move connection/dedupe coordination to Redis/PostgreSQL.
2. **Runtime guardrail** — add startup/runtime detection that warns or fails in unsupported replicated deployments.
3. **Sticky-session strategy** — explicitly codify and validate a supported affinity model, with enforcement/documentation.

**Plan**
- do not leave this as docs-only if the product is expected to scale horizontally at the web tier
- if shared state is chosen:
  - move SSE cap counters and anti-cheat heartbeat dedupe keys out of process memory
  - define TTL/cleanup semantics and failure behavior
- if runtime guard is chosen:
  - add an explicit startup warning/fail-fast path tied to deployment config
  - document exactly what is unsupported and why

**Tests**
- implementation guard proving the chosen coordination model is present
- if shared-state backed: unit/integration tests for dedupe and connection counting semantics
- if runtime guard only: tests for emitted warning/fail-fast conditions

## Acceptance criteria
- Docker build/pull/remove routes all use a single, documented trust model for image references.
- Untrusted registry-qualified `judge-*` tags are rejected uniformly.
- Successful image pulls are audit logged.
- Build-only actions no longer treat trusted remote image names as local Dockerfile targets.
- Compiler execution no longer silently falls back to local Docker in runner-configured environments unless explicitly allowed.
- Compiler hot path no longer performs synchronous seccomp existence checks per run.
- SSE / anti-cheat multi-instance behavior is either shared-state coordinated or explicitly enforced as unsupported at runtime.

## Verification targets
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for Docker admin routes
- targeted Vitest suites for compiler execution/runtime helpers
- targeted Vitest suites or implementation guards for SSE / anti-cheat coordination
- docs/config consistency tests if deployment semantics change

## Non-goals
- No broad re-architecture of the judge worker protocol beyond what is needed to enforce the chosen runner fallback policy.
- No migration of unrelated legacy HTML or auth flows unless required by the fixes above.

## Suggested implementation slices
1. **Slice A:** unify Docker pull/remove/build validation + tests
2. **Slice B:** add Docker pull audit logging + tests
3. **Slice C:** tighten compiler runner fallback default + docs/tests
4. **Slice D:** cache seccomp profile existence check + tests
5. **Slice E:** implement chosen SSE/anti-cheat multi-instance strategy + tests/docs
