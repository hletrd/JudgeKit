# JudgeKit assessment hardening and release-readiness plan

## Requirements Summary

### Goal
Make JudgeKit safe and credible enough to use in this order:
1. **Assignments** — first production target
2. **Contests** — second target after integrity hardening
3. **Exams** — only after server-side assessment controls land
4. **Recruiting** — only after candidate-specific UX/policy work lands

### Explicit constraints / deferred decisions
- **API key hashing/encryption is deferred by product decision.**
- **Provider API keys remain plaintext in storage** due to operational requirement.
- This plan therefore focuses on every other blocker from the review: build health, assessment integrity, access control, data leakage, anti-cheat expectations, and recruiting-mode UX.

### Non-goals for this phase
- Re-architecting the whole auth stack
- Replacing Docker-based sandboxing
- Full remote proctoring / webcam / browser-lockdown system
- Reworking secret storage for admin API keys or provider API keys

---

## Acceptance Criteria

### Release-readiness
- `npx tsc --noEmit` passes with **0 errors**.
- `npx vitest run --config vitest.config.ts` passes for the currently failing suites at minimum:
  - `tests/unit/api/plugins.route.test.ts`
  - `tests/unit/api/contests.route.test.ts`
  - `tests/unit/audit/events.test.ts`
  - `tests/unit/auth/login-events.test.ts`
  - `tests/unit/security/rate-limit.test.ts`
- Full unit suite is green before rollout.

### Assessment integrity
- Chat assistant is **server-side blocked** for contest / exam / recruiting contexts.
- Auto AI review is **server-side blocked** for contest / exam / recruiting contexts.
- New problems default to **AI off** for high-stakes modes.
- Existing coursework problems retain optional AI support.

### Access control / leakage
- File download route enforces `files.manage` or ownership-based access.
- Hidden compile output is **not serialized to the client at all** when disabled.
- Hidden detailed results/runtime errors are also not serialized beyond allowed policy.
- Legacy HTML problem descriptions no longer allow third-party tracking images by default.

### Product UX
- Recruiting/candidate mode provides a stripped navigation and assessment-oriented labeling.
- Instructor/admin dashboards surface operational signals relevant to assignments/contests/exams.
- Anti-cheat copy is honest: telemetry is labeled as telemetry, not strong proctoring.

---

## Implementation Steps

### Phase 0 — Unblock correctness and quality gates (P0, must finish first)

#### 0.1 Fix async rate-limit misuse
**Why first:** this is a real correctness bug affecting admin/plugin/server-action safety.

