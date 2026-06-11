# Multi-perspective review — 2026-04-12

## Scope
Fresh repo review focused on whether JudgeKit is ready for:
- student assignments
- instructor-led coursework
- admin-operated deployments
- AI-assistant usage
- recruiting/candidate coding tests
- formal exams and programming contests

Evidence came from the current code and the repo's own readiness documents, especially:
- `docs/go-no-go-memo.md`
- `README.md`
- `src/lib/platform-mode.ts`
- `src/lib/platform-mode-context.ts`
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx`
- `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts`
- `src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx`
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/auth/recruiting-token.ts`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- `src/app/api/v1/admin/chat-logs/route.ts`

## Executive verdict

### My honest launch recommendation
- **Student assignments / low-stakes coursework:** **GO**
- **Instructor-managed coursework with normal classroom risk:** **GO, with normal caution**
- **Internal recruiting pilot:** **CONDITIONAL GO** — only after fixing the recruiting token and candidate privacy leaks below
- **Formal exams:** **NO-GO**
- **Public or high-stakes programming contests:** **NO-GO**

That is still broadly aligned with your own memo, which says **GO** for homework and cautious internal recruiting, but **NO-GO** for formal exams and public/high-stakes contests (`docs/go-no-go-memo.md:21-29`, `docs/go-no-go-memo.md:127-140`). I did not find enough current evidence to overturn that caution.

## What is genuinely strong
- The platform is **broad**. It already has real roles, groups, assignments, contests, recruiting invites, workers, analytics, audit logs, language management, and AI/plugin surfaces.
- The project is **more disciplined than most side-project judges**. There is CI, significant test coverage, security-minded architecture notes, and unusually honest docs.
- The **high-stakes mode restrictions are directionally right**: AI is restricted by default in exam/contest/recruiting, and the standalone compiler is blocked in exam/recruiting (`src/lib/platform-mode.ts:11-21`).
- The product is already **useful** for classes and internal evaluation workflows. This is not a toy.

## Cross-cutting concerns you should take seriously

### 1. Recruiting identity is too weak for serious hiring use
This is the biggest issue I found.

**Evidence**
- A recruiting token is the login credential (`src/lib/auth/config.ts`, credentials provider with `recruitToken`).
- If an invitation was already redeemed, the same token is still accepted and immediately returns the existing candidate user (`src/lib/assignments/recruiting-invitations.ts:216-230`).
- The auth path simply turns that token into a session again (`src/lib/auth/recruiting-token.ts:31-78`).
- The token lives in the URL path: `/recruit/[token]` and is passed back into sign-in from the client (`src/app/(auth)/recruit/[token]/recruit-start-form.tsx:19-33`).

**Why this matters**
- Anyone who gets the URL can impersonate the candidate.
- Re-entry is not strongly tied to the original browser, device, email inbox, or second factor.
- This is okay for a low-friction pilot, but it is **not strong enough for serious recruiting integrity**.

**Bottom line**
For hiring, this is still a **bearer-token assessment system**, not a strong candidate identity system.

### 2. Recruiting privacy/fairness boundaries are still not hard enough
This is the second major issue.

**Evidence**
- Candidate/student contest view always renders a leaderboard in the participant flow (`src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:354-373`).
- The leaderboard API explicitly avoids anonymizing recruiting-mode users (`src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:55-73`).
- The problem page hides the rankings button in recruiting mode (`src/app/(dashboard)/dashboard/problems/[id]/page.tsx:223-231`), but the rankings route itself does **not** enforce recruiting restrictions and exposes usernames, names, language, execution time, memory, and code length to anyone who can access the problem (`src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx:40-89`, `:114-156`).

**Why this matters**
- Candidates can see each other on leaderboards unless you are extremely careful with flow design.
- A candidate who guesses/directly navigates to the problem rankings URL may learn who else solved the task and how efficiently.
- This is a **bad fit for recruiting privacy** and can distort candidate behavior.

**Bottom line**
Right now, recruiting mode is **not privacy-clean**.

