# Cycle 26 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/cycle-26-aggregate.md`

---

## Scope

This cycle addresses the new cycle-26 findings from the multi-agent review:
- AGG-1: Flaky/failing test — `recruit-page-metadata.test.ts` second test case times out
- AGG-2: ESLint `no-unused-vars` warnings for `_total` destructuring in 3 API routes
- AGG-3: Recruit page makes duplicate DB query for invitation lookup — no deduplication
- AGG-4: Hardcoded `tracking-[0.35em]` on contest join access-code input — not locale-conditional

No cycle-26 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Fix failing `recruit-page-metadata.test.ts` test (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `tests/unit/recruit-page-metadata.test.ts:42`
- **Problem:** The second test case times out at 5000ms because dynamic `import()` combined with incomplete `@/lib/db` mocking causes `getRecruitingInvitationByToken` to hang. The mock for `@/lib/db` provides `db: { select: dbSelectMock }` where `dbSelectMock` is a bare `vi.fn()` — this does not support the Drizzle query builder chain (`.from().where().limit()`) used by `getRecruitingInvitationByToken`. Additionally, the `expect(dbSelectMock).not.toHaveBeenCalled()` assertion in the first test may not be testing the right thing since `generateMetadata` does not call `db.select` directly for the valid-token path.
- **Plan:**
  1. Refactor the test to remove the `@/lib/db` mock since `getRecruitingInvitationByToken` is already properly mocked via `vi.mock("@/lib/assignments/recruiting-invitations")`.
  2. Remove the `dbSelectMock` and the `expect(dbSelectMock).not.toHaveBeenCalled()` assertion (it tests an implementation detail that is not relevant to metadata generation).
  3. If dynamic `import()` is still needed, add an explicit timeout (e.g. 15000ms) as a safety net.
  4. Alternatively, convert to static imports which are more reliable with Vitest mock hoisting.
  5. Run vitest to verify the test passes.
- **Status:** DONE

### M1: Fix ESLint `no-unused-vars` warnings for `_total` destructuring (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/api/v1/files/route.ts:191`, `src/app/api/v1/submissions/route.ts:136`, `src/app/api/v1/users/route.ts:50`
- **Problem:** The pattern `rows.map(({ _total, ...rest }) => rest)` uses destructuring to strip the `_total` field from paginated results. The underscore-prefixed variable is intentionally unused, but ESLint's `@typescript-eslint/no-unused-vars` is not configured to ignore `_`-prefixed destructured names. Three warnings result.
- **Plan:**
  1. Add `destructuredArrayIgnorePattern: "^_"` to the `@typescript-eslint/no-unused-vars` rule configuration in `eslint.config.mjs`.
  2. This is the idiomatic approach — the `_` prefix convention is widely used in JavaScript/TypeScript to mark intentionally unused variables.
  3. Verify with `npx eslint src/` that the warnings are resolved.
- **Status:** DONE

### M2: Deduplicate recruit page invitation lookup via `React.cache()` (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
- **Problem:** The recruit page calls `getRecruitingInvitationByToken(token)` independently in both `generateMetadata` and the page component, resulting in 2 identical DB queries per page load. Unlike `fetch()` (which React automatically deduplicates), custom Drizzle queries have no built-in caching.
- **Plan:**
  1. Create a `React.cache()`-wrapped version of `getRecruitingInvitationByToken` in the recruit page module, or create it in the `recruiting-invitations.ts` module as a named export.
  2. Use the cached version in both `generateMetadata` and the page component.
  3. This ensures both calls return the same result within a single server render, eliminating both the duplicate query and the theoretical consistency gap.
  4. Verify the page still works correctly (metadata and page content agree).
  5. Verify the existing recruit-page-metadata test still passes.
- **Status:** DONE

### L1: Add documentation comment for `tracking-[0.35em]` on contest join access-code input (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:102`
- **Problem:** The access code `<Input>` uses `tracking-[0.35em]` unconditionally. While access codes are alphanumeric (font-mono) and this is safe for Korean, the tracking is not locale-conditional which is inconsistent with the codebase pattern. Making it locale-conditional would be over-engineering for a monospace alphanumeric field, so a documentation comment is the right approach.
- **Plan:**
  1. Add a comment above line 102: `/* tracking-[0.35em] is for alphanumeric access codes (font-mono) — safe for Korean locale */`
  2. Similarly add a comment for `tracking-widest` in `src/components/contest/access-code-manager.tsx:122`
- **Status:** DONE

---

## Deferred items

None. Every cycle-26 finding above is planned for implementation in this cycle.

---

## Progress log

- 2026-04-20: Plan created from cycle-26 aggregate review.
- 2026-04-20: H1, M1, M2, L1 all DONE. All cycle-26 findings resolved.