**Primary references**
- Async function definition: `src/lib/security/api-rate-limit.ts:151-207`
- Broken call sites:
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:136-145`
  - `src/lib/actions/plugins.ts:27-28, 78-79`
  - `src/lib/actions/language-configs.ts:39-40, 84-85, 148-149, 226-227, 279-280`
  - `src/lib/actions/system-settings.ts` (same pattern)
  - `src/lib/actions/tag-management.ts:33-34, 79-80, 124-125`
  - `src/lib/actions/user-management.ts:74-75, 143-144, 210-211, 335-336`

**Work**
- Change all `const rateLimit = checkServerActionRateLimit(...)` call sites to `await`.
- Add a tiny helper if repetition becomes noisy, but prefer the smallest safe diff.
- Re-run TypeScript before touching broader policy work.

**Tests**
- Update/fix route/action tests affected by the async behavior.

#### 0.2 Repair current failing unit contracts
**Primary references**
- `tests/unit/api/plugins.route.test.ts`
- `tests/unit/api/contests.route.test.ts`
- `tests/unit/audit/events.test.ts`
- `tests/unit/auth/login-events.test.ts`
- `tests/unit/security/rate-limit.test.ts`
- Audit buffer implementation: `src/lib/audit/events.ts:83-199`
- Login event implementation: `src/lib/auth/login-events.ts:81-113`

**Work**
- Decide case-by-case whether the code is wrong, the tests are stale, or both.
- Keep fixes narrow:
  - restore intended async behavior in tests
  - stabilize audit buffer/pruning semantics
  - make rate-limit mocks support `db.transaction`
- Do not start new feature work until TypeScript + unit failures are resolved.

**Deliverable gate**
- Green `tsc`
- Green unit suites for the touched areas

---

### Phase 1 — Server-side assessment integrity policy (P0, blocks contests/exams/recruiting)

#### 1.1 Introduce a single assessment policy decision point
**Current problem:** policy is split between client hiding and ad hoc checks.

**Primary references**
- Client-only hide: `src/lib/plugins/chat-widget/chat-widget.tsx:50-56`
- Chat route: `src/app/api/v1/plugins/chat-widget/chat/route.ts:101-355`
- Auto review trigger: `src/app/api/v1/judge/poll/route.ts:157-160`
- Auto review implementation: `src/lib/judge/auto-review.ts:13-169`
- Global AI toggle default: `src/lib/system-settings.ts:48-57`
- Per-problem default: `src/lib/db/schema.ts:190-193`
- Problem form default: `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:92-95, 632-638`

**Work**
- Add one shared policy helper under `src/lib/assignments/` or `src/lib/judge/` that answers:
  - `canUseAiAssistant(...)`
  - `canRunAutoAiReview(...)`
  - `isHighStakesAssessment(...)`
- Inputs should include at least:
  - assignmentId / problemId
  - assignment exam/contest mode
  - future recruiting mode flag
  - per-problem AI toggle
  - global AI toggle

**Policy target**
- `coursework`: AI optional
- `contest`: AI hard-off
- `exam`: AI hard-off
- `recruiting`: AI hard-off

#### 1.2 Enforce the policy in the chat API, not just the widget
**Work**
- In `src/app/api/v1/plugins/chat-widget/chat/route.ts`, reject requests in blocked contexts with 403.
- Do not rely on pathname/client behavior.
- Require server-side resolution from `problemId` / `assignmentId`.

**Tests**
- Add/repair tests in `tests/unit/api/plugins.route.test.ts` for:
  - coursework allowed
  - contest blocked
  - exam blocked
  - recruiting blocked (once mode exists)

#### 1.3 Disable automatic AI review in assessment contexts
**Work**
- Gate `triggerAutoCodeReview` using the same shared helper.
- Enforce the gate before any provider call.
- Keep accepted-submission AI review only for coursework.

**Tests**
- Unit tests for accepted coursework vs accepted contest/exam behavior.

#### 1.4 Make the defaults safer
**Work**
- Keep global AI default behavior configurable, but stop defaulting high-stakes problem contexts to permissive AI.
- Change creation/edit flows so high-stakes modes initialize AI as off.
- Keep per-problem override visible, but disabled or locked in blocked modes.

---

### Phase 2 — Fix concrete access-control and data-leak bugs (P0)

#### 2.1 Enforce authorization on file download
**Primary reference**
- Vulnerable route: `src/app/api/v1/files/[id]/route.ts:19-63`

**Work**
- Mirror the access rules already used for delete/list:
  - `files.manage` can access any file
  - `files.upload` can access only owned files
- Return 403 instead of serving the blob when unauthorized.
- Reuse the capability/ownership shape already present in the same route.

**Tests**
- Add route tests for owner / non-owner / admin behavior.

#### 2.2 Stop sending hidden compile output to the browser
**Primary references**
- Server serialization: `src/app/(dashboard)/dashboard/submissions/[id]/page.tsx:99-129`
- Client-only hide: `src/app/(dashboard)/dashboard/submissions/[id]/_components/submission-result-panel.tsx:19-55`

**Work**
- Strip `compileOutput` at the server component layer before building `initialSubmission` when hidden.
- Audit `results` serialization similarly so hidden runtime output is not sent in props.
- Keep UI messages (“hidden”) but back them with true server-side omission.

**Tests**
- Page/unit test ensuring hidden compile output is absent from serialized props.

#### 2.3 Tighten legacy HTML image policy
**Primary references**
- Sanitizer: `src/lib/security/sanitize-html.ts:10-66`
- Legacy HTML render path: `src/components/problem-description.tsx:19-24`

**Work**
- Remove unrestricted external `<img src>` from legacy HTML by default.
- Prefer one of:
  - disallow `img` entirely in legacy HTML, or
  - allow only same-origin / trusted asset paths.
- Keep Markdown path unchanged for now unless separate issues are found.

**Tests**
- Sanitizer tests covering remote image stripping/blocking.

---

### Phase 3 — Anti-cheat honesty and minimum hardening (P1)

#### 3.1 Reposition anti-cheat as telemetry in product copy
**Primary references**
- Client monitor: `src/components/exam/anti-cheat-monitor.tsx:45-184`
- Logging route: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:30-110`

**Work**
- Audit UI copy across contest/exam pages and docs.
- Replace any implication of “secure proctoring” with “activity monitoring” / “telemetry”.
- Explain what is captured and what is not.

#### 3.2 Add low-cost server-side anomaly summaries
**Work**
- Keep current event logging, but surface simple derived signals for instructors/admins:
  - repeated tab switches
  - copy/paste bursts
  - missing heartbeat streaks
  - IP changes
- This is not enforcement, but it improves triage value.

**Tests**
- Unit tests for anomaly aggregation helpers.

---

### Phase 4 — Recruiting / candidate mode (P1 for hiring, not required for assignments)

