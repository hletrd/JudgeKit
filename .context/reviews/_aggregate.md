# Aggregate Review — Cycle 14

**Date:** 2026-05-12
**Scope:** Comprehensive review of API routes, auth handlers, database queries, and business logic
**Previous cycles reviewed:** C13 aggregate (findings were fixed in prior cycles)

---

## FIXED in this cycle (from C13 carry-over)

### C13-1: resend-verification route lacks authentication — arbitrary email trigger

**File:** `src/app/api/v1/auth/resend-verification/route.ts`
**Status:** Fixed — wrapped in `createApiHandler({ auth: true })` with `body.userId !== user.id` check.

---

### C13-2: groups/[id]/assignments GET lacks rate limiting

**File:** `src/app/api/v1/groups/[id]/assignments/route.ts`
**Status:** Fixed — added `consumeApiRateLimit(request, "assignments:list")` to the GET handler.

---

## MEDIUM Severity

### C14-1: audit-logs and login-logs dateTo filters use `setHours` instead of `setUTCHours`

**Files:**
- `src/app/api/v1/admin/audit-logs/route.ts:181`
- `src/app/api/v1/admin/login-logs/route.ts:61`
**Confidence:** High

Both endpoints construct an end-of-day timestamp for the `dateTo` query parameter using `setHours(23, 59, 59, 999)` on a `Date` object parsed from the incoming string. This sets the local time hours, not UTC hours. When the server runs in a non-UTC timezone (e.g., UTC+9), the resulting timestamp is shifted by the timezone offset relative to UTC midnight. PostgreSQL timestamp comparisons then include or exclude the wrong records at the day boundary.

**Impact:** An admin filtering audit logs for "2024-01-01" will see records up to `2024-01-01T14:59:59Z` instead of `2024-01-01T23:59:59Z`, silently dropping the last ~9 hours of the day (in UTC+9).

**Fix:** Replace `setHours(23, 59, 59, 999)` with `setUTCHours(23, 59, 59, 999)` in both files.
**Note:** The same pattern was previously fixed in the submissions export route (commit aa6438f9) but the audit-logs and login-logs routes were missed.

---

## LOW Severity

### C14-2: groups/[id]/instructors DELETE lacks rate limiting

**File:** `src/app/api/v1/groups/[id]/instructors/route.ts:106-131`
**Confidence:** High

The DELETE handler for removing group instructors does not apply rate limiting, while the sibling POST handler does (`rateLimit: "group-instructors:add"`). Under load, a compromised admin session or script could rapidly remove instructors from groups.

**Fix:** Add `rateLimit: "group-instructors:remove"` to the DELETE handler's `createApiHandler` config.

---

## Verified Safe Patterns (new this cycle)

| Pattern | Location | Assessment |
|---|---|---|
| Judge poll claim token check | `judge/poll/route.ts:89,154` | Correct — conditional WHERE on claimToken prevents races |
| Public signup username check | `actions/public-signup.ts:130` | Correct — transaction-scoped uniqueness check |
| Compiler sandbox | `compiler/execute.ts:323-519` | Correct — seccomp, no-new-privs, unprivileged user, network none |
| Recruiting token auth | `auth/config.ts:204-250` | Correct — rate limit + token validation before redeem |
| File upload auth | `files/[id]/route.ts:62-140` | Correct — auth + access check + magic bytes validation |
| Submissions POST atomic rate limit | `submissions/route.ts:271-345` | Correct — advisory lock + tx-scoped checks |
| API key expiry check | `api/api-key-auth.ts:89-92` | Correct — DB server time used for comparison |
| CSRF validation | `security/csrf.ts:30-74` | Correct — multi-layer check with origin validation |
| Password reset atomicity | `email/index.ts:137-181` | Correct — token read+update inside transaction |
| Email verification atomicity | `email/index.ts:277-313` | Correct — token read+update inside transaction |
| Delete+insert transactions | `email/index.ts:62-72,232-243` | Correct — wrapped in db.transaction() |
| Bulk rejudge scopedGroupFilter | `admin/submissions/rejudge/route.ts:25-30` | Correct — `null` means admin with view_all, intentional |
| Exam session POST | `exam-session/route.ts:15-91` | Correct — enrollment check, exam mode validation, rate limit |
| Quick-create contest | `contests/quick-create/route.ts:27-114` | Correct — capability check, transaction-scoped inserts |
| Submissions export dateTo | `admin/submissions/export/route.ts:82-84` | Correct — already uses `setUTCHours` |
| Member removal | `members/[userId]/route.ts:10-95` | Correct — tx-scoped enrollment + submission check |
