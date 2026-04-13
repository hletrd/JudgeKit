# Master review backlog — remaining work after the current-HEAD review pass

## Source reviews that still require action
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`

## Triage result
After re-reading the full review set against the current codebase and archived remediation plans:
- the older 2026-04-07 / 2026-04-09 / 2026-04-10 review lines remain implemented or superseded
- the original 2026-04-12 remediation backlog is also implemented and correctly archived
- the only still-open criticism now comes from the **current-HEAD** re-review, which is no longer about obvious brokenness but about what still blocks JudgeKit from becoming a truly high-assurance exam / public-contest / external-recruiting platform

## Deduped remaining backlog

### 1. High-assurance recruiting identity
**Why first:** this is the biggest remaining blocker for serious external recruiting.

**Feeds from reviews**
- multi-perspective current-head review: recruiting identity is improved but still not high-assurance identity
- adversarial current-head review: `H1` recruiting identity still not strong enough for high-assurance hiring

**Representative files / surfaces**
- recruiting invite claim + account-password login flow
- recruiting reset/recovery flow
- recruiting operator docs and candidate-facing recovery text

**Planned output**
- stronger identity-bound re-entry than invite URL + resume code alone
- explicit operator workflow for verified recovery/reset
- tests for identity/recovery edge cases

**Progress**
- ✅ recruiting candidates now create a real account password on first claim, and recruiting accounts persist the candidate email for later standard sign-in
- ✅ admins can now rotate recruiting account passwords for redeemed candidates without re-enabling invite-link authentication

### 2. High-stakes realtime / scaling architecture
**Why next:** this is still the core NO-GO reason for exams and serious contests.

**Feeds from reviews**
- multi-perspective current-head review: exams/public contests still blocked by realtime/ops architecture
- adversarial current-head review: `M1` exams/serious contests still depend on a single web app instance

**Representative files / surfaces**
- realtime coordination helper + SSE / anti-cheat routes
- deployment docs and high-stakes ops docs
- any future shared coordination implementation

**Planned output**
- either actual shared coordination for high-stakes routes or stricter unsupported-topology enforcement
- explicit performance/load/recovery verification criteria

**Progress**
- ✅ the realtime-sensitive routes now support a PostgreSQL-backed coordination mode for SSE connection-cap enforcement and anti-cheat heartbeat deduplication
- ✅ docs now distinguish single-instance process-local mode from shared PostgreSQL coordination mode instead of treating shared coordination as purely future work
- ✅ published a high-stakes validation matrix plus a runtime-check script so the remaining proof bar is explicit instead of implicit

### 3. Anti-cheat / exam-integrity hardening
**Why next:** the product still honestly calls anti-cheat telemetry, not proctoring.

**Feeds from reviews**
- multi-perspective current-head review: anti-cheat is still telemetry, not proctoring
- adversarial current-head review: `M2` anti-cheat is still telemetry, not proof

**Representative files / surfaces**
- anti-cheat monitor and dashboard
- contest/exam participant notices
- ops/readiness docs

**Planned output**
- clearer exam-grade integrity strategy beyond current browser-event telemetry
- stronger evidence taxonomy and operator guidance
- possible future proctoring-adjacent controls if actually desired

**Progress**
- ✅ published `docs/exam-integrity-model.md` and surfaced the evidence model more explicitly in the anti-cheat dashboard

### 4. Sensitive-data governance tightening
**Why next:** retention is better, but governance is still not “done.”

**Feeds from reviews**
- multi-perspective current-head review: retention is now real, but may not match institutional policy
- adversarial current-head review: `M3` privileged staff can still inspect sensitive conversation data; `M4` submission retention may still be operationally sensitive

**Representative files / surfaces**
- chat-log access surfaces
- retention/pruning config and docs
- export/archive workflow surfaces

**Planned output**
- configurable retention and/or archival policy model
- tighter access controls and handling workflows for sensitive transcripts/evidence
- explicit institution/employer policy knobs where needed

**Progress**
- ✅ retention windows are now environment-configurable instead of being hard-coded only in the application source
- ✅ admin chat-log listing and transcript access are now audit logged to improve privileged-access accountability

### 5. Instructor/admin usability beyond power-user workflows
**Why later:** important, but not the main security/integrity blocker.

**Feeds from reviews**
- multi-perspective current-head review: instructor/admin usability remains power-user oriented

**Representative files / surfaces**
- instructor dashboard and management flows
- admin/operator settings and readiness guidance

**Planned output**
- guided workflows for common high-value tasks
- more discoverable admin/instructor actions without requiring deep system knowledge

**Progress**
- ✅ both instructor and admin dashboards now surface quick links for common high-value workflows

### 6. Privileged worker boundary and operational containment
**Why later:** still important for high-stakes trust, but broader than a single product bug.

**Feeds from reviews**
- multi-perspective current-head review: admin/operator model still sensitive because the judge worker is privileged
- adversarial current-head review: `M5` judge worker remains the highest-consequence trust boundary

**Representative files / surfaces**
- worker deployment docs
- monitoring/runbook surfaces
- future containment/isolation improvements

**Planned output**
- stronger worker-specific operational guidance
- monitoring/runbook expectations for abnormal worker behavior or compromise
- any future containment improvements split into their own implementation slices

**Progress**
- ✅ published `docs/judge-worker-incident-runbook.md` and linked it from the high-stakes/readiness surfaces

## Recommended execution order
1. High-assurance recruiting identity
2. High-stakes realtime / scaling architecture
3. Anti-cheat / exam-integrity hardening
4. Sensitive-data governance tightening
5. Privileged worker boundary and operational containment
6. Instructor/admin usability beyond power-user workflows

## Shared verification bar for any future implementation
- `pnpm -s tsc --noEmit`
- targeted Vitest for affected auth/realtime/governance paths
- targeted Playwright for recruiting/exam/contest user-facing flows where possible
- docs and ops artifacts updated in lockstep with behavior changes
- broader load/chaos/rehearsal evidence before changing any GO/NO-GO stance for exams/public contests
