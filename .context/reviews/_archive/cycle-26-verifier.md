# Cycle 26 Verifier Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## V-1: Failing test confirms real bug — `recruit-page-metadata.test.ts` [HIGH/HIGH]

**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** Evidence: running `npx vitest run` produces `1 failed | 287 passed (288)` with the second test in `recruit-page-metadata.test.ts` timing out at 5000ms. This is not a flaky test — it fails consistently. The error is `Test timed out in 5000ms`, indicating the async operation never completes. The dynamic `import()` pattern combined with the mock setup for `@/lib/db` (providing `db: { select: dbSelectMock }` where `dbSelectMock` is a bare `vi.fn()`) does not support the Drizzle query builder chain used by `getRecruitingInvitationByToken`.
**Fix:** Fix the mock or use static imports. See DBG-1 for root cause.

## V-2: ESLint warnings confirmed — 3 `no-unused-vars` for `_total` [MEDIUM/HIGH]

**Files:** `src/app/api/v1/files/route.ts:191`, `src/app/api/v1/submissions/route.ts:136`, `src/app/api/v1/users/route.ts:50`
**Description:** Evidence: running `npx eslint src/` produces 3 warnings, all for `_total` being defined but never used in destructuring patterns. The variables ARE used conceptually (they are destructured to strip the field), but ESLint's static analysis flags them.
**Fix:** Configure the eslint rule or use an ignore pattern.

## V-3: Duplicate DB query in recruit page verified by code reading [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** Verified that both `generateMetadata` (line 19) and the page component (line 56) independently call `getRecruitingInvitationByToken(token)`. No caching or deduplication is in place.
**Fix:** Add `React.cache()` wrapper.

---

## Verified Safe

- Auth flow: Argon2id hashing, timing-safe dummy hash, rate limiting, proper session invalidation — all confirmed working.
- No `dangerouslySetInnerHTML` without sanitization.
- No `console.log` in production code.
- No `as any` type casts.
- No silently swallowed catch blocks.
- Environment variables properly validated in production.
