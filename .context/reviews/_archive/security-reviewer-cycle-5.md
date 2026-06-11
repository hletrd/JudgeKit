# Security Review — Cycle 5 (RPF Loop)

**Date:** 2026-05-11
**Reviewer:** security-reviewer (orchestrator direct — Agent tool unavailable)
**Scope:** File upload/restore, judge claim, raw SQL, XSS sanitization

---

## Summary

2 LOW findings. No critical vulnerabilities. Both are defense-in-depth issues.

---

## LOW

### S5-L1: `file.type` Is Client-Controlled in Restore Route ZIP Detection
- **File:** `src/app/api/v1/admin/restore/route.ts:74-77`
- **Confidence:** Medium
- **Description:** The `isZipFile` detection includes `file.type === "application/zip" || file.type === "application/x-zip-compressed"`. The `file.type` property comes from the browser's multipart `Content-Type` header, which is client-controlled and can be spoofed. An attacker with admin credentials could upload a non-ZIP file with `Content-Type: application/zip` to trigger the ZIP processing branch, causing unnecessary CPU/memory consumption before the parse fails.
- **Failure scenario:** Attacker uploads a 100MB non-ZIP file with spoofed `application/zip` type. Server attempts `restoreFilesFromZip(Buffer)` on invalid data, wasting CPU and memory. While this requires admin credentials (mitigating severity), it is still an unnecessary attack surface.
- **Fix:** Remove `file.type` from ZIP detection. Rely only on `file.name?.endsWith(".zip")` and let `restoreFilesFromZip` validate actual ZIP magic bytes.
  ```ts
  const isZipFile = file.name?.endsWith(".zip");
  ```

### S5-L2: `isomorphic-dompurify` Dependency Should Be Audited
- **File:** `src/lib/security/sanitize-html.ts`
- **Confidence:** Low
- **Description:** DOMPurify (and its isomorphic wrapper) has had CVEs in the past. The current `sanitizeHtml` function is a critical XSS defense boundary. We should verify the installed version is not vulnerable.
- **Fix:** Run `npm audit` specifically for `isomorphic-dompurify` and upgrade if needed. The `ALLOWED_URI_REGEXP` correctly blocks `javascript:` URLs.

---

## Verification of Prior Fixes

- **AbortController in auth forms:** Verified — all auth forms now abort in-flight requests.
- **Rate limiting on auth endpoints:** Verified — all auth POST routes have multi-key rate limiting.
- **Zod schema validation:** Verified — all POST routes validate request bodies.
- **Raw SQL parameterization:** Verified — `rawQueryOne`/`rawQueryAll` convert named params to PostgreSQL positional params ($1, $2...).
- **Verify-email error sanitization:** Verified — cycle 4 fix maps known errors and returns generic `verifyFailed` for unknowns.
