# Release Readiness Checklist

_Last updated: 2026-04-14_

## Purpose

This checklist is the final go/no-go gate before launching JudgeKit for any real user-facing evaluation workflow.

Use this document for:
- internal pilots
- recruiting coding tests
- student assignments
- exams
- contests

---

# 1. Universal release gates

These must pass for **any** release.

## 1.1 Build and verification
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] unit tests pass with coverage thresholds met (`npm run test:unit:coverage`)
- [ ] component tests pass (`npm run test:component`)
- [ ] integration tests pass (`npm run test:integration`)
- [ ] security-focused tests pass (`npm run test:security`)
- [ ] judge worker / code-similarity / rate-limiter Rust tests pass
- [ ] no known critical failing E2E paths
- [ ] E2E full regression passes locally (`PLAYWRIGHT_PROFILE=full`)
- [ ] E2E smoke subset passes against staging (`PLAYWRIGHT_PROFILE=smoke`)

## 1.2 Security baseline
- [ ] API keys are not stored/listed in plaintext
- [ ] provider secrets are encrypted at rest
- [ ] uploaded file authorization is enforced correctly
- [ ] private files are not publicly cacheable
- [ ] judge auth/token handling has been reviewed
- [ ] no critical/high unresolved security findings remain open

## 1.3 Data integrity
- [ ] critical grading/judging writes use real DB transactions
- [ ] rejudge flow is transaction-safe
- [ ] partial-write failure modes have been tested
- [ ] stale-claim recovery behavior is verified

## 1.4 Operational readiness
- [ ] deployment instructions match actual runtime architecture
- [ ] rollback procedure exists
- [ ] database backup procedure exists
- [ ] restore procedure exists
- [ ] incident owner is defined
- [ ] alerting/monitoring basics are active

## 1.5 Product truthfulness
- [ ] docs match runtime behavior
- [ ] admin UI does not overstate protections
- [ ] known limitations are documented
- [ ] use-case mode is explicit (homework / exam / contest / recruiting)

## 1.6 Data governance
- [ ] retention windows reviewed and configured for deployment context (see `docs/data-retention-policy.md`)
- [ ] legal hold mechanism tested if needed (`DATA_RETENTION_LEGAL_HOLD`)
- [ ] transcript access governed — `system.chat_logs` restricted to minimum admin set (see `docs/transcript-access-policy.md`)
- [ ] sanitized exports used for sharing; full-fidelity backups restricted to disaster recovery
- [ ] chat completion status tracked — partial/aborted assistant responses distinguishable from complete ones

---

# 2. Homework / assignments release gates

## Required
- [ ] all universal gates pass
- [ ] assignment submission flow is regression tested
- [ ] score/judging status transitions are verified
- [ ] student dashboard and problem flow work end-to-end
- [ ] AI behavior is intentional and documented
- [ ] instructor assignment visibility/access rules are verified

## Nice to have
- [ ] assignment analytics validated
- [ ] student detail pages validated
- [ ] similarity checks validated for expected class size

## No-go conditions
- [ ] grading can partially fail
- [ ] student data can leak across users
- [ ] assignment access control is unproven

---

# 3. Recruiting coding test release gates

## Required
- [ ] all universal gates pass
- [ ] recruiting mode is enabled
- [ ] AI assistant is disabled in recruiting mode
- [ ] auto AI review is disabled in recruiting mode
- [ ] compiler page is disabled or restricted in recruiting mode
- [ ] candidate-facing UX is stripped of school/classroom concepts
- [ ] candidate privacy notice exists
- [ ] retention policy for candidate data exists
- [ ] reviewer/admin access to candidate data is documented
- [ ] allowed languages list is intentionally selected

## Nice to have
- [ ] separate branding/domain for recruiting deployment
- [ ] candidate instructions reviewed by recruiting team
- [ ] recruiter/candidate dry run completed

## No-go conditions
- [ ] candidates can access AI help
- [ ] candidate uploads/files are not access-controlled
- [ ] classroom/admin concepts dominate candidate UX
- [ ] retention/privacy policy is missing

