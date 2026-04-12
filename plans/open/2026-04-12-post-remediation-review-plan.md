# Implementation plan — remaining work after reviewing all current review artifacts

## Source reviews considered
Reviewed against the current review set under `.context/reviews/`:
- `comprehensive-code-review-2026-04-07.md`
- `comprehensive-code-review-2026-04-09-worktree.md`
- `comprehensive-code-review-2026-04-09.md`
- `comprehensive-code-review-2026-04-10.md`
- `comprehensive-review-2026-04-09.md`
- `comprehensive-security-review-2026-04-09.md`
- `comprehensive-security-review-2026-04-10.md`
- `deep-code-review-2026-04-12.md`
- `deep-code-review-2026-04-12-post-remediation.md`

## Review triage result
After comparing the reviews against the archived remediation plans and current repo state:
- the 2026-04-07 / 2026-04-09 / 2026-04-10 broad review lines are already represented by archived completed plans or archived superseded-review notes
- the 2026-04-10 security review is already archived as implemented
- the 2026-04-09 security review is already archived as superseded by the 2026-04-10 security review
- the only currently actionable missing work surfaced by the latest reviews is the remaining set from:
  - `.context/reviews/deep-code-review-2026-04-12-post-remediation.md`

## Planning-only note
This file is a planning artifact only. It does **not** implement any fixes.

## Missing tasks still worth doing
1. The realtime coordination contract is misleading: `REALTIME_COORDINATION_BACKEND=redis|postgresql` currently disables the runtime guard without any actual shared coordination implementation.
2. The realtime multi-instance guard is still fragile because it depends on manually supplied replica-count env vars.
3. Failed or denied Docker image pulls are still not audit logged.
4. The admin Docker build route still performs synchronous filesystem checks in the request path.
5. The legacy HTML rendering surface remains broader than ideal and should be reduced or made more explicit.

## Execution order
1. **Realtime correctness / deployment safety**
2. **Admin Docker auditability**
3. **Low-severity request-path cleanup**
4. **Legacy HTML surface reduction**

## Phase 0 — Revalidate the remaining review findings against `HEAD`
Before changing code, re-check these exact files:
- `src/lib/realtime/realtime-coordination.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `src/app/api/v1/admin/docker/images/route.ts`
- `src/app/api/v1/admin/docker/images/build/route.ts`
- `src/components/problem-description.tsx`
- `src/lib/security/sanitize-html.ts`
- `README.md`
- `docs/deployment.md`
- `docs/judge-workers.md`

If any of these have already changed, update this plan before implementation.

## Phase 1 — Realtime coordination contract fix
### Track 1A — Make `REALTIME_COORDINATION_BACKEND` truthful
**Severity:** HIGH

**Files**
- `src/lib/realtime/realtime-coordination.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `README.md`
- `docs/deployment.md`
- `docs/judge-workers.md`
- tests under `tests/unit/realtime/` and `tests/unit/infra/`

**Problem**
The code currently treats `REALTIME_COORDINATION_BACKEND=redis` or `postgresql` as if shared coordination exists, but the SSE and anti-cheat routes still use process-local state only.

**Required decision**
Choose exactly one supported path:
1. **Implement real shared coordination** for Redis/PostgreSQL and keep the env contract.
2. **Make the env contract honest** by removing `redis` / `postgresql` as “supported” backends until implementation exists.
3. **Rename the env** into an explicit override/acknowledgement flag that does not imply shared-state support.

**Recommended direction**
Prefer option 2 or 3 unless there is time and appetite to implement real shared state now. The current behavior is misleading, so the contract should become truthful first.

**Plan**
- remove the false implication that merely setting `REALTIME_COORDINATION_BACKEND` enables shared coordination
- keep or tighten the fail-closed path for unsupported multi-instance deployments
- ensure docs and runtime behavior say exactly the same thing
- make route error messages explicit and operator-facing
- **Status:** completed at `HEAD` on 2026-04-12 — `REALTIME_COORDINATION_BACKEND` no longer implies real shared coordination, unsupported backend declarations fail closed, and docs now describe it as reserved until implementation exists.

**Tests**
- runtime coordination tests for each supported/unsupported env combination
- implementation guard tests proving the affected routes still consult the shared guard helper
- docs consistency tests updated to match the chosen contract

### Track 1B — Tighten multi-instance detection
**Severity:** MEDIUM

