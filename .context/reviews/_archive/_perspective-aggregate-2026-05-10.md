# Multi-Perspective Aggregate Review — JudgeKit

**Date:** 2026-05-10
**Scope:** Full codebase reviewed from 6 stakeholder perspectives + security researcher/attacker perspective
**Reviewers:** student-reviewer, instructor-reviewer, job-applicant-reviewer, admin-reviewer, assistant-reviewer, security-reviewer

---

## Cross-Perspective Severity Summary

| Perspective | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-------------|----------|------|--------|-----|-------|
| Student | 7 | 6 | 14 | 8 | 35 |
| Instructor | 4 | 12 | 18 | 8 | 42 |
| Job Applicant | 2 | 7 | 12 | 6 | 27 |
| Admin | 4 | 12 | 14 | 8 | 38 |
| Assistant/TA | 1 | 6 | 11 | 5 | 23 |
| Security Researcher | 2 | 8 | 10 | 7 | 27 |
| **Total** | **20** | **51** | **79** | **42** | **192** |

---

## CRITICAL Findings by Perspective

### Student (7 CRITICAL)
1. **Timer drift risk** — `countdown-timer.tsx:83-96` — Background tab throttling causes exam timer drift; no re-sync with server on refocus
2. **Coercive anti-cheat privacy notice** — `start-exam-button.tsx:45-52` — Dismiss-only privacy notice before exam start; no meaningful consent
3. **Immediate tab-switch warning** — `anti-cheat-monitor.tsx:142-168` — No grace period for accidental tab switches; warning fires on first violation
4. **7-day draft TTL silent expiration** — `problem-submission-form.tsx:89-104` — Auto-save drafts silently deleted after 7 days with no warning
5. **Hidden compile output without explanation** — Submission results UI shows only "Compile Error" without compiler output or how to view it
6. **Silent code snapshot failures** — `anti-cheat-monitor.tsx:203-241` — Snapshot POST failures are `console.warn` only; no retry or user feedback
7. **Timer not announced to screen readers** — `countdown-timer.tsx:112-118` — `aria-live="polite"` on a `<div>` without `role="timer"`; screen readers don't announce time

### Instructor (4 CRITICAL)
1. **No custom validator/checker support** — `create-problem-form.tsx:1-992` — Only `exact` and `float` comparison modes; blocks many real-world problems
2. **No per-student deadline extensions** — Assignment settings have global deadlines only; no accommodation for individual students
3. **Broken "manual" problem type** — `create-problem-form.tsx:106` — Manual grading option exists but has no grading UI or workflow
4. **Status board lacks test case breakdown** — `status-board.tsx` — Shows only overall score, not per-test-case results for debugging

### Job Applicant (2 CRITICAL)
1. **Recruiting session silently signs out existing user** — `recruit/invite/page.tsx` — Accepting a recruiting invite while logged in silently replaces the session without warning
2. **No practice mode for recruiting tests** — Candidates cannot practice with the environment before the real test; first interaction is high-stakes

### Admin (4 CRITICAL)
1. **No deploy rollback mechanism** — `deploy-docker.sh` — No automatic or manual rollback on deploy failure; only forward recovery
2. **No point-in-time recovery (PITR)** — No WAL archiving; DB restore limited to last pg_dump backup
3. **No disaster recovery runbook** — No documented DR procedure; recovery depends on institutional knowledge
4. **Backup verification gap** — Pre-deploy backups are created but never restored/verified for integrity

### Assistant/TA (1 CRITICAL)
1. **No dedicated TA grading view** — TAs use the same submission detail view as instructors with no role-optimized layout or shortcuts

### Security Researcher (2 CRITICAL)
1. **Anti-cheat completely bypassable via direct API calls** — `anti-cheat-monitor.tsx`, `anti-cheat/route.ts` — Client-side only; no browser fingerprinting, challenge-response, or session verification
2. **Judge worker results accepted without cryptographic integrity** — `judge-worker.ts` — No HMAC/signature on judge results; attacker with worker network access can forge results

---

## Cross-Cutting Themes

### Theme 1: Timer and Time Handling (Student + Instructor + Security)
- Multiple perspectives identified timer accuracy as a fairness concern
- Exam timer drift affects students directly; contest scoring cache staleness affects instructors
- Security: time-based race conditions in submission claiming and result fetching

### Theme 2: Anti-Cheat Friction vs. Effectiveness (Student + Job Applicant + Security)
- Students and applicants find anti-cheat overly intrusive with false positives
- Security researcher found it trivially bypassable — worst of both worlds (high friction, low effectiveness)
- Recommendation: Replace client-side-only monitoring with server-side behavioral analysis + optional proctoring integration

