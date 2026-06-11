# Adversarial security review — 2026-04-12

## Scope
Fresh attacker-minded review of the current JudgeKit repository with emphasis on:
- recruiting identity and candidate isolation
- rankings / privacy leaks
- contest/exam integrity
- AI/chat data handling
- privileged infrastructure boundaries

## Security posture summary
JudgeKit is materially better than a typical hobby judge:
- credential auth is not naive
- secrets handling has been hardened
- admin/audit surfaces are real
- high-stakes AI/compiler restrictions exist
- the repo openly documents risk

But for the exact use cases you named — **recruiting, exams, and contests** — the remaining weaknesses are concentrated in the worst possible places: **identity, privacy, fairness, and live-event integrity**.

## Severity summary
- **HIGH:** 2
- **MEDIUM:** 4
- **LOW:** 1

---

## HIGH

### H1. Recruiting tokens are replayable bearer credentials
**Evidence**
- Already-redeemed invitations are explicitly allowed to re-enter with the same token (`src/lib/assignments/recruiting-invitations.ts:216-230`).
- The auth layer accepts the recruiting token directly as a login credential (`src/lib/auth/recruiting-token.ts:31-78`).
- The candidate obtains it from a URL path token and the client replays it into `signIn("credentials", { recruitToken: token })` (`src/app/(auth)/recruit/[token]/recruit-start-form.tsx:19-33`).

**Attack story**
- A candidate forwards the link.
- A recruiter accidentally pastes the link into a shared channel.
- Browser history, logs, screen recordings, or proxies expose the URL.
- Anyone holding the token can become that candidate again.

**Impact**
- Candidate impersonation
- weak non-repudiation
- poor hiring integrity
- post-hoc dispute risk (“who actually took this test?”)

**Why I rate this high**
This is not just a theoretical security smell. It directly undermines the trustworthiness of the recruiting workflow.

**Remediation**
- Make the invite URL a one-time claim, not a long-lived login secret.
- After first claim, move to a stronger re-entry model: email magic link, passkey, TOTP, device-bound session, or recruiter-issued reset.
- Expire/rotate the original token immediately after claim.

---

### H2. Recruiting participants can still learn identities and standings they should not see
**Evidence**
- Candidate/student contest page renders the leaderboard by default (`src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx:354-373`).
- The leaderboard API intentionally avoids anonymizing recruiting-mode users (`src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:55-73`).
- The problem page hides the rankings button in recruiting mode, but the route itself is not locked down and reveals usernames/names/performance for accepted solutions (`src/app/(dashboard)/dashboard/problems/[id]/page.tsx:223-231` vs `src/app/(dashboard)/dashboard/problems/[id]/rankings/page.tsx:40-89`, `:114-156`).

**Attack story**
- A candidate in recruiting mode opens the contest page and inspects the leaderboard.
- Or they manually browse to `/dashboard/problems/<id>/rankings`.
- They learn who else solved the task, relative efficiency, memory use, and code length.

**Impact**
- candidate privacy leak
- unfair strategic behavior during an assessment
- avoidable recruiter/legal trust issues

**Why I rate this high**
This is a direct breach of recruiting isolation and can happen without any exotic exploit.

**Remediation**
- Disable leaderboard exposure entirely for recruiting candidates unless there is a very explicit anonymous design.
- Block problem rankings for recruiting users at the route level, not just the button level.
- Add E2E coverage for these candidate-isolation guarantees.

---

## MEDIUM

### M1. Exam/contest integrity still depends on a single web app instance
**Evidence**
- The README still warns that contest SSE connection caps and anti-cheat heartbeat deduplication are single-instance only (`README.md:218-227`).

**Attack / failure story**
This is more an availability/integrity weakness than a direct exploit:
- a busy contest or exam window stresses the single app instance
- ops scales the app naively
- realtime behavior becomes inconsistent or unavailable

**Impact**
- broken live updates
- inconsistent monitoring
- lower confidence during the exact moments when operators need stability

**Remediation**
- implement and prove shared realtime coordination
- or keep this product explicitly out of high-stakes live-event claims

---

### M2. Anti-cheat signals are easy to evade and should not be treated as proctoring
**Evidence**
- Client monitor logs `tab_switch`, `blur`, `copy`, `paste`, `contextmenu` and stores pending events in `localStorage` for retry (`src/components/exam/anti-cheat-monitor.tsx:45-185`).

