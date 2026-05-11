# Security Review (Additional Findings): JudgeKit

**Reviewer:** security-reviewer
**Date:** 2026-05-10
**Scope:** Security findings NOT already covered by security-researcher-perspective-review.md

---

## Summary

The security-researcher perspective review already found 27 issues (2 CRITICAL, 8 HIGH). This review focuses on additional security concerns not covered in that review. Most are MEDIUM/LOW severity defense-in-depth items.

---

## MEDIUM Severity

### 1. Backup Stream Abort Handling Gap
**File:** `src/app/api/v1/admin/backup/route.ts:90-106`
**Severity:** MEDIUM
**Confidence:** Medium

The backup endpoint passes `request.signal` to the streaming functions but does not wrap the Response stream with proper abort propagation. If the client disconnects mid-stream, the database export continues running in the background, consuming resources.

**Fix:** Ensure `streamDatabaseExport` and `streamBackupWithFiles` accept and properly handle AbortSignal, canceling the underlying DB queries on abort.

### 2. Judge Claim SQL Injection via Named Parameter Names
**File:** `src/lib/db/queries.ts:74-89`
**Severity:** MEDIUM
**Confidence:** Low

The `namedToPositional` function validates parameter names with `/^[a-zA-Z_]\w*$/`. This rejects obvious injection attempts but uses a regex that could be bypassed with Unicode characters in some JavaScript engines. The parameter values are safely passed to PostgreSQL as positional parameters, so actual injection is not possible. This is a defense-in-depth observation.

**Status:** Acceptable as-is. The values are parameterized.

### 3. File Download Content-Type Not Validated Against Magic Bytes
**File:** `src/app/api/v1/files/[id]/route.ts:113-125`
**Severity:** MEDIUM
**Confidence:** Medium

The file download endpoint serves files with `Content-Type: file.mimeType` from the database. The MIME type was validated at upload time, but there is no re-validation at download time. If the database is compromised and MIME types are altered, users could be served malicious content with a trusted Content-Type.

**Fix:** Defense-in-depth: re-read magic bytes from disk and validate against the stored MIME type before serving.

### 4. Submissions API Returns compileOutput Even for Non-Owners
**File:** `src/app/api/v1/submissions/route.ts:373-375`
**Severity:** MEDIUM
**Confidence:** Medium

```typescript
if (submission && problem.showCompileOutput === false) {
  submission.compileOutput = null;
}
```

This only strips compileOutput when `showCompileOutput === false`. If the field is `null` or `undefined` (default), compileOutput IS returned. The GET endpoint at the top of the file does not include `compileOutput` in its column selection, so this is only for the POST response. However, other endpoints that return submission details may not consistently apply this filter.

**Fix:** Audit all submission-returning endpoints for consistent compileOutput filtering.

---

## LOW Severity

### 5. CSRF Origin Check Bypass via Protocol-Relative Origin
**File:** `src/lib/security/csrf.ts:60-68`
**Severity:** LOW
**Confidence:** Low

The origin check uses `new URL(origin).host`. A malformed origin like `//attacker.com` would parse to `attacker.com` in some URL implementations. However, `sec-fetch-site` would also need to pass, making this a very narrow attack window.

**Status:** Acceptable risk given multiple layers of CSRF protection.

### 6. Test Seed Endpoint Accepts JSON Without Rate Limit
**File:** `src/app/api/v1/test/seed/route.ts`
**Severity:** LOW
**Confidence:** Medium

The test seed endpoint is protected by `PLAYWRIGHT_AUTH_TOKEN` and localhost check but has no rate limiting. In environments where the endpoint is accessible (e.g., misconfigured reverse proxy), token brute-forcing is unthrottled.

**Fix:** Add rate limiting to the test seed endpoint, or remove it from production builds entirely.

### 7. Docker Build Context Includes Entire Repository
**File:** `src/lib/docker/client.ts:245-246`
**Severity:** LOW
**Confidence:** Medium

Already covered by security-researcher (H7). Additional note: even with `.dockerignore`, build context includes `.git/` which could leak commit history and past secrets.

**Fix:** Ensure `.dockerignore` explicitly excludes `.git/`, `.env*`, and other sensitive files.

---

## Final Sweep

The security-researcher perspective review already comprehensively covered:
- Anti-cheat bypass (CRITICAL)
- Judge result fabrication (CRITICAL)
- API key persistence after revocation (HIGH)
- Shell command injection (HIGH)
- LLM data exfiltration (HIGH)
- IP spoofing via X-Forwarded-For (HIGH)
- File upload header injection (HIGH)
- Test seed privilege escalation (HIGH)
- Docker build context exposure (HIGH)
- Source code exposure to workers (HIGH)
- Encryption plaintext fallback (MEDIUM)
- Similarity check DoS (MEDIUM)
- Health endpoint info disclosure (MEDIUM)
- Container cleanup race (MEDIUM)
- Advisory lock collision (MEDIUM)
- Recruiting token permissiveness (MEDIUM)
- Rate limit eviction timer (MEDIUM)
- Bulk delete ownership gap (MEDIUM)
- CSRF dev fallback (MEDIUM)
- Compiler run assignment validation (MEDIUM)
- Judge worker rate limiting (LOW)
- Backup/restore MFA (LOW)
- Anti-cheat event integrity (LOW)
- User enumeration (LOW)
- Judge IP allowlist (LOW)
- File download cache poisoning (LOW)
- Submission comment XSS (LOW)

This review identified 7 additional items (3 MEDIUM, 4 LOW), all defense-in-depth or narrow-edge cases.
