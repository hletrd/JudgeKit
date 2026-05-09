# Critic — Cycle 26

**Date:** 2026-05-09
**Cycle:** 26 of 100
**Base commit:** 5594a074
**Current HEAD:** 5594a074 (clean working tree)

---

## Cross-cutting Findings

### C26-CRIT-1: LLM prompt injection in auto-review (NEW, High signal)

- **File:** `src/lib/judge/auto-review.ts:162-167`
- **Severity:** Medium
- **Confidence:** High
- **Summary:** Embedding user-controlled data (source code) directly into LLM prompts without sanitization is a well-known vulnerability class. The impact is moderate (misleading educational feedback, potential for inappropriate content) but the fix is straightforward.
- **Why this matters:** Auto-review comments are shown to students as authoritative feedback from an "AI Assistant". If an attacker can manipulate the output, they could:
  - Cause the system to generate false positive/negative feedback
  - Insert inappropriate or harmful content into educational materials
  - Waste API tokens on manipulated outputs
- **Suggested approach:** Implement a `sanitizePromptInput()` helper that strips or escapes known prompt injection markers before embedding user content. Also consider adding a content moderation step on the LLM output before storing.

### C26-CRIT-2: Transaction wrapper inconsistency (carry-forward, 7 cycles)

- **File:** `src/app/api/v1/judge/poll/route.ts:77,136`
- **Severity:** Low
- **Confidence:** High
- **Summary:** The inconsistency between `execTransaction` (line 77) and `db.transaction` (line 136) has been deferred for 7 cycles. While functionally equivalent today, this creates a hidden dependency: if `execTransaction` is enhanced (e.g., retries, observability), the final-update path won't benefit.
- **Recommendation:** Fix in the next available cycle. It's a one-line change.

### C26-CRIT-3: Client-side error logging deferred too long

- **Files:** Multiple client components (22 instances of `console.error`)
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** The 22 instances of `console.error` in client components were identified in cycle 25 and deferred. While not a security vulnerability, this represents a meaningful UX leak in production where browser dev tools expose internal error details.
- **Recommendation:** Create a minimal client-side logger utility (`src/lib/client-logger.ts`) that respects environment and log levels. Then batch-convert all instances.

### C26-CRIT-4: Auto-review fire-and-forget lacks observability

- **File:** `src/app/api/v1/judge/poll/route.ts:207-209`
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** The `Promise.resolve(triggerAutoCodeReview(submissionId)).catch(...)` pattern fires the review in the background with no way to track success/failure per submission. If auto-reviews silently fail, there's no alert or retry mechanism.
- **Recommendation:** Add a flag to the submission record (e.g., `aiReviewRequested`, `aiReviewCompleted`) so operators can detect stuck reviews.

---

## Systemic Strengths

- Strong defense-in-depth: multiple validation layers (magic bytes, MIME type, size limits, path validation)
- Good separation of concerns between API handlers and business logic
- Consistent use of parameterized queries (raw SQL uses `@name` → positional conversion)
- Audit logging throughout sensitive operations
- Rate limiting on all mutation endpoints

## Final Sweep

No additional architectural or design risks found beyond those listed. The codebase is well-structured and the security posture is strong.
