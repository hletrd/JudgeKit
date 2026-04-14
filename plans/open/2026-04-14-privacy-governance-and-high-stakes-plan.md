# Implementation plan — privacy, governance, and high-stakes hardening (2026-04-14)

## Source review lines
Primary sources:
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
  - findings 16, 17, 21, 22, 23, 26
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
  - H1, M2, M3, M4, M5
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
  - identity assurance, anti-cheat proof limits, retention-policy fit, instructor/admin usability criticism

## Goal
Turn the remaining privacy/governance/high-stakes criticism into a concrete repo-local hardening roadmap, while separating code changes from genuine external policy prerequisites.

## Workstream A — Canonical event/transcript data shape
**Targets**
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- chat route/persistence surfaces under `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- admin consumers of anti-cheat/chat history

**Implementation intent**
- make anti-cheat `details` a single canonical shape instead of double-encoded nested JSON;
- persist assistant outputs with explicit completion semantics so partial/aborted streams are not indistinguishable from complete ones.

**Acceptance criteria**
- anti-cheat dashboards and downstream analysis receive stable structured details;
- chat transcripts can distinguish complete, partial, failed, or aborted assistant turns.

**Verification expectations**
- route/component tests for structured anti-cheat details and transcript completion semantics.

## Workstream B — Backup/export sensitivity split
**Targets**
- `src/lib/db/export.ts`
- `src/app/api/v1/admin/backup/route.ts`
- `src/app/api/v1/admin/migrate/export/route.ts`
- docs/UI wording around backup/export behavior

**Implementation intent**
- separate “restorable full backup” from “portable/sanitized export”;
- stop treating a secret-bearing full dump as the only downloadable export shape.

**Acceptance criteria**
- human-downloadable export paths no longer include live session tokens / worker secrets / similar sensitive material by default;
- disaster-recovery backups remain possible through an explicitly different, clearly-labeled path.

**Verification expectations**
- export-shape tests and docs covering what gets redacted vs retained.

## Workstream C — Privileged transcript/governance controls
**Targets**
- admin chat-log APIs/UI
- role/capability definitions for transcript access
- audit/break-glass hooks around sensitive transcript access

**Implementation intent**
- tighten transcript access so it is explicitly governed rather than only “privileged by capability”; 
- make access auditable and narrow enough for real candidate/student trust.

**Acceptance criteria**
- transcript access is visible in audit trails and can be constrained by clearer break-glass or narrowly-scoped capability rules;
- docs explain who can inspect transcripts and under what policy.

**Verification expectations**
- route/audit tests for allowed/denied transcript access paths.

## Workstream D — Recruiting identity and anonymous metadata exposure hardening
**Targets**
- `src/app/api/v1/recruiting/validate/route.ts`
- recruiting invitation / recovery flows
- docs and UI around resume-code / re-entry policy

**Implementation intent**
- minimize anonymous validation responses;
- plan and stage a stronger identity-bound re-entry model for higher-assurance recruiting deployments (for example email magic-link re-entry, passkey, TOTP, or recruiter-mediated reset flow).

**Acceptance criteria**
- leaked tokens expose less metadata at validation time;
- the repo has a concrete staged path toward stronger recruiting identity assurance instead of only acknowledging the gap.

**Verification expectations**
- route tests for reduced validation payloads;
- design/acceptance notes for the stronger identity factor chosen.

## Workstream E — Retention, legal-hold, and export/archive policy fit
**Targets**
- retention maintenance code/docs
- admin policy surfaces that expose retention/export behavior

**Implementation intent**
- make retention/export/archive handling configurable enough to fit different institutional/employer policy windows;
- avoid hard-wiring one default that silently conflicts with appeal, dispute, or legal-hold needs.

**Acceptance criteria**
- the platform can distinguish default pruning from longer-hold/archive workflows where required;
- operator docs make the policy trade-offs explicit.

**Verification expectations**
- config/maintenance tests and doc truth-sync.

## Workstream F — High-stakes guardrails and operator usability follow-through
**Targets**
- high-stakes mode docs / settings surfaces / dashboards
- any UI flows where the reviews called the product “power-user oriented” or too implicit

**Implementation intent**
- add stronger product guardrails that prevent anti-cheat telemetry from being misrepresented as proof;
- simplify the highest-friction instructor/admin flows that still rely on hidden operator knowledge;
- make unsupported high-stakes use cases impossible to misread from the UI.

**Acceptance criteria**
- exam/public-contest limitations are visible and enforceable in product/admin surfaces, not only in docs;
- instructor/admin flows called out as overly operator-ish in the reviews have a concrete simplification pass queued/executed.

**Verification expectations**
- UI/content tests where appropriate, plus updated docs/screens that reflect the new guardrails.

## Completion bar
This plan is ready to archive only when the remaining privacy/high-stakes criticisms are either reduced by code/policy controls in-repo or explicitly narrowed to external operational prerequisites with no ambiguous middle ground.
