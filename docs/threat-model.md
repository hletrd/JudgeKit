# Threat Model

_Last updated: 2026-07-22_

## Purpose

This document defines the security threat model for JudgeKit as an online judge platform used for:

- recruiting coding tests
- student assignments
- formal exams
- programming contests

It is intentionally conservative. It describes both:
1. the intended security posture
2. the current risk areas that must be addressed before high-stakes rollout

---

# 1. Security objectives

JudgeKit should preserve:

## 1.1 Confidentiality
Protect:
- user credentials
- API keys
- provider/LLM secrets
- student/candidate submissions
- unpublished problems and test cases
- anti-cheat data
- private uploads
- operational secrets and judge auth tokens

## 1.2 Integrity
Protect:
- submission contents and verdicts
- contest/exam timing state
- leaderboard correctness
- problem/test case definitions
- role/capability enforcement
- audit records
- judge-worker claim/finalization behavior

## 1.3 Availability
Protect:
- submission pipeline
- judge worker operation
- contest pages / leaderboards
- exam submission windows
- admin controls needed during incidents

## 1.4 Fairness
Protect against:
- unauthorized AI assistance
- access to hidden test cases or private problems
- candidate/student data leakage
- misleading anti-cheat claims
- inconsistent scoring or partial state updates

---

# 2. System overview

JudgeKit includes:

- Next.js application server
- PostgreSQL database
- Rust judge worker
- Docker-based execution sandbox
- code similarity sidecar
- admin/plugin system
- AI assistant/chat widget
- anti-cheat telemetry system

---

# 3. Trust boundaries

## 3.1 Browser ↔ App
Untrusted client input enters through:
- form submissions
- API requests
- file uploads
- anti-cheat events
- AI chat messages

## 3.2 App ↔ Database
The database is trusted for persistence but must be assumed readable in a breach scenario.

## 3.3 App ↔ Judge worker
Judge worker communication is high-trust and high-impact. Compromise here may affect grading integrity or host/container safety.

## 3.4 Judge worker ↔ Docker daemon
This is the highest-risk runtime boundary. Misconfiguration can turn sandbox escape into host compromise.

## 3.5 Admin/plugin system ↔ external AI providers
Provider credentials and prompts cross an external trust boundary.

## 3.6 Operator/admin ↔ production data
Admins are powerful and must be treated as privileged insiders with accidental or malicious misuse potential.

---

# 4. Assets to protect

## Critical assets
- password hashes
- session tokens
- admin API keys
- judge auth token
- worker secret tokens
- LLM/provider API keys
- hidden test cases
- submission source code
- exam timing/session state
- leaderboard and scoring state

## Sensitive assets
- anti-cheat events
- chat logs
- private uploads
- audit logs
- candidate/student personally identifiable information

---

# 5. Threat actors

## 5.1 Unauthenticated external attacker
Goal:
- gain access
- enumerate users/resources
- abuse exposed endpoints
- exploit configuration weaknesses

## 5.2 Authenticated low-privilege user
Examples:
- student
- candidate
- contest participant

Goal:
- access another user’s data
- gain unfair advantage
- bypass restrictions
- abuse AI/help systems
- tamper with timing or contest flows

## 5.3 Privileged insider
Examples:
- admin
- instructor
- operator

Goal:
- accidental leakage
- overreach
- misuse of access to sensitive data
- improper secret handling

## 5.4 Malicious submission author
Goal:
- escape sandbox
- exhaust resources
- compromise worker or host
- influence other submissions or judge results

## 5.5 Compromised worker/app container
Goal:
- pivot into Docker host
- tamper with judging
- extract secrets
- disrupt service

---

# 6. Threat assumptions

## Assumptions
- browsers and clients are untrusted
- all request parameters and payloads are untrusted
- uploaded files are untrusted
- submissions are hostile by default
- database contents may be exposed in a breach
- production admins are trusted operationally but still represent insider risk
- anti-cheat client-side telemetry is bypassable

## Non-assumptions
We do **not** assume:
- client anti-cheat can prevent cheating
- prompt rules alone can prevent AI misuse
- Docker alone is a sufficient guarantee without careful hardening
- a passing dependency audit equals real security

---

# 7. High-level threat categories

## 7.1 Authentication and session threats
- credential stuffing / brute force
- stolen session token reuse
- session invalidation failure
- trusted-host / callback abuse
- weak secret management

