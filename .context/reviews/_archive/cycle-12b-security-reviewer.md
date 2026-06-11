# Cycle 12b Security Reviewer Report

**Date:** 2026-04-20
**Base commit:** feeb4a30

## Inventory of Reviewed Files

- `src/lib/auth/recruiting-token.ts` — token auth flow
- `src/lib/auth/config.ts` — credentials auth, JWT callbacks
- `src/lib/auth/types.ts` — type definitions
- `src/lib/db-time.ts` — DB time helpers
- `src/lib/security/sanitize-html.ts` — HTML sanitization
- `src/lib/security/rate-limit.ts` — rate limiting
- `src/app/api/v1/admin/backup/route.ts` — backup with password re-confirmation
- `src/app/api/v1/admin/migrate/export/route.ts` — export with password re-confirmation
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events
- `src/lib/audit/events.ts` — audit event recording
- `src/components/problem-description.tsx` — HTML rendering with sanitizeHtml
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx` — deadline display
- `src/app/(dashboard)/dashboard/contests/page.tsx` — contest status display
- `src/app/(public)/submissions/page.tsx` — submission period filter

## Findings

### SEC-1: [MEDIUM] Server components use `new Date()` for deadline/status comparisons — clock-skew allows inconsistent enforcement

- **Confidence:** HIGH
- **Files:** `src/app/(dashboard)/dashboard/contests/page.tsx:95`, `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:304`, `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx:120`, `src/app/(dashboard)/dashboard/_components/student-dashboard.tsx:24`
- **Description:** Multiple server components use `new Date()` (app-server clock) for temporal comparisons with DB-stored deadlines. The recruit page was fixed in cycle 27 to use `getDbNow()` for this exact reason. These server components present status labels (upcoming/open/closed/past) that can disagree with the actual DB-stored state under clock skew. While these are display-only (the API routes that enforce deadlines use DB time or SQL NOW()), the inconsistency can lead to user confusion: a student sees an assignment as "open" but the API rejects their submission, or a student sees an assignment as "closed" when they could still submit.
- **Failure scenario:** A contest deadline is 12:00 DB time. The app server clock is 11:58. The contests page shows the contest as "open", but the API (using SQL NOW()) accepts submissions until 12:00. After the clock catches up, the page suddenly shows "closed" — the user had a 2-minute window that the page incorrectly said was available. This is a display inconsistency, not an enforcement bypass, but it damages user trust.
- **Fix:** Use `getDbNow()` in all server components that compare against DB-stored deadlines and startsAt timestamps.

### SEC-2: [LOW] `migrate/export` route filename uses `new Date()` — inconsistent with backup route

- **Confidence:** MEDIUM
- **Files:** `src/app/api/v1/admin/migrate/export/route.ts:81`
- **Description:** The export route creates its filename timestamp using `new Date().toISOString()` while the backup route (which does the same operation) uses `getDbNowUncached()`. This is a minor consistency issue. The filename timestamp is not security-critical — it's just a label for the downloaded file.
- **Failure scenario:** Minimal — the filenames for backup vs. export could differ by the clock-skew amount.
- **Fix:** Use `getDbNowUncached()` to match the backup route.

### SEC-3: [LOW] `sanitizeHtml` allows `<img>` with root-relative `src` — potential for internal resource enumeration

- **Confidence:** LOW
- **Files:** `src/lib/security/sanitize-html.ts:9-15`
- **Description:** The DOMPurify hook allows `<img src="/...">` if the path is root-relative (starts with `/` but not `//`). An instructor creating a problem description could embed `<img src="/api/v1/admin/backup">` or other internal paths. While the request would fail (no auth cookies from an img tag), the response status code (401 vs 404 vs 200) could leak information about internal endpoints.
- **Failure scenario:** An instructor embeds an image pointing to an internal API endpoint. When students view the problem, their browser makes a request to that endpoint. The error response reveals the endpoint exists. This is a low-severity information leak.
- **Fix:** Consider restricting root-relative image URLs to a whitelist of paths (e.g., `/uploads/`, `/api/v1/files/`) or using a Content-Security-Policy header to restrict img-src.

## Verified Safe

- `authorizeRecruitingToken` properly uses `AUTH_USER_COLUMNS` and `createSuccessfulLoginResponse` — no field mismatch.
- `mustChangePassword` is properly queried from DB via `AUTH_CORE_FIELDS`.
- No `dangerouslySetInnerHTML` without sanitization — `sanitizeHtml` with DOMPurify is used for legacy HTML.
- No `as any` or `@ts-ignore` in the codebase (only 2 justified `eslint-disable` comments).
- Password re-confirmation is properly enforced on both backup and export routes.
- Rate limiting is consistent with `blockedUntil > 0 ? blockedUntil : null` pattern.
- CSRF protection is in place for server actions and API routes (with API key exemption properly handled).
