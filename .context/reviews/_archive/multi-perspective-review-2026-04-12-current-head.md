# Multi-perspective review — 2026-04-12 (current HEAD)

## Scope
Fresh post-remediation review of the current repository state after the 2026-04-12 review-plan execution and follow-up hardening.

This assessment is aimed at your intended uses:
- recruiting coding tests
- student assignments
- exams
- programming contests

Key evidence reviewed included:
- recruiting identity / recovery:
  - `src/lib/assignments/recruiting-invitations.ts:155-175,225-340`
  - `src/lib/auth/config.ts:128-168`
  - `src/lib/auth/recruiting-token.ts:31-79`
  - `src/app/(auth)/recruit/[token]/page.tsx:99-217`
  - `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:10-112`
- recruiting isolation:
  - `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:16-87`
  - `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:184-379`
  - `src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx:41-49`
  - `src/app/(dashboard)/dashboard/problems/[id]/page.tsx:223-230`
- retention / governance:
  - `src/app/api/v1/plugins/chat-widget/chat/route.ts:163-210`
  - `src/app/api/v1/admin/chat-logs/route.ts:9-68`
  - `src/lib/data-retention-maintenance.ts:1-80`
  - `docs/privacy-retention.md:12-39`
- operator / mode clarity:
  - `docs/high-stakes-operations.md:7-36`
  - `src/app/(dashboard)/layout.tsx:68-80`
  - `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:170-204`
  - `src/app/(dashboard)/dashboard/_components/instructor-dashboard.tsx:102-120`
- local verification harness:
  - `package.json:5-25`
  - `playwright.config.ts:49-62`

## Executive verdict

### Honest launch recommendation
- **Student assignments / low-stakes coursework:** **GO**
- **Instructor-managed coursework:** **GO**
- **Internal recruiting pilot:** **GO, with caution**
- **External recruiting with meaningful hiring consequences:** **Conditional GO** — acceptable only if you are comfortable with the remaining identity/ops limitations below
- **Formal exams:** **NO-GO**
- **Public or high-stakes programming contests:** **NO-GO**

## What clearly improved since the last review
These are meaningful, not cosmetic.

