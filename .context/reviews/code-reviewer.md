# Code Quality and Logic Review: JudgeKit

**Reviewer:** code-reviewer
**Date:** 2026-05-10
**Scope:** Full codebase review for logic bugs, edge cases, maintainability, and correctness

---

## Summary

The codebase is well-structured with consistent patterns, but several logic issues and edge cases were found that could cause runtime errors, poor UX, or incorrect behavior. Most findings are MEDIUM severity; one is HIGH.

---

## HIGH Severity

### 1. SSE Parse Failure Does Not Trigger Fetch Fallback
**File:** `src/hooks/use-submission-polling.ts:143-149`
**Severity:** HIGH
**Confidence:** High

When an SSE message arrives but JSON.parse fails (line 143-149), the code sets `setIsPolling(false)` and `setError(true)`, then closes the EventSource. However, unlike the `es.onerror` handler (lines 161-167) which calls `startFetchPolling()`, the parse-failure path does NOT start the fetch polling fallback. The student sees "live updates delayed" with no automatic recovery. They must manually refresh the page.

**Failure scenario:** Network delivers a malformed SSE message (e.g., server sends non-JSON data during deploy). The submission detail page stops polling entirely.

**Fix:** Call `startFetchPolling()` in the parse-failure catch block before closing the EventSource.

---

## MEDIUM Severity

### 2. Zod Validation Returns Only First Error
**File:** `src/lib/api/handler.ts:163-166`
**Severity:** MEDIUM
**Confidence:** High

```typescript
return NextResponse.json(
  { error: parsed.error.issues[0]?.message ?? "validationError" },
  { status: 400 }
);
```

When a request body has multiple validation errors (e.g., missing required field AND invalid enum value), only the first error message is returned. API consumers get incomplete feedback and must fix errors one at a time.

**Fix:** Return all issues: `{ errors: parsed.error.issues.map(i => i.message) }` or `{ error: parsed.error.issues[0]?.message, errors: parsed.error.issues }`.

### 3. File Extension Extraction Fails on Dotfiles
**File:** `src/app/api/v1/files/[id]/route.ts:108`
**Severity:** MEDIUM
**Confidence:** High

```typescript
const ext = file.originalName.includes(".") ? `.${file.originalName.split(".").pop()}` : "";
```

For filenames like `.gitignore`, this returns `"."` (empty extension with a dot prefix). For `archive.tar.gz`, `.pop()` returns `gz`, losing the full `.tar.gz` extension.

**Fix:** Use a proper extension extraction: `const ext = file.originalName.lastIndexOf('.') > 0 ? file.originalName.slice(file.originalName.lastIndexOf('.')) : ''`.

### 4. Judge Claim Raw SQL Parse Can Throw Unhandled
**File:** `src/app/api/v1/judge/claim/route.ts:261-263`
**Severity:** MEDIUM
**Confidence:** Medium

```typescript
const claimed: ClaimedSubmissionRow | undefined = claimedRaw
  ? claimedSubmissionRowSchema.parse(claimedRaw)
  : undefined;
```

If the raw SQL CTE returns an unexpected shape (e.g., due to schema drift), `z.parse()` throws. This is caught by the outer try/catch but returns a generic 500 instead of a more specific error.

**Fix:** Wrap the parse in a try/catch that returns a 422 or logs a specific "judge claim schema mismatch" error.

### 5. CSRF Validation Rejects Empty Origin Without sec-fetch-site
**File:** `src/lib/security/csrf.ts:56-58`
**Severity:** MEDIUM
**Confidence:** Medium

Older browsers (e.g., Safari < 16) or HTTP clients that don't send `sec-fetch-site` AND don't send `Origin` are blocked even for same-origin requests.

**Fix:** Document minimum browser requirements or add Referer fallback check.

---

## LOW Severity

### 6. ICPC Cell Newline Formatting Relies on CSS Class
**File:** `src/components/contest/leaderboard-table.tsx:69-81`
**Severity:** LOW
**Confidence:** Medium

`formatIcpcCell` returns a string with embedded `\n` literal. Rendering depends on `whitespace-pre-line` being applied in TableCell. If this class is removed during a refactor, the newline won't render.

**Fix:** Return structured data instead of a formatted string.

### 7. Duplicate API Key Auth Attempt
**File:** `src/lib/api/auth.ts:66-83`
**Severity:** LOW
**Confidence:** Medium

If an auth header starts with "Bearer jk_" but fails API key validation, the JWT path is attempted, then `authenticateApiKey` is called AGAIN at line 82. Wasted DB query.

**Fix:** Track that API key auth was already attempted and skip the fallback if the prefix matched.

---

## Final Sweep

Files examined: src/lib/api/handler.ts, src/lib/api/auth.ts, src/hooks/use-submission-polling.ts, src/hooks/use-source-draft.ts, src/app/api/v1/submissions/route.ts, src/app/api/v1/judge/claim/route.ts, src/app/api/v1/judge/poll/route.ts, src/app/api/v1/files/[id]/route.ts, src/app/api/v1/admin/backup/route.ts, src/lib/judge/verdict.ts, src/lib/audit/events.ts, src/lib/security/csrf.ts, src/components/contest/leaderboard-table.tsx, src/lib/compiler/execute.ts, src/lib/db/queries.ts, src/lib/db/schema.pg.ts, src/app/(dashboard)/error.tsx