## 7.2 Authorization threats
- broken object-level access control
- students/candidates accessing others’ files or submissions
- instructors/admins overexposed to unnecessary private data
- plugin/admin endpoints bypassing intended restrictions

## 7.3 Secret exposure threats
- plaintext storage of API keys
- plaintext storage of provider secrets
- secrets in logs/audit payloads
- secrets in backups or exports

## 7.4 Data integrity threats
- non-atomic grading writes
- stale-claim race conditions
- partial leaderboard updates
- incorrect rejudge flow
- inconsistent contest timing state

## 7.5 Sandbox and runtime threats
- command injection via compile/run config
- Docker breakout attempts
- host resource exhaustion
- unsafe Docker daemon exposure
- judge worker compromise

## 7.6 Fairness threats
- AI assistant available in restricted contexts
- standalone compiler usable during exams/recruiting
- hidden test leakage
- misleading anti-cheat claims
- similarity checking silently not running

## 7.7 Availability threats
- queue flooding
- excessive judge resource consumption
- similarity jobs causing contention
- anti-cheat/event spam
- chat widget abuse
- worker health degradation

---

# 8. Current-state risk notes

These are the most important currently known risk areas.

## 8.1 Plaintext secret handling
Current concern:
- admin API keys are too directly exposed
- provider secrets are too directly stored in plugin config

Risk:
- DB leak becomes immediate credential compromise

Required direction:
- hash API keys
- encrypt provider secrets at rest (but see §8.7 for the chat-widget exception)

## 8.2 Broken access control on private files
Current concern:
- file read path needs stronger ownership/permission enforcement
- cache policy for private content is too permissive

Risk:
- authenticated users may access data they should not see
- private data may be cached too broadly

Required direction:
- enforce per-file authz
- split public/private cache policy

## 8.3 Fake transaction helper in critical flows
Current concern:
- a passthrough “transaction” helper is used in multi-step operations

Risk:
- partial writes
- grading inconsistency
- contest integrity issues

Required direction:
- use real DB transactions for critical write flows

## 8.4 Async rate-limit misuse
Current concern:
- async rate-limit helper is used incorrectly in multiple locations

Risk:
- rate limiting may silently fail
- abuse controls become unreliable

Required direction:
- fix all call sites and add tests

## 8.5 Anti-cheat overclaim risk
Current concern:
- anti-cheat is largely client-side telemetry

Risk:
- operators may treat weak signals as proof
- users may be misled about protection strength

Required direction:
- explicitly position anti-cheat as telemetry/signals, not certainty

## 8.6 AI fairness risk
Current concern:
- AI is too easy to leave enabled in sensitive contexts

Risk:
- unfair help during recruiting, exams, contests

Required direction:
- mode-based restrictions
- AI off by default in high-stakes modes

## 8.7 Accepted risk: plaintext chat-widget provider keys

Decision (owner, 2026-07-22):
- the chat-widget plugin's provider API keys (`openaiApiKey`, `claudeApiKey`,
  `geminiApiKey`, `openrouterApiKey`) are stored **plaintext at rest** — they are
  deliberately not AES-256-GCM encrypted (`src/lib/plugins/secrets.ts`)

Rationale:
- the symmetric encryption key would live on the same host as the database, so
  at-rest encryption is judged low value against this threat model
- this is a scoped exception: it applies **only** to chat-widget provider keys.
  System-settings secrets (`hcaptchaSecret`, `smtpPass`) remain encrypted

Retained protections:
- response redaction — keys are never echoed to the browser
  (`redactPluginConfigForRead`) and are `[REDACTED]` in audit logs
  (`redactPluginConfigForAudit`)
- legacy `enc:v1:` ciphertext rows are still decrypted on read for backward
  compatibility

Residual exposure (accepted):
- a database-only leak (backup / `pg_dump`, read replica, SQL injection) now
  exposes these provider keys in cleartext, without needing the host's
  encryption key. Mitigation is operational: protect DB backups/replicas and
  rotate provider keys if a DB leak is suspected

---

# 9. Threat scenarios

## 9.1 Student/candidate attempts to access another user’s private upload
**Impact:** High  
**Likelihood:** Medium  
**Category:** Broken access control

Mitigations required:
- strict file ownership/capability checks
- no public cache headers on private files
- regression tests for IDOR

---

## 9.2 Database leak exposes API keys and provider secrets
**Impact:** Critical  
**Likelihood:** Medium  
**Category:** Secret exposure

