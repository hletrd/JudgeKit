# Cycle 5b Comprehensive Deep Code Review

**Date:** 2026-04-19
**Reviewer:** comprehensive deep review (single-agent fan-out)
**Scope:** Full `src/` TypeScript/TSX, API routes, lib modules, security modules, frontend components

## Prior cycles status

Cycles 1-5 plans are all COMPLETE. Key fixes confirmed:
- Password validation now uses context (username/email checking) -- FIXED
- Encryption no longer returns plaintext fallback -- FIXED
- Shell command validation uses strict prefix matching -- FIXED
- JSON-LD sanitizes `</script` sequences -- FIXED
- Audit buffer has graceful shutdown handlers -- FIXED
- Deprecated export functions removed -- FIXED
- Shared `escapeLikePattern()` utility created and used in API routes -- FIXED
- Tags route LIKE escape order fixed -- FIXED
- Recruiting invitations column restriction -- FIXED
- Groups PATCH column restriction -- FIXED

---

## NEW FINDINGS

### F1: Unescaped LIKE search in admin files page -- LIKE injection

**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** SQL safety / A03 Injection

**File / region**
- `src/app/(dashboard)/dashboard/admin/files/page.tsx:88`

**Why this is a problem**
The code passes `searchQuery` directly into a `like()` call without escaping `%`, `_`, or `\`:
```ts
conditions.push(like(files.originalName, `%${searchQuery}%`));
```
A user searching for `%` would match all files, and `_` would match any single character. This is the same class of vulnerability as the tags route bug fixed in cycle 5, but this instance was missed during the consolidation.

**Concrete failure scenario**
An admin searches for `%` in the file search box and sees all files regardless of name, or searches for `_` and gets unintended partial matches.

**Fix**
Import `escapeLikePattern` from `@/lib/db/like` and use:
```ts
import { escapeLikePattern } from "@/lib/db/like";
conditions.push(sql`${files.originalName} LIKE ${`%${escapeLikePattern(searchQuery)}%`} ESCAPE '\\'`);
```

---

### F2: Duplicate graceful shutdown handlers in audit module

**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Reliability / Double-flush

**Files / regions**
- `src/lib/audit/events.ts:238-244` -- `process.on("SIGTERM"...)`, `process.on("SIGINT"...)`, `process.on("beforeExit"...)`
- `src/lib/audit/node-shutdown.ts:28-42` -- same three events via `processLike.once(...)`
- `src/instrumentation.ts:23` -- calls `registerAuditFlushOnShutdown()`

**Why this is a problem**
`events.ts` registers its own `process.on` handlers at module evaluation time (lines 238-244), AND `instrumentation.ts` also calls `registerAuditFlushOnShutdown()` from `node-shutdown.ts` which registers `process.once` handlers for the same signals. This means:
1. On SIGTERM/SIGINT, `handleGracefulShutdown()` from `events.ts` fires AND the `node-shutdown.ts` handler fires, causing a double flush.
2. `events.ts` uses `process.on` (multiple listeners allowed) while `node-shutdown.ts` uses `process.once` (consumed after first fire). The `process.on` handler will always fire first because it was registered at module load time.
3. The `node-shutdown.ts` module exists specifically to handle this concern, but `events.ts` has its own competing handlers.

**Concrete failure scenario**
On graceful shutdown, `flushAuditBuffer()` is called twice. While the second call is a no-op (buffer is empty after first flush), it introduces a race: both handlers call `process.exit()`, and the first one to resolve wins. If the `events.ts` handler resolves first, the `node-shutdown.ts` handler's `finally` block may never run.

**Fix**
Remove the `process.on` handlers from `events.ts` (lines 226-244) since `node-shutdown.ts` now handles this concern properly via `registerAuditFlushOnShutdown()`.

---

### F3: `recruiting-token.ts` fetches `passwordHash` from users table unnecessarily

**Severity:** LOW | **Confidence:** HIGH | **Category:** Data minimization

**File / region**
- `src/lib/auth/recruiting-token.ts:28-30`

**Why this is a problem**
`db.query.users.findFirst({ where: eq(users.id, result.userId) })` fetches all columns including `passwordHash`. The recruiting token flow doesn't need the password hash -- it already authenticated via the recruiting token.

**Concrete failure scenario**
The bcrypt/argon2 password hash (60-97 bytes) is loaded into Node.js memory on every recruiting token login, even though it is never used.

**Fix**
Use `db.select(safeUserSelect).from(users).where(eq(users.id, result.userId)).limit(1)` or add `columns` restriction:
```ts
const user = await db.query.users.findFirst({
  where: eq(users.id, result.userId),
  columns: {
    id: true, username: true, email: true, name: true, className: true,
    role: true, isActive: true, preferredLanguage: true, preferredTheme: true,
    shareAcceptedSolutions: true, acceptedSolutionsAnonymous: true,
    editorTheme: true, editorFontSize: true, editorFontFamily: true,
    lectureMode: true, lectureFontScale: true, lectureColorScheme: true,
  },
});
```

---

### F4: Three remaining `escapeLike` local functions not consolidated to shared utility

**Severity:** LOW | **Confidence:** HIGH | **Category:** DRY / Consistency

**Files / regions**
- `src/app/(dashboard)/dashboard/problems/page.tsx:68-70` -- local `escapeLike()`
- `src/app/(public)/submissions/page.tsx:63` -- local `escapeLike()`
- `src/app/(dashboard)/dashboard/submissions/page.tsx:57` -- local `escapeLike()`
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:105` -- local `escapeLike()`
- `src/app/api/v1/test/seed/route.ts:190` -- local `escapeLike()`