### 3. The anti-cheat story is useful telemetry, not exam-grade integrity
**Evidence**
- The monitor only records browser-side signals like `tab_switch`, `blur`, `copy`, `paste`, `contextmenu` and retries failed sends from `localStorage` (`src/components/exam/anti-cheat-monitor.tsx:45-185`).
- The server route stores those signals and heartbeat events, but this is still basically event logging, not robust proctoring (`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`).

**Why this matters**
- This helps instructors review suspicious activity.
- It does **not** prove cheating, and it is easy to evade compared with real high-stakes proctoring.
- For exams or recruiting, you should market this as **integrity telemetry**, not as strong anti-cheat protection.

### 4. Contest/exam realtime still depends on a single app instance
**Evidence**
- The README still says the Next.js app must remain single-instance for contest SSE connection caps and anti-cheat heartbeat deduplication (`README.md:218-227`).

**Why this matters**
- This is manageable for a small/internal deployment.
- It is an operational ceiling for serious contests or exam windows.
- Until shared coordination exists and is proven, I would not trust this for reputationally important live events.

### 5. Privacy/retention policy is still weaker than the product scope
**Evidence**
- Chat messages are stored by default (`src/app/api/v1/plugins/chat-widget/chat/route.ts:163-201`).
- Admin users with `system.chat_logs` can retrieve sessions and full messages (`src/app/api/v1/admin/chat-logs/route.ts:9-68`).
- Audit logs have a 90-day prune job (`src/lib/audit/events.ts:171-195`), but I did not find an equivalent pruning path for chat logs.
- Your own roadmap still lists privacy/retention policy work as unfinished (`docs/remediation-roadmap.md:334-348`).

**Why this matters**
- For student assignments, this is a governance question.
- For recruiting and exams, it becomes a **serious compliance and trust question**.
- If you keep candidate chats, submissions, anti-cheat signals, and admin visibility, you need explicit retention rules and role boundaries.

### 6. Product-mode design is improving, but still feels too implicit
**Evidence**
- The platform has one global mode plus some context-derived overrides (`src/lib/platform-mode.ts:3-21`, `src/lib/platform-mode-context.ts:54-85`).
- Assignment mode is inferred from `examMode`, and if the global mode is not `exam`, an assignment with exam behavior becomes `contest` (`src/lib/platform-mode-context.ts:36-52`).

**Why this matters**
- This is clever, but it also means the same platform is still juggling classroom, exam, contest, and recruiting semantics with a partially global, partially implicit model.
- That increases operator confusion.
- I would rather see **explicit per-assignment/per-event intent** than hidden interpretation rules.

## Perspective-by-perspective review

### 1. Student perspective
**What works**
- The student dashboard is legitimately useful: solved/attempted counts, acceptance rate, top languages, upcoming deadlines, recent submissions.
- Problem solving and submission flows are mature enough to feel like a real online judge.
- Multi-language support is a real differentiator.

**What feels weak**
- The product is feature-rich, but it is not always calm. The same system is trying to be classroom LMS, online judge, contest platform, and recruiting tool.
- The experience can feel more like “a powerful internal system” than a student-first polished learning product.
- For high-stakes use, the difference between practice, contest, and exam is still not strong enough in tone or workflow.

**Verdict**
- **Good for coursework and practice.**
- **Not yet something I would call exam-grade from the student experience side.**

### 2. Instructor perspective
**What works**
- The raw capability is strong: groups, assignments, status boards, analytics, student detail pages, overrides, anti-cheat dashboards, recruiting invitations.
- This is more powerful than many classroom coding tools.

**What feels weak**
- The workflow model is dense. Instructors need to understand groups, assignments, contests, exam modes, scoring models, invitations, and platform modes.
- The instructor dashboard itself is relatively shallow compared with the rest of the system; much of the real power is hidden several clicks deep.
- The system feels closer to a flexible platform than a teacher-friendly guided workflow.

