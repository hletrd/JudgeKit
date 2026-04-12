# Master review backlog — open items after reading the full current review set

> Archived on 2026-04-12 after the 2026-04-12 review execution lane was implemented and pushed.


## Source reviews that still require action
- `.context/reviews/multi-perspective-review-2026-04-12.md`
- `.context/reviews/adversarial-security-review-2026-04-12.md`

## Triage result
After comparing the full review set against the archived remediation plans:
- the 2026-04-07 / 2026-04-09 / 2026-04-10 code/security reviews are already represented by archived completed plans or superseded-review notes
- the 2026-04-12 deep-review lines are also already represented by archived completed plans
- the still-open work now clusters around **recruiting identity**, **candidate privacy/isolation**, **data governance**, **assessment-mode clarity**, and **high-stakes operational integrity**

## Deduped backlog

### 1. Recruiting identity and re-entry hardening
**Why first:** this is the highest-impact issue for hiring trust.
**Progress (2026-04-12):** ✅ Implemented. The invite URL is now claim-only, first claim requires creating a resume code, and redeemed links can only continue via the current authenticated session or the candidate's resume code.

**Feeds from reviews**
- multi-perspective review: “recruiting identity is too weak for serious hiring use”
- adversarial security review: `H1` replayable recruiting bearer credentials

**Representative files**
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/auth/recruiting-token.ts`
- `src/app/(auth)/recruit/[token]/page.tsx`
- `src/app/(auth)/recruit/[token]/recruit-start-form.tsx`
- recruiting invitation/auth tests

**Planned output**
- claim-once invitation flow instead of reusable bearer-token login
- stronger candidate re-entry model
- better auditability around candidate identity/session lifecycle

### 2. Recruiting candidate isolation and privacy boundaries
**Why next:** this is a direct fairness/privacy issue during assessments.

**Feeds from reviews**
- multi-perspective review: “recruiting privacy/fairness boundaries are still not hard enough”
- adversarial security review: `H2` candidates can still learn identities/standings

**Representative files**
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx`
- `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts`
- `src/app/(dashboard)/dashboard/problems/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx`
- candidate/recruiting E2E specs

**Planned output**
- recruiting candidates cannot see shared standings or per-problem rankings
- route-level enforcement, not button-only hiding
- candidate-visible surfaces become private-by-default

**Progress**
- ✅ recruiting candidates are blocked from the contest leaderboard API
- ✅ recruiting candidates no longer see the shared leaderboard on contest detail pages
- ✅ recruiting candidates cannot reach per-problem rankings even via direct URL navigation

### 3. Sensitive-data retention, pruning, and access governance
**Why next:** the product now spans student, candidate, and high-stakes contexts, so governance debt becomes launch debt.

**Feeds from reviews**
- multi-perspective review: “privacy/retention policy is still weaker than the product scope”
- adversarial security review: `M3` chat logs stored/readable without finished retention policy

**Representative files**
- `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- `src/app/api/v1/admin/chat-logs/route.ts`
- `src/lib/audit/events.ts`
- schema + any future pruning jobs for chat / anti-cheat data
- docs: policy/readiness/checklists

**Planned output**
- retention windows for chat logs, anti-cheat events, submissions, candidate data, audit logs
- automated pruning where the platform stores sensitive records
- explicit access boundaries and user-facing notice text

**Progress**
- ✅ published `docs/privacy-retention.md` with retention windows and handling rules for audit logs, AI chat logs, anti-cheat events, recruiting records, and submissions
- ✅ added runtime pruning for AI chat logs (30 days) and anti-cheat events (180 days), complementing the existing 90-day audit-log pruning
- ✅ surfaced chat-log retention and access notices directly on the admin chat-log page

### 4. Assessment-mode model and operator clarity
**Why next:** hidden or overly implicit mode behavior creates product and security mistakes.

**Feeds from reviews**
- multi-perspective review: “product-mode design is improving, but still feels too implicit”
- adversarial security review: `M4` mode resolution is policy-heavy and easy to misunderstand

**Representative files**
- `src/lib/platform-mode.ts`
- `src/lib/platform-mode-context.ts`
- `src/lib/system-settings.ts`
- admin/instructor settings and dashboards
- E2E/implementation-guard tests for mode boundaries

**Planned output**
- clearer explicit per-assignment/per-event mode semantics
- surfaced effective-mode information in admin/instructor UI
- tighter mode-boundary tests for recruiting/exam/contest/homework contexts

**Progress**
- ✅ the dashboard header now shows the effective platform mode visibly instead of only via screen-reader text
- ✅ admin system settings now include an operational summary block for the currently selected platform mode

### 5. Anti-cheat posture and evidence-quality honesty
**Why next:** this is essential before exam/recruiting claims are expanded.

**Feeds from reviews**
- multi-perspective review: anti-cheat is telemetry, not exam-grade integrity
- adversarial security review: `M2` client-side signals are easy to evade and should not be treated as proctoring

**Representative files**
- `src/components/exam/anti-cheat-monitor.tsx`
- contest/exam participant notices
- anti-cheat dashboard text/docs
- launch/readiness docs

**Planned output**
- participant/instructor/admin wording that reflects telemetry rather than strong proctoring
- explicit evidence-quality guidance in dashboards/docs
- release/readiness docs aligned to the real integrity story

**Progress**
- ✅ published `docs/high-stakes-operations.md` with explicit anti-cheat telemetry guidance and launch-truth framing

### 6. High-stakes operational readiness and realtime scaling
**Why next:** homework can tolerate this; exams/serious contests cannot.

**Feeds from reviews**
- multi-perspective review: contest/exam realtime still depends on a single app instance
- adversarial security review: `M1` single-instance realtime remains an integrity/availability weakness

**Representative files**
- realtime coordination/runtime guard surfaces
- deployment docs/compose examples
- release-readiness and go/no-go docs

**Planned output**
- either real shared coordination for high-stakes routes or an even harder no-go/deployment gate for unsupported topologies
- explicit readiness criteria for when exams/public contests can be reconsidered

### 7. Privileged worker boundary and ops hardening
**Why last:** important, but broader and partially operational rather than a single product bug.

**Feeds from reviews**
- adversarial security review: `M5` judge worker remains a privileged trust boundary
- multi-perspective review: admin/operator experience still has sharp edges for high-stakes use

**Representative files / artifacts**
- worker deployment docs
- privileged route audit/monitoring surfaces
- runbooks/checklists/alerting docs

**Planned output**
- stronger operator guidance for the privileged worker boundary
- clearer monitoring/runbook expectations around worker compromise or misbehavior
- explicit separation between normal app ops and privileged judge-worker ops

**Progress**
- ✅ published `docs/high-stakes-operations.md`, including a dedicated judge-worker trust-boundary section for operators

## Recommended execution order
1. Recruiting identity and re-entry hardening
2. Recruiting candidate isolation and privacy boundaries
3. Sensitive-data retention, pruning, and access governance
4. Assessment-mode model and operator clarity
5. Anti-cheat posture and evidence-quality honesty
6. High-stakes operational readiness and realtime scaling
7. Privileged worker boundary and ops hardening

## Shared verification bar for each future execution phase
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for touched auth/routes/mode helpers
- targeted Playwright coverage for candidate/recruiting flows when touching user-visible isolation
- docs/readiness checklist updates for any policy or deployment-semantic change
- any relevant Rust/ops validation only if a future slice touches worker/runtime boundaries
