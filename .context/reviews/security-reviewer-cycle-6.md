# Security Review — Cycle 6 (Updated)

**Reviewer:** security-reviewer
**Date:** 2026-05-11
**Scope:** Auth, API routes, file handling, compiler sandbox, SSE connections, audit logs

---

## HIGH

None.

---

## MEDIUM

### M1: Compiler Route `assignmentId` Accepted Without Immediate Ownership Check
- **File:** `src/app/api/v1/compiler/run/route.ts:25,33-35`
- **Confidence:** Medium
- **Description:** The compiler run route accepts `assignmentId` from the client body and passes it to `resolvePlatformModeAssignmentContextDetails`. While downstream validation exists in `getEffectivePlatformMode`, the route does not immediately verify that the user is enrolled in or has access to the specified assignment. A malicious user could probe different `assignmentId` values to enumerate active assignments or leak assignment metadata through timing differences in the platform mode resolution.
- **Fix:** Validate assignment access explicitly before processing the compiler request, or reject `assignmentId` for users who don't have a valid enrollment.

---

## LOW

### L1: `sanitizeHtml` Allows `mailto:` in Anchors Without Validation
- **File:** `src/lib/security/sanitize-html.ts:79`
- **Confidence:** Low
- **Description:** The `ALLOWED_URI_REGEXP` permits `mailto:` links. While DOMPurify sanitizes the href, mailto links can be used for phishing (e.g., `mailto:attacker@example.com?subject=...&body=...`) or to trigger external email clients with pre-filled content. The `rel="noopener noreferrer"` attribute is added, but this doesn't prevent the mailto from being clicked.
- **Fix:** Consider stripping `mailto:` from hrefs or validating the target email address if mailto links are not a business requirement.

### L2: Legacy JSON Path in Restore Still Consults `file.type`
- **File:** `src/app/api/v1/admin/restore/route.ts:101`
- **Confidence:** Low
- **Description:** While the ZIP detection was fixed in cycle 5 to not trust `file.type`, the legacy JSON branch at line 101 still checks `file.type === "application/json"` as part of its format detection. A client could send a non-JSON file with `Content-Type: application/json` to bypass the `unsupportedFileFormat` check. The subsequent `readUploadedJsonFileWithLimit` would then fail with `invalidJsonFile`, so this is a defense-in-depth issue rather than an exploitable vulnerability.
- **Fix:** Remove `file.type` from the JSON detection check; rely only on `file.name?.endsWith(".json")`.

### L3: `getApiUser` Re-Auth in SSE Doesn't Verify Same User
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:466-470`
- **Confidence:** Low
- **Description:** During the periodic re-auth check in SSE connections, `getApiUser(request)` is called but the returned user is only checked for existence (`if (!reAuthUser)`), not verified to be the same user as the original connection. In a session-swapping scenario (e.g., cookie theft and replacement), the new user would pass the re-auth check and continue receiving events for the original user's submission.
- **Fix:** Compare `reAuthUser.id` against the original `viewerId` captured at connection time.

---

## Final Sweep Notes

- All API routes use `createApiHandler` with proper auth/capability checks.
- Rate limiting is consistently applied to mutation endpoints.
- CSRF protection correctly skips API-key-authenticated requests.
- Docker sandbox remains the primary security boundary for compiler execution.
- No new secrets leakage patterns found.
