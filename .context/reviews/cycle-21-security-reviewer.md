# Cycle 21 Security Reviewer

**Date:** 2026-04-19
**Base commit:** 5a2ce6b4
**Angle:** OWASP top 10, secrets, unsafe patterns, auth/authz

---

## F1: Anti-cheat GET endpoint allows any instructor to view student IP addresses and user agents

- **File**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:157-174`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: The anti-cheat GET endpoint returns `ipAddress` and `userAgent` fields for all anti-cheat events. Any instructor who can manage a contest (including co-instructors, not just the group owner) can see these PII fields. While this is necessary for anti-cheat analysis, there's no audit log of who accessed this data, and no ability to redact IP addresses for instructors who only need event counts.
- **Concrete failure scenario**: A co-instructor queries the anti-cheat endpoint and collects student IP addresses. There is no audit trail of this access. In jurisdictions with strict data protection (GDPR), IP addresses are personal data and access should be logged.
- **Fix**: Consider adding an audit log entry when anti-cheat data with PII is accessed, or at minimum document the data classification of this endpoint.

## F2: `sanitizeSubmissionForViewer` makes a DB query per invocation — potential for N+1 in bulk contexts

- **File**: `src/lib/submissions/visibility.ts:74`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `sanitizeSubmissionForViewer` queries the `assignments` table for every submission it sanitizes. If called in a loop (e.g., an endpoint that returns multiple submissions), this creates N+1 queries. Currently, the function is only called from the SSE route (single submission) and a few other single-submission endpoints, so the N+1 risk is theoretical. However, the function signature does not communicate this hidden DB query, making it easy for a future developer to introduce an N+1 bug.
- **Concrete failure scenario**: A future developer adds a bulk submissions endpoint that calls `sanitizeSubmissionForViewer` in a loop for 100 submissions. This triggers 100 extra DB queries.
- **Fix**: Either (a) accept the assignment's `showResultsToCandidate` and `hideScoresFromCandidates` as parameters to avoid the DB query, or (b) document the DB query clearly in the function's JSDoc. Already deferred as D16 from a prior cycle, but the concern about the hidden DB query remains.

## F3: `encryption.ts` `decrypt` plaintext fallback could mask data corruption

- **File**: `src/lib/security/encryption.ts:70-71`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: The `decrypt` function returns the input as-is if it doesn't start with `enc:`. This is the backward-compatibility fallback for pre-encryption data. However, if an encrypted value is somehow truncated or corrupted (e.g., `en` instead of `enc:...`), the function would return the corrupted string as plaintext rather than throwing an error. This could lead to confusing behavior where corrupted data is silently treated as unencrypted.
- **Concrete failure scenario**: A database migration truncates an encrypted value from `enc:abc123:def456:ghi789` to `enc:abc123:def456`. The decrypt function would try to parse `enc:abc123:def456`, get `parts.length === 3` (not 4), and throw "Invalid encrypted value format" — so this specific case is handled. But if a bug prefixes a non-`enc:` value that looks like a real secret, it would be returned as-is without any validation.
- **Fix**: This is a theoretical concern. The `parts.length !== 4` check catches the most common corruption case. No action needed beyond the existing safeguards.

## Previously Verified Safe (Cycle 20)

- Encryption key handling — production throws if `NODE_ENCRYPTION_KEY` is missing
- `decrypt` plaintext fallback — necessary for backward compatibility
- SQL parameter binding — `namedToPositional` uses parameterized queries, no injection risk
- `sanitizeHtml` uses DOMPurify — XSS protection is in place
