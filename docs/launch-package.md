# Launch Package

_Last updated: 2026-04-04_

## Purpose

This document is the executive index for the JudgeKit launch-readiness package.

It is intended to support go/no-go decisions for using JudgeKit for:

- recruiting coding tests
- student assignments
- formal exams
- programming contests

This package is deliberately conservative. It assumes that fairness, security, and grading integrity matter more than feature breadth.

---

# Package contents

This launch package consists of the following companion documents:

1. **Remediation roadmap**  
   `docs/remediation-roadmap.md`

2. **Release readiness checklist**  
   `docs/release-readiness-checklist.md`

3. **Threat model**  
   `docs/threat-model.md`

4. **Go / no-go memo**
   `docs/go-no-go-memo.md`

Together, these documents answer:

- what is currently strong
- what is currently unsafe
- what must be fixed first
- what can launch in what order
- what evidence is required before a high-stakes rollout
- what the current verified launch decision is

---

# Executive summary

## Current recommendation

### Do **not** use the current main branch as-is for:
- recruiting coding tests
- formal exams
- serious/public programming contests

### Possible near-term use after priority fixes:
- low-stakes homework / assignments
- internal practice environments
- internal pilot deployments

---

# Current branch status snapshot

This package is based on the current review state of the repository.

## Observed concerns
- large TypeScript failure count
- failing security/unit baseline
- plaintext or overly-direct secret handling concerns
- broken or insufficient authorization on private file access
- fake transaction helper used in critical flows
- high-stakes feature boundaries not yet hard enough
- anti-cheat is best treated as telemetry, not proof

## Positive signals
- strong product breadth
- real multi-role platform thinking
- distributed judge-worker architecture
- existing security-aware building blocks:
  - auth hardening
  - CSP
  - CSRF checks
  - sanitization
  - audit patterns
  - rate limiting

---

# Recommended rollout order

## Phase order
1. **Homework / low-stakes assignments**
2. **Internal recruiting pilot**
3. **Internal contest**
4. **Formal exam**
5. **High-stakes/public contest**

## Why this order
This order minimizes:
- fairness risk
- privacy risk
- reputational risk
- operational risk

It also aligns the current product shape with the easiest safe first use case.

---

# Use-case recommendation matrix

| Use case | Current recommendation | Conditions to launch |
|---|---|---|
| Homework / assignments | Not yet, but closest | P0 security + integrity fixes, grading safety, clean verification baseline |
| Recruiting coding tests | No | Recruiting mode, AI disabled, candidate privacy policy, strong authz and secret handling |
| Formal exams | No | Exam mode, AI disabled, compiler disabled, timing/session correctness, dry-run success |
| Programming contests | No | Worker recovery proof, leaderboard correctness, explicit similarity behavior, load testing |

---

# Priority themes

## 1. Stop-ship security
- remove plaintext key exposure
- encrypt provider secrets
- fix private file authorization and caching
- review judge trust boundary

## 2. Grading integrity
- replace fake transactions with real DB transactions
- fix rate-limit misuse
- ensure judge finalization is atomic

## 3. Engineering trust
- reduce TypeScript errors to zero
- make security suite pass
- enforce release gates in CI

## 4. Product safety modes
- homework mode
- exam mode
- contest mode
- recruiting mode

## 5. Fairness controls
- AI off by default in high-stakes modes
- standalone compiler restricted where necessary
- anti-cheat messaging honest about limitations

---

# Required launch artifacts

Before any real high-stakes rollout, the following must exist and be current:

- [ ] remediation roadmap
- [ ] release readiness checklist
- [ ] threat model
- [ ] go / no-go memo
- [ ] deployment/runback/rollback docs
- [ ] privacy and retention policy
- [ ] incident owner and operational runbook
- [ ] verification evidence from build/test/load checks

---

# Immediate next actions

## Recommended this week
1. Fix API key handling
2. Encrypt provider secrets
3. Fix file authorization and cache policy
4. Fix unawaited async rate-limit calls
5. Begin replacing fake transactions on grading-critical paths
6. Start TypeScript-zero campaign
7. Stabilize security/unit test baseline

## Do not do first
- public rollout
- formal exam launch
- public contest launch
- recruiting launch on shared classroom UX
- security messaging that overstates anti-cheat strength

---

# Ownership model

## Security owner
Responsible for:
- secret handling
- file authz
- worker/app trust boundary
- threat model review

## Backend/platform owner
Responsible for:
- transactions
- typecheck health
- rate-limit correctness
- test health
- similarity correctness

## Product owner
Responsible for:
- mode design
- AI policy
- anti-cheat framing
- use-case-specific launch decision

## Ops/SRE owner
Responsible for:
- deployment validation
- backup/restore
- alerts/runbooks
- dry-run exercises
- load testing

---

# Decision framework

## Go only when:
- security baseline is acceptable
- grading integrity is proven
- release checklist is green
- use-case-specific restrictions are enabled
- dry-run evidence exists where required

## No-go if:
- private data can leak across users
- critical secrets remain too directly exposed
- grading writes can partially fail
- AI remains available in restricted contexts
- operational recovery is unproven
- build/test baseline is still red

---

# Review cadence

This launch package should be re-reviewed:
- before any external pilot
- before any recruiting deployment
- before any exam window
- before any contest with reputational consequences
- after any major auth/judge/plugin/ops architecture change

---

# Final recommendation

JudgeKit has the shape of a serious platform, but it currently looks more like a **powerful beta** than a safely boring production system for high-stakes evaluation.

## Best path forward
- make it solid for assignments first
- build a restricted recruiting mode second
- harden for exams and contests only after integrity and operational proof exist

---

# Signoff

## Security
- [ ] reviewed
- [ ] approved
- [ ] blocked

**Name:** ____________________  
**Date:** ____________________

## Backend / platform
- [ ] reviewed
- [ ] approved
- [ ] blocked

**Name:** ____________________  
**Date:** ____________________

## Product / program owner
- [ ] reviewed
- [ ] approved
- [ ] blocked

**Name:** ____________________  
**Date:** ____________________

## Ops / SRE
- [ ] reviewed
- [ ] approved
- [ ] blocked

**Name:** ____________________  
**Date:** ____________________
