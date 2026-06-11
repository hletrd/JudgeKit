# RPF Cycle 35 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** 218a1a93

## SEC-1: Sunset header with past date provides false security signal [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/migrate/import/route.ts:183, 191`

**Description:** The Sunset header reads `"Sat, 01 Nov 2025 00:00:00 GMT"`, which is already past. Per RFC 8594, this signals the endpoint has been retired. If a security-conscious client respects this header and stops sending requests to the JSON path, that is actually the desired deprecation behavior. However, since the endpoint is still active, the past Sunset date creates ambiguity: does it mean "already removed" (but it's not) or "should have been removed"? This inconsistency undermines the trustworthiness of the deprecation signal and could mask a situation where the insecure JSON body path (which sends passwords in the request body) remains active longer than intended.

**Concrete failure scenario:** A security audit tool flags the Sunset date as past and marks the endpoint as "retired," removing it from ongoing monitoring. Meanwhile, the JSON body path continues accepting passwords in plaintext, creating an unmonitored attack surface.

**Fix:** Update Sunset date to a future date consistent with the actual deprecation timeline. If the JSON path should be removed now, remove it rather than setting a past Sunset date.

**Confidence:** HIGH

---

## SEC-2: Recruiting invitation expiryDate allows arbitrary date construction without strict format validation [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-76`

**Description:** The `expiryDate` field from the schema is used directly in `new Date(\`${body.expiryDate}T23:59:59Z\`)`. While the Zod schema validates `expiryDate` as a string, if the schema does not constrain it to a YYYY-MM-DD format, an attacker could pass a string like `"2026-01-01T00:00:00Z"` which would become `"2026-01-01T00:00:00ZT23:59:59Z"`, resulting in an `Invalid Date`. The code then checks `expiresAt <= dbNow`, which would be `NaN <= dbNow` (false), so the invalid date would pass the check and be stored as NaN/Invalid Date in the database. The subsequent `MAX_EXPIRY_MS` check would also pass since `NaN - dbNow.getTime()` is NaN, and `NaN > MAX_EXPIRY_MS` is false.

**Concrete failure scenario:** An attacker sends `expiryDate: "2026-01-01T00:00:00Z"`. The constructed Date is invalid, but the validation checks are bypassed due to NaN comparisons always returning false. The invitation is stored with an invalid expiry date.

**Fix:** Add strict YYYY-MM-DD format validation to the expiryDate schema field, or validate that `expiresAt` is a valid Date after construction before proceeding.

**Confidence:** MEDIUM

---

## SEC-3: Anti-cheat monitor copies user text content to server [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:206-209`

**Description:** The `describeElement` function extracts text content from DOM elements (up to 80 characters) and sends it to the server as part of copy/paste event details. While the intent is to track what students copy (to detect cheating), this also captures potentially sensitive information like passwords, personal notes, or private data that happens to be on the page. The 80-character limit and DOM element type classification partially mitigate this, but the feature sends user content without explicit per-event consent beyond the initial privacy notice dialog.

**Concrete failure scenario:** A student copies a password from a password manager overlay that appears on top of the exam page. The password fragment is included in the anti-cheat event details stored in the database.

**Fix:** Consider truncating text content further for sensitive element types, or only logging the element type/class without text content for copy events.

**Confidence:** LOW (privacy concern, not a direct vulnerability)

---

## SEC-4: Docker build error message could leak filesystem paths to admin UI [LOW/LOW]

**File:** `src/lib/docker/client.ts:169`

**Description:** The `buildDockerImageLocal` function returns `stderr.trim() || stdout.trim()` as the error message on build failure. Docker build output can contain filesystem paths from the build context, environment variable names, and other build system internals. While this is only exposed to admin users via the API, it could leak server filesystem structure information to admins who should not necessarily have that visibility (e.g., a role-limited admin with Docker management capability but not full system access).

**Fix:** Sanitize the error message to remove absolute filesystem paths before returning to the API layer, or log the full output and return a generic message.

**Confidence:** LOW
