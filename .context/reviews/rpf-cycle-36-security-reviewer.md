# Security Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- All API routes (`src/app/api/v1/`)
- Security modules (`src/lib/security/`)
- Docker client (`src/lib/docker/client.ts`)
- Compiler execute (`src/lib/compiler/execute.ts`)
- Auth (`src/lib/auth/`)
- CSRF (`src/lib/security/csrf.ts`)
- Rate limiting (`src/lib/security/in-memory-rate-limit.ts`, `src/lib/security/rate-limit.ts`)
- File storage (`src/lib/files/storage.ts`)
- Sanitization (`src/lib/security/sanitize-html.ts`)
- DB import/restore routes (`src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/restore/route.ts`)
- Chat widget (`src/lib/plugins/chat-widget/`)
- Recruiting (`src/app/api/v1/recruiting/validate/route.ts`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/`)
- Audit logs (`src/app/(dashboard)/dashboard/admin/audit-logs/`)
- SEO JSON-LD (`src/components/seo/json-ld.tsx`)

## Findings

### SEC-1: PATCH invitation route missing NaN guard — same vulnerability as AGG-2 [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:114-119`

**Description:** Same finding as CR-1. The PATCH route constructs `expiresAtUpdate = new Date(\`${body.expiryDate}T23:59:59Z\`)` without the `Number.isFinite()` defense-in-depth check. This is the exact same vulnerability that was identified and fixed in cycle 35 for the two POST routes, but the PATCH route was overlooked.

The Zod schema enforces YYYY-MM-DD format, which blocks the direct attack vector. However, the defense-in-depth principle requires consistency — if the guard is warranted for POST, it's warranted for PATCH too.

**Concrete failure scenario:** A developer reuses the PATCH route's Zod schema without the regex guard, or the schema is loosened. The NaN bypass silently allows setting an invalid expiry.

**Fix:** Add `Number.isFinite(expiresAtUpdate.getTime())` check, returning `apiError("invalidExpiryDate", 400)` if invalid.

**Confidence:** High

---

### SEC-2: buildGroupMemberScopeFilter uses raw string interpolation in SQL LIKE without escaping [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:150`

**Description:** The LIKE pattern `%"groupId":"${groupId}"%` uses raw string interpolation. While `groupId` values originate from a server-side DB query (nanoid-generated), this bypasses the `escapeLikePattern` utility that is the standard defense against LIKE injection in this codebase. If the source of groupIds ever changes (e.g., manually entered group IDs containing `%` or `_`), the LIKE pattern could match unintended audit log rows.

The LIKE pattern also assumes a specific JSON key ordering in the `details` column, which is fragile but not a security issue.

**Fix:** Use `escapeLikePattern(groupId)` in the LIKE pattern, consistent with all other LIKE queries in the codebase.

**Confidence:** Medium

---

### SEC-3: Import route JSON body path still active with password in request body [MEDIUM/MEDIUM — carry-over, unchanged]

**File:** `src/app/api/v1/admin/migrate/import/route.ts:113-191`

**Description:** The JSON body path for the import route still accepts `{ password, data: {...} }`. While a deprecation warning (logger.warn) and Sunset header were added in cycle 35, the insecure path remains functional. The password in the JSON body can be logged by middleware, load balancers, or CDN access logs.

The Sunset date is now correctly set to Nov 2026, but the path remains active until then.

**Concrete failure scenario:** A reverse proxy logs request bodies for error diagnostics. The admin's password appears in plaintext in those logs.

**Fix:** Consider adding a server-side sunset enforcement — after the Sunset date, the JSON path should return 410 Gone automatically. Alternatively, accelerate deprecation by requiring a query parameter to opt into the JSON path.

**Confidence:** Medium

---

## Previously Fixed Items (Verified in Current Code)

- AGG-1 (Sunset header past date): Fixed — now Nov 2026
- AGG-2 (NaN bypass in POST routes): Fixed — both single and bulk POST routes have NaN guards
- Docker client remote path error leak: Fixed in commit 5527e96b
- Compiler spawn error leak: Fixed in commit 46ba5e0c
- SSE NaN guard: Fixed in commit 8ca143d4
- Chat widget ARIA role: Fixed in commit 16cf7ecf
