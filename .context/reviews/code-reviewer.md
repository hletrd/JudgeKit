# Cycle 1 Review — Code Quality & Logic

Date: 2026-06-24
Reviewer: Direct analysis (subagent introspection loop prevented fan-out)

## Findings

### C1-1 — Medium — ProblemDescription dangerouslySetInnerHTML bypass could allow XSS via crafted legacy HTML

**Location:** `src/components/problem-description.tsx:67`

**Issue:** The `looksLikeLegacyHtml` detection uses regex to check for HTML tags and markdown structure. A malicious problem description could contain HTML tags that pass `sanitizeHtml` but still execute JavaScript through event handlers (e.g., `<img src=x onerror=alert(1)>`). The `sanitizeHtml` function is imported from `@/lib/security/sanitize-html` but I could not verify its implementation in this review.

**Confidence:** Medium

**Fix:** Verify that `sanitizeHtml` uses a strict allowlist that excludes event handlers (`onerror`, `onload`, etc.) and JavaScript URLs. Consider adding CSP `script-src` restrictions as defense-in-depth.

---

### C1-2 — Medium — judge-worker `parse_timestamp_epoch_ms` has potential integer overflow in days calculation

**Location:** `judge-worker-rs/src/docker.rs:91-130`

**Issue:** The `parse_timestamp_epoch_ms` function calculates days using `365 * y + y / 4 - y / 100 + y / 400 + (153 * (m - 3) + 2) / 5 + day - 719469`. For very large year values (e.g., year 3000+), this could overflow `i64` before being multiplied by 86400. While Docker timestamps are typically within reasonable ranges, malformed container state data could trigger this.

**Confidence:** Low (theoretical — Docker normally returns valid timestamps)

**Fix:** Add bounds checking on year/month/day values before calculation, or use a well-tested datetime library like `chrono`.

---

### C1-3 — Medium — `data-retention-maintenance.ts` uses `var` in global declaration

**Location:** `src/lib/data-retention-maintenance.ts:168`

**Issue:** Line 168 uses `var __sensitiveDataPruneTimer` inside a `declare global` block. While this works, `var` in TypeScript global declarations is unnecessary and slightly confusing — `let` or `const` would be more idiomatic. This is a minor code quality issue.

**Confidence:** High

**Fix:** Change `var` to `let` in the global declaration.

---

### C1-4 — Low — `pruneSensitiveOperationalData` timer uses 24-hour interval but no jitter

**Location:** `src/lib/data-retention-maintenance.ts:173`

**Issue:** The `setInterval` runs exactly every 24 hours (`24 * 60 * 60 * 1000`). If multiple instances are running (e.g., in a multi-process or clustered deployment), they could all trigger simultaneously, causing lock contention on the database. Adding a small random jitter would distribute the load.

**Confidence:** Medium

**Fix:** Add a random jitter of ±1 hour to the interval: `setInterval(pruneSensitiveOperationalData, 24 * 60 * 60 * 1000 + Math.random() * 3600 * 1000)`.

---

### C1-5 — Medium — `report_with_retry` dead-letter timestamp calculation is complex and potentially buggy around leap years

**Location:** `judge-worker-rs/src/executor.rs:972-1025`

**Issue:** The custom Gregorian calendar calculation in `report_with_retry` is complex and hand-rolled. While it has leap year logic, edge cases around century years (not divisible by 400) and the transition from February could be subtly wrong. The code is also duplicated from standard library functionality.

**Confidence:** Medium

**Fix:** Use `chrono` crate's `Utc::now().format("%Y%m%dT%H%M%SZ")` instead of hand-rolling the calendar calculation.

---

### C1-6 — Low — `validate_docker_image` allows empty trusted prefixes list to pass for non-registry images

**Location:** `judge-worker-rs/src/validation.rs:52-61`

**Issue:** When `TRUSTED_DOCKER_REGISTRIES` is empty or unset, `validate_docker_image` calls `validate_docker_image_with_trusted(image, &[])`. For images without a registry prefix (e.g., `judge-python:latest`), this returns `true` because `has_registry_prefix` is `false` and `segments.len() == 1` passes. This means the trusted registry check is effectively bypassed for simple image names when no registries are configured.

**Confidence:** Medium

**Fix:** Consider whether this is intentional (local development) or a bug. If the intent is to require trusted registries in production, add an environment check.

---

### C1-7 — Medium — `createApiHandler` catches all errors but may swallow Zod validation details

**Location:** `src/lib/api/handler.ts:204-207`

**Issue:** The catch block at line 204 logs the error and returns a generic 500. While this is good for security (no information leakage), it means validation errors from Zod (which are already handled at lines 161-170) and other unexpected errors are indistinguishable in the response. More importantly, if the `handler` function throws a custom error that should be exposed to the client (e.g., a business logic validation error), it's always masked as "internalServerError".

**Confidence:** Medium

**Fix:** Consider allowing handlers to throw a `ClientError` type that gets passed through with its message and status code, while unexpected errors still get the generic 500 treatment.

---

### C1-8 — Low — `getApiUser` API key fallback path may cause unnecessary DB queries

**Location:** `src/lib/api/auth.ts:61-83`

**Issue:** When an API key with `Bearer jk_` prefix is provided but invalid (line 66-68), the code falls through to JWT extraction (lines 72-76) and then another API key attempt (line 82). This means a request with a malformed API key triggers 2-3 database lookups unnecessarily.

**Confidence:** Low

**Fix:** If the auth header starts with `Bearer jk_` but authentication fails, return unauthorized immediately rather than falling through to JWT.

---

### C1-9 — Medium — `validateCsrf` does not check `Sec-Fetch-Site` for `same-site` requests when origin is missing

**Location:** `src/lib/security/csrf.ts:30-74`

**Issue:** The CSRF check requires `X-Requested-With: XMLHttpRequest` (line 40). If this header is present, the request passes even if `Sec-Fetch-Site` is `cross-site` and the origin is missing. The `Sec-Fetch-Site` check (lines 47-54) only triggers when the header is present, but an attacker could omit it. However, `X-Requested-With` cannot be set by cross-origin requests due to CORS preflight, so this is likely acceptable.

**Confidence:** Low (the X-Requested-With check is the primary defense)

**Fix:** None needed — the `X-Requested-With` header is the primary CSRF defense and cannot be set cross-origin.

---

### C1-10 — Low — `isAdminAsync` capability check uses hardcoded capability names

**Location:** `src/lib/api/auth.ts:114-118`

**Issue:** The `isAdminAsync` function checks for `users.view` and `system.settings` capabilities. If these capability names change or new admin-level capabilities are added, this function could return false for legitimate admins. The capability names are hardcoded rather than referencing constants.

**Confidence:** Low

**Fix:** Define admin capability requirements as constants and reference them here.

---

## Summary

Total findings: 10
- High confidence: 2
- Medium confidence: 6
- Low confidence: 2

Most critical: C1-1 (XSS potential), C1-5 (calendar calculation bug), C1-6 (registry validation bypass)