**Attacker view**
A motivated cheater can:
- use a second device
- use another browser/session setup
- rely on collaboration outside the monitored page
- avoid generating meaningful client-side signals

**Impact**
- false confidence if marketed too strongly
- disputes with students/candidates
- weak evidence quality in disciplinary situations

**Remediation**
- message this as integrity telemetry, not strong anti-cheat
- require stronger operational/policy controls for actual exam-grade use

---

### M3. Chat logs are stored and readable by privileged users, but retention/policy is unfinished
**Evidence**
- User and assistant messages are stored in `chat_messages` (`src/app/api/v1/plugins/chat-widget/chat/route.ts:163-201`).
- Admins with `system.chat_logs` can fetch session lists and full transcripts (`src/app/api/v1/admin/chat-logs/route.ts:9-68`).
- The roadmap still marks retention/privacy policy work as incomplete (`docs/remediation-roadmap.md:334-348`).
- Audit events have pruning (`src/lib/audit/events.ts:171-195`), but I did not find equivalent chat-log pruning.

**Attacker / insider view**
A malicious insider or over-broad role holder gains a searchable window into student/candidate conversations.

**Impact**
- privacy harm
- compliance exposure
- recruiter trust erosion

**Remediation**
- add explicit retention windows and automated pruning
- reduce who can access transcripts
- document candidate/student notice and internal handling rules

---

### M4. Mode resolution is still policy-heavy and easy to misunderstand
**Evidence**
- One global platform mode plus context-derived overrides controls major behavior (`src/lib/platform-mode.ts:11-21`, `src/lib/platform-mode-context.ts:54-85`).
- Assignment mode is inferred rather than explicitly declared as exam vs contest (`src/lib/platform-mode-context.ts:36-52`).

**Attacker / operator view**
Misconfiguration is a practical security issue in high-stakes systems. Confused operators create accidental exposure.

**Impact**
- wrong surface shown to wrong user type
- harder reasoning about whether restrictions are truly active

**Remediation**
- move toward explicit per-assignment/event modes
- surface effective mode clearly in admin/instructor UI
- add tests for boundary cases, especially recruiting + contest + problem access

---

### M5. The judge worker remains a privileged trust boundary
**Evidence**
- Production deploy still routes Docker authority through the judge worker via `DOCKER_HOST=tcp://docker-proxy:2375` (`docker-compose.production.yml:64-76`, `:106-138`).

**Attacker view**
This is not a criticism of the feature itself; it is a reminder of where the crown jewels are.
If I were trying to turn an application compromise into infrastructure impact, I would look hardest at the worker and its container-launch path.

**Impact**
- worker compromise would be a high-consequence event
- this component must be operated like privileged infra, not a generic app service

**Remediation**
- keep hardening the worker surface
- isolate it operationally
- log and alert aggressively around worker-side anomalies

---

## LOW

### L1. Your own readiness docs are more conservative than many operators will want — and they are probably right
**Evidence**
- The repo still says GO for assignments/cautious recruiting, but NO-GO for formal exams and public/high-stakes contests (`docs/go-no-go-memo.md:21-29`, `:127-140`).

**Why this matters**
This is not a flaw in the docs. It is a warning against wishful thinking.
The safest mistake here would be to respect that caution, not to overrule it too early.

---

## Threat scenarios I would worry about most

### Candidate threat
- receives or steals another candidate's recruiting link
- reuses it to impersonate or continue their session
- checks leaderboard/rankings to benchmark progress against others

### Insider / privileged misuse threat
- accesses chat logs without a clear operational need
- retains candidate/student data longer than expected
- over-claims anti-cheat evidence quality

### Reliability / event-integrity threat
- live contest/exam load hits the single app instance
- operators scale incorrectly or hit instability
- monitoring/realtime behavior becomes the weak link

## Final security verdict
For **coursework**, the current security posture is acceptable.
For **internal recruiting**, it is close, but not yet clean enough because of the recruiting-token and privacy issues.
For **formal exams** and **serious contests**, I would still say **not ready**.

## Security priority order
1. Eliminate replayable recruiting-token login.
2. Remove recruiting candidate access to leaderboards/problem rankings.
3. Implement and document retention/access policy for chat logs and related sensitive data.
4. Keep contest/exam claims conservative until shared realtime coordination is implemented and proven.
5. Continue treating the judge worker as the highest-trust component in the stack.
