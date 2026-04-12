# Implementation plan — `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`

## Source review status
Open plan. No implementation is included here.

## Planning scope
This plan addresses the still-open security/integrity criticism in:
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`

## Findings covered by this plan
### HIGH
1. Recruiting identity is improved, but still not strong enough for high-assurance hiring.

### MEDIUM
2. Exams and serious contests still depend on a single web app instance.
3. Anti-cheat is still telemetry, not proof.
4. Privileged staff can still inspect sensitive conversation data.
5. Submission retention is now bounded, but deletion policy may still be operationally sensitive.
6. The judge worker remains the highest-consequence trust boundary.

### LOW
7. Local Playwright verification is now more honest, but still environment-dependent.
8. The product now documents its limitations honestly, which is good but preserves the current NO-GO boundaries.

## Phase 0 — Revalidate current threat assumptions before any future implementation
Before changing code again, re-check the current identity, recovery, retention, and worker-boundary surfaces against `HEAD`.

## Phase 1 — High-assurance recruiting identity
**Severity:** HIGH

**Problem**
The current recruiting model is no longer obviously unsafe, but it still does not provide strong non-repudiation for serious external hiring.

**Representative files / surfaces**
- recruiting invitation redemption and reset flows
- candidate re-entry UX
- recruiter/admin reset workflows

**Plan**
- add a stronger identity-bound recovery or continuation mechanism
- preserve all current anti-replay guarantees
- ensure admin reset flows are logged and constrained tightly

**Acceptance criteria**
- external recruiting no longer depends only on shared secrets like invite URLs + resume codes
- recovery/reset workflows reduce impersonation risk rather than merely moving it

## Phase 2 — High-stakes event integrity architecture
**Severity:** MEDIUM

**Problem**
Formal exams and serious contests still depend on single-instance assumptions that are operationally fragile.

**Representative files / surfaces**
- realtime coordination code
- deployment/runtime docs
- any future shared-state integration

**Plan**
- implement shared coordination or make unsupported topology enforcement stricter and more explicit
- define the operational verification bar for any future exam/contest readiness claim

**Acceptance criteria**
- there is a credible path from current architecture to supported high-stakes event integrity

## Phase 3 — Anti-cheat evidence model
**Severity:** MEDIUM

**Problem**
Anti-cheat remains advisory telemetry, which is honest but insufficient for strong exam claims.

**Representative files / surfaces**
- anti-cheat monitor/dashboard
- participant notices
- ops/checklist docs

**Plan**
- define whether the system will stay telemetry-only or adopt stronger exam-integrity controls
- codify the evidence standard and operator expectations

**Acceptance criteria**
- the product and docs make a consistent, explicit promise about what anti-cheat does and does not mean

## Phase 4 — Sensitive-data governance tightening
**Severity:** MEDIUM

**Problem**
Retention is now bounded, but privileged transcript access and deletion-policy fit are still governance-sensitive.

**Representative files / surfaces**
- chat-log access
- retention maintenance + docs
- export/archive workflows

**Plan**
- evaluate tighter access controls or approval workflows for sensitive transcript review
- decide whether retention windows need deployment-level configurability
- define a supported export/archive path where institutions/employers need longer evidence retention

**Acceptance criteria**
- sensitive-data governance is defensible both technically and operationally

## Phase 5 — Worker-boundary operational containment
**Severity:** MEDIUM

**Problem**
The judge worker remains the highest-consequence technical boundary in the system.

**Representative files / surfaces**
- worker ops docs
- monitoring/runbooks
- any future containment/isolation improvements

**Plan**
- define worker-specific incident/monitoring expectations
- consider what additional containment/isolation steps would materially reduce blast radius

**Acceptance criteria**
- worker compromise or abnormal behavior has a clearer operational response model than today

## Phase 6 — Verification environment reliability
**Severity:** LOW

**Problem**
Local Playwright verification is more honest now, but still depends on a functional Docker daemon.

**Plan**
- decide whether additional remote-safe or daemon-free verification surfaces are needed
- keep verification tooling aligned with the real PostgreSQL runtime

**Acceptance criteria**
- local/CI verification remains truthful and maintainable without silently drifting from runtime reality

## Suggested execution order
1. High-assurance recruiting identity
2. High-stakes event integrity architecture
3. Sensitive-data governance tightening
4. Anti-cheat evidence model
5. Worker-boundary operational containment
6. Verification environment reliability

## Verification targets
- `pnpm -s tsc --noEmit`
- targeted Vitest/Playwright for auth and recovery changes
- deployment/runtime verification for shared-coordination or topology-policy changes
- docs/checklist review for any change that alters security posture claims

## Non-goals
- No implementation in this planning pass
- No rollback of the already-landed 2026-04-12 remediation work