---

# 4. Exam release gates

## Required
- [ ] all universal gates pass
- [ ] exam mode is enabled
- [ ] AI assistant is disabled in exam mode
- [ ] compiler page is disabled in exam mode
- [ ] exam session timing/window rules are regression tested
- [ ] submission cutoffs are verified
- [ ] anti-cheat wording is reviewed and accurate
- [ ] exam integrity review model is accepted (`docs/exam-integrity-model.md`)
- [ ] anti-cheat logging works in target browsers
- [ ] internal dry-run exam completed successfully
- [ ] `bash scripts/check-high-stakes-runtime.sh` passes for the target runtime
- [ ] exam incident runbook exists

## Nice to have
- [ ] role-specific exam support handbook exists
- [ ] proctor/instructor response guidelines exist
- [ ] “what to do if judge is delayed” playbook exists

## No-go conditions
- [ ] students can still access AI help
- [ ] compiler page is available
- [ ] deadline or windowing behavior is unproven
- [ ] anti-cheat is marketed as certainty rather than telemetry
- [ ] dry-run exam has not been completed

---

# 5. Contest release gates

## Required
- [ ] all universal gates pass
- [ ] contest mode is enabled
- [ ] AI assistant is disabled in contest mode
- [ ] worker stale/reclaim behavior is tested
- [ ] leaderboard correctness is tested
- [ ] rejudge flow is tested
- [ ] similarity check behavior is explicit and non-silent
- [ ] queue/load test completed at expected concurrency
- [ ] internal dry-run contest completed successfully
- [ ] contest operations runbook exists

## Nice to have
- [ ] freeze/unfreeze leaderboard behavior tested
- [ ] multi-worker deployment tested
- [ ] worker removal/recovery drill completed

## No-go conditions
- [ ] judging finalization is not transaction-safe
- [ ] worker recovery is unproven
- [ ] leaderboard correctness is unproven
- [ ] similarity silently skips large contests
- [ ] load test has not been run

---

# 6. Security signoff

## Security reviewer signoff
- [ ] reviewed latest release candidate
- [ ] no critical open security issues
- [ ] no high-risk secret handling regressions
- [ ] access-control review completed for new endpoints/features

**Reviewer:** ____________________  
**Date:** ____________________

---

# 7. Backend/platform signoff

## Backend/platform owner signoff
- [ ] DB migrations reviewed
- [ ] transaction safety reviewed
- [ ] typecheck/test baseline green
- [ ] no known release-blocking backend defects

**Reviewer:** ____________________  
**Date:** ____________________

---

# 8. Ops/SRE signoff

## Ops/SRE signoff
- [ ] deployment tested in target environment
- [ ] backups/restores verified
- [ ] monitoring and alerts active
- [ ] monitoring baseline reviewed (`docs/monitoring.md`)
- [ ] rollback plan available
- [ ] runbooks accessible to operators
- [ ] admin security operations guidance reviewed (`docs/admin-security-operations.md`)

**Reviewer:** ____________________  
**Date:** ____________________

---

# 9. Product/owner signoff

## Product/use-case owner signoff
- [ ] selected launch mode is correct
- [ ] feature restrictions match use case
- [ ] privacy/retention expectations are acceptable
- [ ] high-stakes validation matrix reviewed (`docs/high-stakes-validation-matrix.md`)
- [ ] judge worker incident runbook is reviewed for the target deployment (`docs/judge-worker-incident-runbook.md`)
- [ ] operator incident runbook is reviewed for backup/credential scenarios (`docs/operator-incident-runbook.md`)
- [ ] user-facing copy matches real behavior
- [ ] dry run completed where required

**Reviewer:** ____________________  
**Date:** ____________________

---

# 10. Final launch decision

## Launch target
- [ ] Homework / assignments
- [ ] Recruiting coding test
- [ ] Exam
- [ ] Contest

## Decision
- [ ] GO
- [ ] NO-GO

## Notes
____________________________________________________________

____________________________________________________________

____________________________________________________________