**Verdict**
- **Strong power-user instructor tool.**
- **Not yet effortless.** Good instructors/admins can use it well; average instructors will need onboarding.

### 3. Admin / operator perspective
**What works**
- Admin visibility is unusually broad: users, roles, submissions, login logs, audit logs, workers, languages, files, API keys, plugins.
- The docs are serious and operationally aware.
- The deployment architecture is much healthier than a typical hobby judge.

**What feels weak**
- The blast radius is large. One admin surface controls many dangerous things.
- This is not a “set it and forget it” product. It still wants a technically strong operator.
- The single-instance web-app constraint is a real operational footgun if someone scales casually.

**Verdict**
- **Good for a technically confident owner-admin.**
- **Too operationally sharp-edged for a casual school admin team without engineering support.**

### 4. Assistant / AI-product perspective
**What works**
- The assistant is more disciplined than average: bounded purpose, tool-based context, per-problem toggle, global toggle, and high-stakes default restrictions.
- Blocking AI by default in exam/contest/recruiting is the correct instinct.

**What feels weak**
- The AI layer still carries policy baggage: third-party provider exposure, stored chat logs, admin visibility, and no completed retention policy.
- It is still basically one configurable assistant plugin, not a fully governed enterprise AI surface.
- In education, this is acceptable. In recruiting or exams, it becomes much more sensitive.

**Verdict**
- **Useful in homework mode.**
- **Correctly disabled by default in high-stakes modes.**
- **Governance story still needs work.**

### 5. Job applicant / candidate perspective
**What works**
- The dedicated invite/start flow is better than dumping candidates into a generic login page.
- Recruiting mode blocks the standalone compiler and hides several academic pages, which is good.
- The candidate dashboard exists and is at least a step toward a dedicated experience.

**What feels weak**
- It still feels like a contest/assignment product wearing a recruiting skin.
- The underlying model still uses contests, groups, and student accounts.
- The reusable bearer-token login model is weak.
- The leaderboard/ranking privacy story is not acceptable for serious recruiting.

**Verdict**
- **Okay for an internal pilot with trusted candidates and low stakes.**
- **Not yet something I would confidently use for serious external recruiting.**

### 6. Security researcher / attacker perspective
If I were attacking or stress-testing this system, I would focus on:
1. **Stealing or replaying recruiting URLs** to impersonate candidates.
2. **Enumerating rankings/leaderboards** to learn who solved what and how fast.
3. **Using the single-app-instance limitation** to create reliability pressure during a live event.
4. **Mining chat logs** if I obtained privileged internal access.
5. **Targeting the worker boundary** because it remains the most sensitive component in the architecture.

That does **not** mean the platform is insecure overall. It means the remaining weaknesses are concentrated exactly where your target use cases are most sensitive: identity, privacy, fairness, and event integrity.

## Final honesty check by intended use case

### Student assignments
**Yes.** This is the best-fit use case today.

### Instructor-led programming classes
**Yes, if the instructor is comfortable with a fairly powerful system.**

### Recruiting coding tests
**Only after fixing the recruiting token model and privacy leaks.** Otherwise I would call it a risky pilot, not a trustworthy hiring platform.

### Exams
**No.** Not because the project is bad, but because the integrity model and operational evidence are still not boring enough.

### Programming contests
**Internal/small: maybe. Public/high-stakes: no.** The current single-instance realtime constraint alone is enough to keep me cautious.

## Highest-priority next moves
1. Replace recruiting token replay with a stronger candidate identity/re-entry model.
2. Remove or hard-anonymize leaderboard/ranking access for recruiting candidates.
3. Publish and implement retention rules for chat logs, anti-cheat events, submissions, and candidate data.
4. Separate recruiting/exam/contest behavior more explicitly instead of relying on global + implicit mode resolution.
5. Keep describing anti-cheat honestly as telemetry, not proctoring.
6. Do not market the platform as exam/public-contest ready until the operational proof story is stronger.

## Short version
JudgeKit is **good and real**.
It is also still a **powerful beta**, not a safely boring high-stakes platform.
