# RPF Cycle 9 Code Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### CR-1: `globals.css` applies `letter-spacing` unconditionally on `html` element — violates Korean letter-spacing rule [HIGH/HIGH]

**Files:** `src/app/globals.css:129`, `src/app/globals.css:213`
**Description:** The `html` element in globals.css has `letter-spacing: -0.01em` applied unconditionally (line 129). The `.problem-description :is(h1, h2, h3, h4)` selector has `letter-spacing: -0.02em` (line 213). Both apply to ALL text including Korean content. CLAUDE.md explicitly states: "Keep Korean text at the browser/font default letter spacing. Do not apply custom letter-spacing (or tracking-* Tailwind utilities) to Korean content." While the Tailwind component classes correctly use locale-conditional tracking (e.g., `${locale !== "ko" ? " tracking-tight" : ""}`), these CSS rules bypass that logic entirely.
**Concrete failure scenario:** Korean text rendered in problem description headings or any page text gets compressed letter-spacing, making it harder to read. This is a direct violation of the project's own CLAUDE.md rule.
**Fix:** Use `:lang()` CSS selectors to conditionally apply letter-spacing only for non-Korean content, or use CSS custom properties set per-locale.

### CR-2: `api-key-auth.ts` uses `new Date()` for `lastUsedAt` while same file uses `getDbNowUncached()` for expiry check [MEDIUM/MEDIUM]

**Files:** `src/lib/api/api-key-auth.ts:103`
**Description:** Line 88 correctly uses `const now = await getDbNowUncached()` for API key expiry validation, but line 103 writes `lastUsedAt: new Date()` using app server time. This creates inconsistent timestamps in the same authentication flow.
**Concrete failure scenario:** An audit query comparing `lastUsedAt` with `expiresAt` shows the key was used "after" it expired if the app server clock is ahead of the DB clock.
**Fix:** Replace `lastUsedAt: new Date()` with `lastUsedAt: now` (reusing the already-fetched `getDbNowUncached()` value). Since this is fire-and-forget (`void db.update()`), the DB time is already available.

### CR-3: Server actions (plugins, language-configs, system-settings, user-management) use `new Date()` for `updatedAt`/`createdAt` [LOW/MEDIUM]

**Files:** `src/lib/actions/plugins.ts:47,117`, `src/lib/actions/language-configs.ts:61,116,204,263,313`, `src/lib/actions/system-settings.ts:118`, `src/lib/actions/user-management.ts:432,433`
**Description:** Server actions that write `updatedAt: new Date()` or `createdAt: new Date()` use app server time. While the broader `getDbNowUncached()` migration covered API routes, server actions were not included. These timestamps could be compared with DB-time-sourced timestamps from API routes.
**Fix:** Import and use `getDbNowUncached()` in these server actions, consistent with the API route migration pattern.

### CR-4: Recruiting token flow still uses `new Date()` for enrollment, access token, and rehash timestamps [LOW/MEDIUM]

**Files:** `src/lib/assignments/recruiting-invitations.ts:389,477,484,494,496`
**Description:** The `redeemRecruitingToken` function uses `new Date()` for `updatedAt`, `enrolledAt`, `redeemedAt`, and password rehash `updatedAt`. The atomic SQL claim at line 502 correctly uses `NOW()`, but the surrounding writes use app server time within the same transaction.
**Fix:** Use `getDbNowUncached()` at the start of the function and pass it through to all timestamp writes.

### CR-5: Announcement and clarification routes use `new Date()` for `updatedAt`/`answeredAt` [LOW/LOW]

**Files:** `src/app/api/v1/contests/[assignmentId]/announcements/[announcementId]/route.ts:54`, `src/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route.ts:55,56`
**Description:** Contest announcement and clarification PATCH routes use `new Date()` for `updatedAt` and `answeredAt`. These are moderation timestamps with no security implications.
**Fix:** Use `getDbNowUncached()` for consistency with the broader migration pattern.

### CR-6: `recruiting-invitations-panel.tsx` uses `toLocaleDateString()` without locale parameter [LOW/MEDIUM]

**Files:** `src/components/contest/recruiting-invitations-panel.tsx:252`
**Description:** `new Date(dateStr).toLocaleDateString(undefined, {...})` uses the browser's default locale, not the next-intl configured locale.
**Fix:** Import and use the next-intl date formatting utility or pass the current locale to `toLocaleDateString()`.

### CR-7: Rejudge route uses `new Date()` for contest-finished check [LOW/LOW]

**Files:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:79`
**Description:** `if (assignment?.deadline && new Date() > assignment.deadline)` uses app server time to determine if a contest is finished. This is used only for an audit log warning, not for access control, so the impact is low.
**Fix:** Use `getDbNowUncached()` for consistency.

## Verified Safe

- No `as any` casts, no `@ts-ignore`, no unsanitized SQL.
- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- Only 2 eslint-disable directives, both with justification comments.
- No `dangerouslySetInnerHTML` without sanitization.
- No silently swallowed catch blocks in server-side code.