Mitigations required:
- hash API keys
- encrypt provider secrets
- rotate exposed secrets
- redact sensitive logs

Note: chat-widget provider keys are a deliberate exception — stored plaintext at
rest by owner decision (§8.7). For those keys the residual DB-leak exposure is
accepted; response redaction and key rotation are the compensating controls.

---

## 9.3 Judge result finalization partially succeeds
**Impact:** Critical  
**Likelihood:** Medium  
**Category:** Integrity

Example:
- submission status updated
- result rows not updated
- leaderboard/audit state becomes inconsistent

Mitigations required:
- real transactions
- failure-path tests
- reconciliation tooling if needed

---

## 9.4 Malicious submission attempts sandbox escape
**Impact:** Critical  
**Likelihood:** Medium  
**Category:** Runtime compromise

Mitigations required:
- minimal worker privileges
- Docker hardening
- seccomp/profile review
- daemon exposure minimization
- resource limits
- host isolation assumptions documented

---

## 9.5 Candidate/student uses AI assistant in a restricted setting
**Impact:** High  
**Likelihood:** High if defaults are permissive  
**Category:** Fairness

Mitigations required:
- explicit platform modes
- AI off by default in recruiting/exam/contest
- compiler restrictions where appropriate

---

## 9.6 Similarity check silently does not run on a large contest
**Impact:** High  
**Likelihood:** Medium  
**Category:** Fairness / observability

Mitigations required:
- explicit run status
- visible warnings when skipped/partial
- background execution or scaling strategy

---

## 9.7 Privileged insider accesses candidate/student chat logs without clear policy
**Impact:** High  
**Likelihood:** Medium  
**Category:** Privacy / insider risk

Mitigations required:
- role-based access boundaries
- retention policy
- explicit notice where required
- audit logging for sensitive access

---

# 10. Existing mitigations worth preserving

These are positive controls already present or partially present and should be preserved during refactors.

- credential-based auth with password hashing
- CSRF validation flow
- CSP and secure cookie logic
- login rate limiting
- sanitization of stored/rendered HTML
- audit logging patterns
- worker claim-token design
- bounded tool access in AI assistant
- disabled-network Docker execution model
- judge resource/time/memory limits

These are useful foundations, but they do not eliminate the current high-priority gaps.

---

# 11. Recommended security posture by deployment type

## Homework / assignments
Acceptable after:
- secret handling fixes
- file auth fixes
- transaction safety on grading flow
- typecheck/test health restored

## Recruiting
Acceptable only after:
- homework baseline
- recruiting mode
- AI disabled
- compiler restricted
- privacy/retention policy published

## Exams
Acceptable only after:
- recruiting baseline
- exam mode
- AI disabled
- compiler disabled
- anti-cheat wording corrected
- dry-run exam succeeds

## Contests
Acceptable only after:
- exam-relevant integrity baseline
- contest mode
- load testing
- worker recovery proof
- explicit similarity status
- dry-run contest succeeds

---

# 12. Security priorities

## P0
- remove plaintext key exposure
- encrypt provider secrets
- fix private file auth/cache
- replace fake transactions in critical flows
- fix async rate-limit misuse

## P1
- mode-based restrictions
- AI off by default in high-stakes modes
- compiler restrictions
- anti-cheat telemetry wording
- similarity visibility
- judge boundary hardening

## P2
- docs alignment
- operator playbooks
- privacy and retention refinement
- threat-model review after major architecture changes

---

# 13. Security review checklist for future changes

Any new feature touching auth, secrets, uploads, grading, exams, contests, or AI should answer:

- [ ] What assets does this feature expose?
- [ ] What roles can access it?
- [ ] What object-level authorization is required?
- [ ] What secrets does it handle?
- [ ] Are writes atomic?
- [ ] Can this affect fairness?
- [ ] Can this be abused for resource exhaustion?
- [ ] What logs/audit entries are needed?
- [ ] What tests prove the security claim?

---

# 14. Signoff

## Security owner signoff
- [ ] threat model reviewed for current release
- [ ] P0 items complete or explicitly waived
- [ ] deployment use case is approved

**Name:** ____________________  
**Date:** ____________________

## Product/ops signoff
- [ ] release mode matches intended use case
- [ ] user-facing copy does not overclaim protections
- [ ] rollout plan and incident owner are defined

**Name:** ____________________  
**Date:** ____________________