**Why this is a problem**
The cycle 5 review (ARCH-Q1) identified 9+ files with duplicated LIKE escape logic and created `src/lib/db/like.ts` as a shared utility. However, 5 files still have their own local `escapeLike()` functions instead of importing the shared one. This is a DRY violation and increases the risk of future inconsistencies.

**Fix**
Replace all local `escapeLike()` functions with `import { escapeLikePattern } from "@/lib/db/like"`.

---

### F5: Drizzle `like()` helper used without `ESCAPE '\\'` clause in page components

**Severity:** LOW | **Confidence:** HIGH | **Category:** SQL consistency / Portability

**Files / regions**
- `src/app/(dashboard)/dashboard/problems/page.tsx:172-173`
- `src/app/(public)/submissions/page.tsx:171-172`
- `src/app/(dashboard)/dashboard/submissions/page.tsx:84-85`
- `src/app/(dashboard)/dashboard/admin/submissions/page.tsx:111-112`
- `src/app/api/v1/admin/submissions/export/route.ts:65-66`
- `src/app/(public)/practice/page.tsx:162-163`

**Why this is a problem**
These files use the Drizzle ORM `like(column, pattern)` helper, which generates `column LIKE pattern` without an `ESCAPE '\\'` clause. While the pattern is correctly escaped using `escapeLike()` / `escapePracticeLike()`, the SQL standard does not guarantee the default escape character. All API routes that were migrated use `sql\`... LIKE ... ESCAPE '\\'\`` for consistency. These page components should follow the same pattern.

Note: This is a consistency/portability concern, not an active vulnerability, since PostgreSQL defaults to backslash escaping.

**Fix**
Migrate from `like(column, pattern)` to `sql\`${column} LIKE ${pattern} ESCAPE '\\'\`` for all these queries.

---

### F6: `auth/config.ts` login query fetches `passwordHash` on every login attempt

**Severity:** LOW | **Confidence:** MEDIUM | **Category:** Data minimization

**Files / regions**
- `src/lib/auth/config.ts:180-188`

**Why this is a problem**
The login flow uses `db.query.users.findFirst({ where: ... })` without column restriction, fetching all columns including `passwordHash` on every login attempt. While `passwordHash` IS needed for the actual password verification, it doesn't need the full user row. More importantly, the second query at line 185 (email fallback) also fetches all columns.

This is a minor concern since `passwordHash` is needed for the flow. However, the query also loads `preferredLanguage`, `editorTheme`, `editorFontSize`, `editorFontFamily`, `lectureMode`, `lectureFontScale`, `lectureColorScheme` which are not needed for the auth check itself -- they're only copied to the response object, which could be done in a separate query after auth succeeds.

**Fix**
This is low priority. A two-phase approach (auth-only columns first, then full profile on success) would reduce unnecessary data loading on failed login attempts.

---

## POSITIVE OBSERVATIONS

1. The shared `escapeLikePattern()` utility is now consistently used in all API routes.
2. The `safeUserSelect` and `authUserSelect` helpers in `src/lib/db/selects.ts` provide reusable column selection patterns.
3. The `registerAuditFlushOnShutdown()` in `node-shutdown.ts` properly handles the shutdown concern.
4. Timing-safe token comparison (`safeTokenCompare`) is used consistently across all auth paths.
5. The `isAllowedJudgeDockerImage` validator properly rejects `..` sequences.
6. Docker sandbox is comprehensive: network=none, cap-drop=ALL, seccomp, read-only, user 65534.
7. Zod validation is consistently applied to all mutation endpoints via `createApiHandler`.
8. The `sanitizeHtml()` function properly restricts tags, attributes, and URI schemes.
9. CSRF protection is thorough: X-Requested-With + Origin + Sec-Fetch-Site checks.
10. Encryption module now properly throws in production when key is missing.

---

## SUMMARY TABLE

| ID | Severity | Category | File(s) | Confidence |
|----|----------|----------|---------|------------|
| F1 | MEDIUM | SQL safety / A03 Injection | admin/files/page.tsx:88 | HIGH |
| F2 | MEDIUM | Reliability / Double-flush | events.ts:238-244, node-shutdown.ts | HIGH |
| F3 | LOW | Data minimization | recruiting-token.ts:28-30 | HIGH |
| F4 | LOW | DRY / Consistency | 5 files with local escapeLike | HIGH |
| F5 | LOW | SQL consistency / Portability | 6 page components using like() | HIGH |
| F6 | LOW | Data minimization | auth/config.ts:180-188 | MEDIUM |