**Files**
- `src/lib/realtime/realtime-coordination.ts`
- deployment docs / env examples if needed
- tests under `tests/unit/realtime/` and `tests/unit/infra/`

**Problem**
The guard still depends on `APP_INSTANCE_COUNT` / `WEB_CONCURRENCY`. If those env vars are missing in a replicated deployment, the guard does not trigger.

**Plan**
- require a more explicit declaration of single-instance mode in production-like environments, or
- fail more conservatively when replica-count information is missing, or
- add an explicit env such as `REALTIME_SINGLE_INSTANCE_ACK=1` / `REALTIME_MULTI_INSTANCE_ENABLED=1` so the deployment intent is unambiguous
- keep the behavior deterministic and documented
- **Status:** completed at `HEAD` on 2026-04-12 — production-like deployments now require `APP_INSTANCE_COUNT=1` (or `REALTIME_SINGLE_INSTANCE_ACK=1`) before using process-local realtime routes, and the shipped production compose declares the single-instance app tier explicitly.

**Tests**
- missing replica-count env in production-like mode
- explicit single-instance acknowledgment path
- explicit shared coordination enabled path

## Phase 2 — Docker mutation observability
### Track 2A — Audit denied and failed image pulls
**Severity:** MEDIUM

**Files**
- `src/app/api/v1/admin/docker/images/route.ts`
- tests under `tests/unit/api/`

**Problem**
Successful pulls are now audit logged, but denied or failed pull attempts still are not.

**Plan**
- emit audit events for rejected and failed pull attempts
- include the requested image tag and a concise reason/status
- keep the action namespace consistent, e.g. `docker_image.pull_rejected` / `docker_image.pull_failed`
- decide whether remove/build failure paths need the same consistency pass while touching this surface

**Tests**
- invalid image pull emits rejection audit event
- failed allowed-image pull emits failure audit event
- successful pull still emits success audit event

## Phase 3 — Low-severity request-path cleanup
### Track 3A — Remove sync Dockerfile existence checks from the build route
**Severity:** LOW

**Files**
- `src/app/api/v1/admin/docker/images/build/route.ts`
- tests under `tests/unit/api/`

**Plan**
- replace `existsSync()` with `fs/promises.access()` or an equivalent async check
- preserve the current 404 behavior and error payloads
- keep the local-only build contract intact

**Tests**
- missing Dockerfile still returns 404
- existing Dockerfile still proceeds to build
- no sync existence check remains in the route implementation

## Phase 4 — Legacy HTML surface reduction
### Track 4A — Narrow or formalize the legacy HTML path
**Severity:** LOW

**Files**
- `src/components/problem-description.tsx`
- `src/lib/security/sanitize-html.ts`
- component tests for problem descriptions

**Problem**
The current sanitized legacy HTML path is not obviously vulnerable, but it remains broad and harder to reason about than the markdown path.

**Plan**
Choose one of these approaches:
1. **Reduce allowed HTML surface** — trim `ALLOWED_TAGS` / `ALLOWED_ATTR` to the minimal set still required by legacy problem statements.
2. **Formalize support contract** — document and test the exact supported HTML subset, including what is intentionally not supported.
3. **Migrate away from legacy HTML** — if feasible, start a deprecation path toward markdown-only rendering.

**Recommended direction**
Prefer option 1 + 2 first: reduce the allowed set where safe and add tests/documentation for the supported subset.

**Tests**
- component tests for preserved allowed legacy formatting
- sanitizer tests for stripped disallowed tags/attrs
- explicit tests for external media stripping and safe anchor behavior

## Acceptance criteria
- realtime runtime behavior and docs no longer imply shared coordination where none exists
- multi-instance protection cannot be bypassed accidentally by omitted env vars without an explicit acknowledgment path
- failed and denied Docker image pulls are audit logged
- the build route no longer performs sync filesystem existence checks in the request path
- the legacy HTML rendering surface is either smaller or more explicitly documented/tested than it is today

## Verification targets
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for realtime coordination and deployment-doc consistency
- targeted Vitest suites for Docker admin routes
- targeted Vitest/component tests for problem-description / sanitizer behavior
- any new implementation guard tests needed to keep the contract honest over time

## Suggested implementation slices
1. **Slice A:** make the realtime coordination env contract truthful
2. **Slice B:** harden replica-count / deployment-intent detection
3. **Slice C:** add audit logging for rejected/failed Docker pulls
4. **Slice D:** switch Dockerfile existence checks to async APIs
5. **Slice E:** reduce/document/test the legacy HTML surface
