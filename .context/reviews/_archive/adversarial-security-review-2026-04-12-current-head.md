# Adversarial security review — 2026-04-12 (current HEAD)

## Scope
Fresh attacker-minded review of the current HEAD after the 2026-04-12 remediation and follow-up continuation work.

Focus areas:
- recruiting identity and recovery
- recruiting privacy/isolation
- chat/anti-cheat/submission retention
- exam/contest integrity limits
- worker trust boundary

## Security posture summary
The project is clearly safer than it was before the 2026-04-12 remediation lane.

Most importantly:
- recruiting invite URLs are no longer reusable bearer logins
- recruiting candidates are blocked from standings/rankings that should not be visible to them
- sensitive operational data now has real retention automation
- operator-facing truth about high-stakes limits is better documented

That said, the remaining risks are still concentrated in the same places that matter most for your target use cases:
- high-assurance candidate identity
- live-event integrity under scaling pressure
- privileged insider access to sensitive data
- privileged worker-boundary impact

## Updated severity summary
- **HIGH:** 1
- **MEDIUM:** 4
- **LOW:** 2

## HIGH

### H1. Recruiting identity is improved, but still not strong enough for high-assurance hiring
**Evidence**
- Redeemed invite links now require a resume code or current session (`src/lib/assignments/recruiting-invitations.ts:242-270`, `src/app/(auth)/recruit/[token]/page.tsx:99-117`).
- First claim now creates a resume-code-backed recovery path (`src/lib/assignments/recruiting-invitations.ts:299-340`, `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:46-59`).
- Admins can rotate lost resume codes (`src/lib/assignments/recruiting-invitations.ts:155-175`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:27-50`).

**Why this is still high for serious recruiting**
- This is now much better than link-only replay.
- But it still does not strongly prove the real-world identity of the person taking the test.
- The security model is still based on possession of secrets the candidate or admin controls, not an external verified identity factor.

**Attack / failure story**
- A candidate shares both the invite and resume code.
- An insider mishandles a reset code.
- A compromised machine/session still lets the wrong person continue under the right candidate account.

**Impact**
- not a casual replay flaw anymore, but still not strong non-repudiation
- meaningful risk for external recruiting with real hiring consequences

**Remediation direction**
- add a stronger identity-bound re-entry model if you want serious external hiring assurance
- examples: email magic-link reset to the known candidate mailbox, passkey, TOTP, or explicit recruiter-mediated re-verification

## MEDIUM

### M1. Exams and serious contests still depend on a single web app instance
**Evidence**
- The high-stakes ops guide still treats this as an unresolved constraint (`docs/high-stakes-operations.md:13-17`).

**Why it matters**
This is the biggest unresolved integrity/availability issue for exams and public contests.

**Impact**
- scaling mistakes can still create broken realtime behavior, inconsistent monitoring, or operational confusion during live events

**Remediation direction**
- implement real shared coordination or continue to keep these use cases explicitly out of supported territory

### M2. Anti-cheat is still telemetry, not proof
**Evidence**
- Client-side anti-cheat still relies on browser events like tab switches, blur, copy/paste, and context menus (`src/components/exam/anti-cheat-monitor.tsx:45-185`).
- The ops guide explicitly treats these as review aids, not proof (`docs/high-stakes-operations.md:32-33`).

**Why it matters**
That framing is correct, but it also means this is still not a proctoring system.

**Impact**
- good review signal for coursework or low-friction internal evaluations
- not sufficient for strong exam enforcement

### M3. Privileged staff can still inspect sensitive conversation data
**Evidence**
- Chat messages are stored by default (`src/app/api/v1/plugins/chat-widget/chat/route.ts:163-201`).
- Users with `system.chat_logs` can inspect full transcripts (`src/app/api/v1/admin/chat-logs/route.ts:9-68`).
- Retention and access expectations are now better documented (`docs/privacy-retention.md:14-39`), but the capability remains powerful.

**Why it matters**
This is now a governance concern more than an unbounded-data bug.

**Impact**
- insider misuse or over-broad privilege still matters
- candidate/student trust still depends heavily on role discipline

### M4. Submission retention is now bounded, but deletion policy may still be operationally sensitive
**Evidence**
- Terminal submissions older than 365 days are now pruned automatically (`src/lib/data-retention-maintenance.ts:32-40`, `docs/privacy-retention.md:19-20,31-33`).

**Why it matters**
This closes indefinite retention, but it creates a new policy sensitivity:
- what if an institution needs records for longer?
- what if a hiring dispute or academic appeal needs long-lived evidence?

**Impact**
- operational/policy mismatch is possible if the default is not explicitly reviewed before rollout

**Remediation direction**
- keep export/archive workflow explicit for deployments that need longer evidence retention

### M5. The judge worker remains the highest-consequence trust boundary
**Evidence**
- The ops guide still correctly treats the judge worker as privileged infrastructure (`docs/high-stakes-operations.md:26-30`).

**Why it matters**
If I were looking for the highest-value boundary in the system, this is still it.

**Impact**
- worker compromise would still be a high-consequence event even if the app tier is otherwise well-behaved

**Remediation direction**
- keep worker isolation, monitoring, and operational controls much stricter than ordinary app services

## LOW

### L1. Local Playwright verification is now more honest, but still environment-dependent
**Evidence**
- Local Playwright now uses a dedicated PostgreSQL helper (`playwright.config.ts:49-62`, `package.json:14`, `scripts/playwright-local-webserver.sh`).

**Why it matters**
This is a positive change, but it still depends on a working Docker daemon in the local environment.

**Impact**
- not a product flaw, but still a verification-environment dependency to remember

### L2. The product now documents its limitations more honestly than many teams would be comfortable with
**Evidence**
- High-stakes guide explicitly keeps exams/public contests in the not-yet-ready bucket (`docs/high-stakes-operations.md:7-17`).

**Why it matters**
This is actually a strength. But it also means operators can no longer honestly claim the platform is fully hardened for all stated use cases.

## Threat scenarios I would still worry about most

### Candidate / recruiting threat
- collusion or secret-sharing around invite + resume-code recovery
- weak real-world identity proof in external hiring scenarios
- operational mistakes around reset-code handling

### Insider / privileged misuse threat
- unnecessary access to chat transcripts or sensitive candidate/student records
- poor handling of reset codes or archived/exported evidence

### Reliability / event-integrity threat
- multi-instance or scaling mistakes during exam/contest use
- operational drift between documented high-stakes limits and actual deployment behavior

### Worker-boundary threat
- compromise or misuse of the judge worker / container-launch path remains the highest-consequence technical boundary in the system

## Final security verdict
For **coursework**, the current security posture is acceptable.
For **internal recruiting**, it is now meaningfully stronger and probably acceptable if the stakeholders understand the limits.
For **external recruiting with serious assurance requirements**, it is improved but still not fully high-assurance.
For **formal exams** and **serious public contests**, I would still say **not ready**.

## Bottom line
The biggest obvious recruiting flaws from the earlier review are no longer present in the same form.

That is a real improvement.

But the project still does **not** cross the line into “high-assurance evaluation platform” because the remaining weak points are exactly the ones that matter most in high-stakes settings:
- identity assurance
- live-event integrity at scale
- insider governance
- privileged worker impact