1. **Recruiting identity is materially better.**
   - Invite URLs are now effectively **claim-only**, not reusable bearer-login links.
   - First claim requires a candidate-chosen **resume code** (`src/lib/assignments/recruiting-invitations.ts:299-340`, `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:46-59`).
   - Redeemed links no longer authenticate on their own; they now need either the current authenticated session or the resume code (`src/lib/assignments/recruiting-invitations.ts:242-270`, `src/app/(auth)/recruit/[token]/page.tsx:99-117`).
   - Admins can reset lost resume codes without reopening link replay (`src/lib/assignments/recruiting-invitations.ts:155-175`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:27-50`).

2. **Recruiting privacy is materially better.**
   - Recruiting candidates are blocked from the contest leaderboard API (`src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:35-39`).
   - The contest detail page no longer shows them the shared leaderboard (`src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:377-379`).
   - Direct problem-ranking navigation is blocked (`src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx:48-49`).

3. **Retention/governance is materially better.**
   - AI chat logs, anti-cheat events, recruiting invitation records, and terminal submissions now have actual pruning logic, not just policy text (`src/lib/data-retention-maintenance.ts:7-57`).
   - The retention policy is now documented and specific (`docs/privacy-retention.md:14-33`).
   - Admin chat-log access is still privileged, but the handling expectations are more explicit.

4. **Operator truth is better surfaced.**
   - Effective mode is visibly shown in the main dashboard shell (`src/app/(dashboard)/layout.tsx:70-79`).
   - Admin settings now explain the operational effect of the selected mode (`src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:188-203`).
   - The high-stakes operations guide is more honest than before (`docs/high-stakes-operations.md:7-36`).

5. **Instructor UX is slightly better.**
   - The instructor dashboard finally has quick links to groups, contests, submissions, and problem sets (`src/app/(dashboard)/dashboard/_components/instructor-dashboard.tsx:102-120`).
   - This is a real improvement, though still a small one relative to the system’s complexity.

## What is still strong overall
- This is a **serious product**, not a toy project.
- Breadth is excellent: assignments, contests, recruiting, workers, analytics, audit, roles, languages, plugins.
- The codebase is **disciplined**: there is test evidence, remediation history, and a strong habit of documenting truth rather than pretending everything is solved.
- The project is now substantially better aligned with the claim “good for coursework and internal pilots” than it was earlier in the day.

## What is still not good enough

### 1. Recruiting identity is improved, but still not high-assurance identity
This is the biggest remaining recruiting concern.

**Why**
- The system now uses **invite URL + resume code**, which is much better than URL-only replay.
- But it still does **not** verify the real human identity of the candidate in any strong way.
- There is still no email magic-link re-entry, no passkey, no second factor, no verified recruiter-mediated identity challenge.

**What that means in practice**
- For internal recruiting or trusted candidate pools, this may be fine.
- For higher-stakes external recruiting, it is still weaker than a purpose-built assessment identity model.

**My judgment**
- This is no longer a glaring flaw.
- But it is still **not strong enough to call “high-assurance candidate identity.”**

### 2. Exams and serious contests are still blocked by realtime/ops architecture
**Evidence**
- The high-stakes guide still acknowledges the single-app-instance assumption for contest/exam coordination (`docs/high-stakes-operations.md:13-17`).

**Why this matters**
- This is not a classroom-scale problem.
- It is exactly the sort of problem that becomes painful under real exam or contest pressure.
- Until shared coordination is implemented and proven, I would still not treat this as exam/public-contest ready.

### 3. Anti-cheat is still telemetry, not proctoring
**Evidence**
- The client monitor still detects browser-side signals like tab switches, blur, copy/paste, and context menu (`src/components/exam/anti-cheat-monitor.tsx:45-185`).
- The ops guide still correctly frames these as review aids, not proof (`docs/high-stakes-operations.md:32-33`).

**Why this matters**
- This is a good and honest position.
- But if you want real exam integrity, you still need a stronger operational model than this.

### 4. Retention automation is now real, but it may not match every institution’s policy
**Evidence**
- Terminal submissions and grading records older than 365 days are now pruned automatically (`src/lib/data-retention-maintenance.ts:32-40`, `docs/privacy-retention.md:19-20,31-33`).

**Why this matters**
- This closes the “indefinite retention” criticism.
- But it introduces a different strategic question: **is 365 days the right institutional retention window for your users?**
- Some schools or employers may want longer archival retention, export-first workflows, or formal legal hold procedures.

**My judgment**
- Better than indefinite accumulation.
- But this should be treated as an **explicit product-policy choice**, not a universally correct default.

### 5. Instructor/admin usability is still power-user oriented
The product is now more operable than before, but still not easy.

**Instructor view**
- Good power tools.
- Still dense, still operator-ish.
- The new quick actions help, but they do not fundamentally simplify the system.

**Admin view**
- Strong visibility and control.
- Still high blast radius.
- Still expects a technically confident operator.

## Perspective-by-perspective review

### Student perspective
**What works now**
- This is good for assignments and practice.
- The system feels capable and mature enough for everyday coursework.
- Multi-language support remains a major strength.

**What still feels weak**
- It is still one platform trying to be classroom LMS, judge, contest platform, recruiting tool, and exam system.
- Students may still feel the system is “institution-first” rather than “student-first.”

**Verdict**
- **Good for coursework.**
- **Still not exam-grade from the student trust/experience angle.**

### Instructor perspective
**What works now**
- Strong visibility into group activity, submissions, analytics, and recruiting.
- Quick actions improve day-to-day navigation.

**What still feels weak**
- The overall mental model remains heavy.
- Instructors still need to understand a lot of system semantics to operate confidently.

**Verdict**
- **Good for strong instructors.**
- **Still not “simple.”**

### Admin / operator perspective
**What works now**
- Better mode clarity.
- Better retention truth.
- Better high-stakes guidance.

**What still feels weak**
- The system still assumes a technically capable owner/operator.
- Scaling and high-stakes readiness are still sensitive.
- The judge worker is still a privileged trust boundary.

**Verdict**
- **Solid for a technical admin.**
- **Too sharp-edged for a casual ops team.**

### Assistant / AI perspective
**What works now**
- AI remains properly restricted by default in high-stakes modes.
- Retention/access expectations are clearer.

**What still feels weak**
- Chat data is still stored and reviewable by privileged staff (`src/app/api/v1/plugins/chat-widget/chat/route.ts:163-201`, `src/app/api/v1/admin/chat-logs/route.ts:9-68`).
- That is acceptable if policy is clear, but still sensitive for recruiting/exams.

**Verdict**
- **Useful in homework/support contexts.**
- **Still something you must govern tightly.**

### Job applicant / candidate perspective
**What works now**
- Candidate privacy is better.
- Resume-code recovery is better.
- The flow is noticeably more defensible than before.

**What still feels weak**
- It still feels like a recruiting mode layered onto a broader classroom/contest platform.
- Identity assurance is improved, but still not as strong as a dedicated hiring platform could offer.

**Verdict**
- **Good enough for internal or controlled recruiting pilots.**
- **Still only conditional for serious external hiring.**

### Security researcher / attacker perspective
**What got better**
- The easy recruiting-link replay weakness is no longer the obvious first attack.
- Candidate privacy leaks through leaderboards/rankings are now substantially reduced.
- Retention is no longer an indefinite-collection story.

**What I would still probe**
1. Operational mistakes around multi-instance deployment for exams/contests.
2. Admin misuse or over-broad access to stored chat/submission data.
3. Any judge-worker compromise path, because it remains the highest-trust component.
4. Recovery workflow edge cases around recruiting invite lifecycle and resume-code reset handling.

**Verdict**
- The security posture is materially improved.
- The remaining serious concerns are now more **operational and high-stakes-integrity** than obvious everyday web-app negligence.

## Final honesty check by intended use case

### Recruiting coding tests
- **Internal recruiting:** **GO, with caution**
- **External recruiting:** **Conditional GO**
- If you need strong identity assurance, this is still not the last word.

### Student assignments
- **GO**
- This is the strongest fit right now.

### Exams
- **NO-GO**
- Not because the project is bad — because the integrity and realtime model are still not boring enough.

### Programming contests
- **Internal/small:** maybe, with discipline
- **Public/high-stakes:** **NO-GO**

## Bottom line
JudgeKit is now in a meaningfully better state than before.

It is:
- **good for assignments**
- **credible for internal recruiting pilots**
- **still not ready for formal exams or serious public contests**

If I were using one sentence:

> JudgeKit now looks like a strong internal platform with cautious recruiting capability — not yet a fully hardened high-stakes evaluation system.