#### 4.1 Introduce an explicit assessment profile
**Primary references**
- Academic navigation today: `src/components/layout/app-sidebar.tsx:53-69`
- Contest/exam constructs already exist in `src/lib/assignments/contests.ts`, `src/lib/assignments/exam-sessions.ts`

**Work**
- Add an assignment-level or assessment-level profile such as:
  - `coursework`
  - `contest`
  - `exam`
  - `recruiting`
- Use this as the canonical source for UI and policy branching.

#### 4.2 Strip distracting/learning-oriented affordances in recruiting mode
**Work**
- Hide rankings, compiler playground, assistant, and class/group wording for recruiting flows.
- Provide candidate-first labels and route entry points.
- Add a dedicated candidate shell if needed rather than overloading the student dashboard.

#### 4.3 Add recruiter-facing review signals
**Work**
- Extend reviewer/admin screens with a candidate-focused queue:
  - status
  - latest verdict
  - suspicious activity summary
  - code review comments (manual, not AI for recruiting)

**Tests**
- E2E for recruiting mode navigation and hidden surfaces.

---

### Phase 5 — Dashboard improvements for the real operators (P2, after blockers)

#### 5.1 Instructor dashboard
**Primary reference**
- `src/app/(dashboard)/dashboard/_components/instructor-dashboard.tsx`

**Add**
- stuck submissions
- suspicious activity count
- similarity-review queue
- assignments nearing deadline
- “students needing attention” cards

#### 5.2 Admin dashboard
**Primary reference**
- `src/app/(dashboard)/dashboard/_components/admin-dashboard.tsx`

**Add**
- stale/offline workers
- queue backlog
- failed image builds / stale images
- recent audit health issues
- backup status
- high-signal incident banner area

#### 5.3 Student dashboard
**Primary reference**
- `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx`

**Add**
- stronger “next action” cues
- exam resume / contest join shortcuts
- upcoming deadlines with urgency
- current pending/judging work status

---

## Verification Steps

### Mandatory per phase
1. `npx tsc --noEmit`
2. `npx vitest run --config vitest.config.ts`
3. Targeted unit suites for modified areas
4. Relevant E2E suites, especially:
   - `tests/e2e/student-submission-flow.spec.ts`
   - `tests/e2e/contest-system.spec.ts`
   - `tests/e2e/contest-full-lifecycle.spec.ts`
   - `tests/e2e/admin-languages.spec.ts`
   - new recruiting-mode E2E once added
5. `cd judge-worker-rs && cargo test` once the local I/O issue is resolved

### Additional policy verification
- Direct POST to `/api/v1/plugins/chat-widget/chat` from blocked contexts returns 403.
- Accepted contest/exam/recruiting submissions do not trigger `triggerAutoCodeReview`.
- Unauthorized file download attempts return 403.
- Hidden compile output is absent from HTML/JSON payloads, not merely hidden in UI.
- Legacy HTML with remote `<img>` is sanitized as intended.

---

## Risks and Mitigations

### Risk 1: policy branching becomes scattered again
**Mitigation:** centralize assessment policy in one helper and ban inline re-implementation.

### Risk 2: AI hardening breaks coursework tutoring UX
**Mitigation:** separate coursework-allowed tests from blocked assessment tests; keep policy table explicit.

### Risk 3: sanitizer tightening breaks old problem content
**Mitigation:** stage with migration notes and test fixtures; allow same-origin images if needed.

### Risk 4: recruiting mode becomes too large for one PR
**Mitigation:** split into:
1. policy + hidden surfaces
2. nav/shell
3. recruiter-facing review UX

### Risk 5: fixing tests turns into refactor sprawl
**Mitigation:** Phase 0 is contract restoration only; no opportunistic redesign while red.

---

## Recommended rollout order by use case

### After Phase 0 + Phase 1 + Phase 2
- **Assignments:** GO
- **Contests:** limited pilot only
- **Exams:** NO-GO
- **Recruiting:** NO-GO

### After Phase 3
- **Contests:** GO if ops signals are healthy
- **Exams:** internal-only pilot
- **Recruiting:** still NO-GO

### After Phase 4
- **Recruiting:** controlled beta

### After Phase 5
- Better operational confidence and better role-specific adoption

---

## Suggested execution split

### PR 1 — Release-readiness hotfixes
- Phase 0 only

### PR 2 — Assessment AI hardening
- Phase 1 only

### PR 3 — Access control and leakage fixes
- Phase 2 only

### PR 4 — Anti-cheat wording + summaries
- Phase 3 only

### PR 5+ — Recruiting mode and dashboard improvements
- Phase 4 and 5, split further if needed