### Theme 3: Missing Accommodation Features (Student + Instructor)
- No per-student deadline extensions (instructor CRITICAL)
- No accessibility accommodations (student CRITICAL: screen reader timer, reduced motion)
- No separate sample vs hidden test case semantics (instructor HIGH)
- Platform treats all users identically; no ADA/compliance considerations

### Theme 4: Observability and Operational Gaps (Admin + Security)
- Admin: Missing metrics, health checks, query performance monitoring
- Security: Audit events buffered in memory (can lose on crash); Docker operations not audited
- Both point to the same underlying gap: production operational maturity

### Theme 5: Manual Grading and Feedback (Instructor + Assistant)
- Instructors can't create custom validators (blocks manual grading for many problems)
- Broken "manual" problem type with no UI
- TAs lack a dedicated grading view with rubrics or bulk actions
- Comment/feedback system is basic with no inline code comments

### Theme 6: Code Editor UX (Student + Job Applicant)
- No auto-save in playground mode (student CRITICAL)
- Vim keybindings not available (student MEDIUM)
- Default shortcuts (n/p for problem nav) conflict with Vim (student MEDIUM)
- Raw textarea mode for some languages loses all editor features (student MEDIUM)

---

## Most Impactful Fixes by Stakeholder

### For Students (top 5)
1. Re-sync exam timer with server on tab refocus (`countdown-timer.tsx`)
2. Add auto-save to code editor with configurable TTL
3. Show compiler output by default in error state
4. Add grace period (3-5s) before tab-switch warning fires
5. Export draft expiration time in UI with countdown

### For Instructors (top 5)
1. Add custom validator/checker upload support
2. Implement per-student deadline extensions
3. Build manual grading UI with rubric support
4. Separate sample vs hidden test case semantics
5. Add problem preview before publishing

### For Job Applicants (top 3)
1. Warn before replacing existing session on recruiting invite acceptance
2. Add practice mode / sandbox environment
3. Show computed personal deadline in confirmation dialog

### For Admins (top 5)
1. Document and implement deploy rollback procedure
2. Add WAL archiving for PITR recovery
3. Implement backup verification (automated restore test)
4. Expand metrics endpoint (request latency, DB query perf, pool stats)
5. Add health checks for dependent services (worker, rate-limiter)

### For TAs (top 3)
1. Build dedicated TA grading view with role-optimized layout
2. Add inline code comments in submission review
3. Implement bulk feedback / rubric application

### For Security (top 5)
1. Add server-side anti-cheat behavioral analysis (hearbeat pattern validation, IP consistency)
2. Add HMAC signature verification on judge worker results
3. Implement API key invalidation on session revocation
4. Audit Docker build/execution operations
5. Fix shell command validation for unbraced variable expansion

---

## Files with Most Cross-Perspective Findings

| File | Findings | Perspectives |
|------|----------|--------------|
| `src/components/exam/countdown-timer.tsx` | 5 | Student, Security |
| `src/components/exam/anti-cheat-monitor.tsx` | 4 | Student, Job Applicant, Security |
| `src/components/problem/problem-submission-form.tsx` | 4 | Student, Job Applicant |
| `src/app/(public)/problems/create/create-problem-form.tsx` | 4 | Instructor |
| `src/app/(auth)/recruit/invite/page.tsx` | 3 | Job Applicant |
| `src/lib/docker/client.ts` | 3 | Admin, Security |
| `src/lib/audit/events.ts` | 2 | Admin, Security |
| `deploy-docker.sh` | 2 | Admin |

---

## Positive Cross-Perspective Observations

1. **Docker sandboxing** is strong across the board — security researcher confirmed seccomp, network isolation, and privilege dropping
2. **Rate limiting** is robust — PostgreSQL-backed with advisory locks prevents TOCTOU races
3. **Password hashing** (Argon2id) exceeds OWASP recommendations
4. **API handler consistency** (`createApiHandler`) enforces auth/CSRF/rate-limit/Zod uniformly
5. **File upload hardening** (magic bytes, ZIP bomb detection, size limits) is comprehensive
6. **Pre-deploy backups** with retention policy prevents data loss during deployments
7. **GPG-signed commits** and semantic versioning in the development workflow

---

## Review Files

- `./.context/reviews/student-perspective-review.md` — 665 lines, 35 findings
- `./.context/reviews/instructor-perspective-review.md` — 954 lines, 42 findings
- `./.context/reviews/job-applicant-perspective-review.md` — ~800 lines, 27 findings
- `./.context/reviews/admin-perspective-review.md` — ~900 lines, 38 findings
- `./.context/reviews/assistant-perspective-review.md` — ~700 lines, 23 findings
- `./.context/reviews/security-researcher-review.md` — ~750 lines, 27 findings
