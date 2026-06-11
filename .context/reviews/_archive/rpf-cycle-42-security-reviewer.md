# RPF Cycle 42 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** OWASP top 10, secrets, unsafe patterns, auth/authz

## Findings

### SEC-1: `problemPoints` length mismatch in quick-create allows silent point manipulation [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:17-21,89`

**Description:** The `quickCreateSchema` accepts `problemPoints` as an optional array without validating its length matches `problemIds`. When `problemPoints` is shorter, extra problems default to 100 points via `body.problemPoints?.[i] ?? 100`. While this is primarily a data integrity issue, it has a security angle: an instructor who intends low-value problems (e.g., 1-point warm-up) could accidentally create a contest where those problems are worth 100 points, significantly inflating scores.

**Concrete failure scenario:** An instructor creates a 10-problem contest with `problemPoints: [1, 2, 3]` intending a point gradient. Problems 4-10 get 100 points each instead of the intended values. Students who submit correct answers to problems 4-10 receive disproportionately high scores.

**Fix:** Add schema-level validation ensuring array lengths match.

**Confidence:** Medium

---

### SEC-2: Access-code management routes lack capability-based auth at the framework level [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts:8-45`

**Description:** All three handlers (GET, POST, DELETE) use `createApiHandler({ handler: ... })` without specifying capability requirements. Authorization is enforced only via the inner `canManageContest()` call. While safe today, this diverges from the defense-in-depth pattern used elsewhere (e.g., recruiting-invitations routes use `auth: { capabilities: ["recruiting.manage_invitations"] }`). If a future developer adds a new method without the inner check, it would be unauthenticated.

**Fix:** Add `auth: { capabilities: ["contests.manage"] }` to each handler's `createApiHandler` config.

**Confidence:** Low (no current vulnerability, pattern inconsistency)

---

## Verified: Security Controls Working Correctly

1. **SQL injection**: All queries use parameterized Drizzle ORM or raw queries with named parameters. LIKE patterns properly escaped with `escapeLikePattern`.
2. **XSS**: `dangerouslySetInnerHTML` uses DOMPurify with strict allowlists. `safeJsonForScript` properly escapes `</script` and `<!--`.
3. **CSRF**: `createApiHandler` enforces CSRF for mutation methods unless API key auth is used.
4. **Timing-safe comparisons**: `safeTokenCompare` used for CRON_SECRET validation.
5. **Rate limiting**: Applied across sensitive endpoints (anti-cheat, compiler, submissions, exam sessions).
6. **Auth/authz**: Capabilities system used consistently. Recruiting routes properly enforce `recruiting.manage_invitations`.
7. **Token handling**: Recruiting tokens are hashed before DB storage; plaintext never persisted.
8. **Clock-skew prevention**: Critical temporal comparisons use `getDbNowUncached()` / SQL `NOW()`.
9. **Advisory locks**: Used to prevent race conditions in invitation creation and submission rate limiting.
10. **HTML sanitization**: DOMPurify with restricted tags/attributes and URI regex preventing javascript: URIs.

## Sweep: Files Reviewed

- All 84 API route files under `src/app/api/v1/`
- `src/lib/security/sanitize-html.ts`
- `src/components/seo/json-ld.tsx`
- `src/lib/api/handler.ts`
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/security/ip.ts`
- `src/lib/security/csrf.ts`
- `src/lib/security/encryption.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/security/password-hash.ts`
