# Cycle 26 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 660ae372
**Review artifacts:** `cycle-26-code-reviewer.md`, `cycle-26-security-reviewer.md`, `cycle-26-perf-reviewer.md`, `cycle-26-test-engineer.md`, `cycle-26-architect.md`, `cycle-26-critic.md`, `cycle-26-debugger.md`, `cycle-26-verifier.md`, `cycle-26-designer.md`, `cycle-26-tracer.md`, `cycle-26-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Flaky/failing test — `recruit-page-metadata.test.ts` second test case times out [HIGH/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), test-engineer (TE-1), critic (CRI-1), debugger (DBG-1), verifier (V-1)
**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** The second test case in `recruit-page-metadata.test.ts` consistently times out at the 5000ms vitest default. Root cause: the test uses dynamic `import()` to load the page module, which re-triggers module-level side effects. The mock for `@/lib/db` provides `db: { select: dbSelectMock }` where `dbSelectMock` is a bare `vi.fn()` — this does not support the Drizzle query builder chain (`.from().where().limit()`) used by `getRecruitingInvitationByToken`. The mock returns `undefined`, causing the chained call to fail silently, and the async test hangs until timeout.
**Concrete failure scenario:** Running `npx vitest run` produces `1 failed | 287 passed (288)`. CI would fail on this gate.
**Fix:** Refactor the test to use static imports with `vi.mock` hoisting, or fix the `db` mock to support the Drizzle query builder chain, or add an explicit timeout. The `getRecruitingInvitationByToken` mock IS properly set up but the dynamic import may bypass it.

### AGG-2: ESLint `no-unused-vars` warnings for `_total` destructuring in 3 API routes [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-2), critic (CRI-2), verifier (V-2)
**Files:**
- `src/app/api/v1/files/route.ts:191`
- `src/app/api/v1/submissions/route.ts:136`
- `src/app/api/v1/users/route.ts:50`

**Description:** The pattern `rows.map(({ _total, ...rest }) => rest)` uses destructuring to strip the `_total` field from paginated results. The underscore-prefixed variable is intentionally unused, but ESLint's `@typescript-eslint/no-unused-vars` is not configured to ignore `_`-prefixed destructured names. The 3 warnings will block any `--max-warnings=0` CI gate.
**Concrete failure scenario:** CI with `--max-warnings=0` fails despite zero errors.
**Fix:** Add `destructuredArrayIgnorePattern: "^_"` or `argsIgnorePattern: "^_"` to the eslint rule config in `eslint.config.mjs`, or use the explicit ignore pattern `({ _total: _, ...rest }) => rest`.

### AGG-3: Recruit page makes duplicate DB query for invitation lookup — no deduplication [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-5), perf-reviewer (PERF-1), architect (ARCH-1), critic (CRI-3), tracer (TR-1)
**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** The recruit page calls `getRecruitingInvitationByToken(token)` independently in both `generateMetadata` (line 19) and the page component (line 56). Unlike `fetch()` (which React automatically deduplicates), custom Drizzle queries have no built-in caching. This results in 2 identical DB queries per recruit page load, and creates a theoretical consistency gap where the invitation state could change between the two calls.
**Concrete failure scenario:** Under recruiting campaign load, doubled DB queries waste connection pool resources. Theoretical: metadata could show "valid" while page shows "revoked" if the token changes state between the two reads.
**Fix:** Wrap the call in `React.cache()` to deduplicate within a single server render, ensuring both metadata and page see the same data.

### AGG-4: Hardcoded `tracking-[0.35em]` on contest join access-code input — not locale-conditional [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), designer (DES-1)
**Files:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:102`
**Description:** The access code `<Input>` uses `tracking-[0.35em]` unconditionally. While access codes are alphanumeric (font-mono), the rest of the codebase consistently makes tracking locale-conditional. This is a minor pattern inconsistency.
**Concrete failure scenario:** No real user impact since access codes are always alphanumeric.
**Fix:** Add a comment `/* access codes are alphanumeric — tracking safe for Korean locale */` for documentation consistency, or make it locale-conditional for uniformity.

## Verified Safe / No Regression Found

- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- No `dangerouslySetInnerHTML` without sanitization.
- No `console.log` in production code (only one instance in a code template string — safe).
- No `as any` type casts.
- No `@ts-ignore` or `@ts-expect-error`.
- Only 2 eslint-disable directives, both with justification comments.
- No silently swallowed catch blocks.
- Environment variables are properly validated in production.
- CSRF protection is in place for server actions.
- Rate limiting has two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE) preventing TOCTOU races.
- Recruiting token flow uses atomic SQL transactions for claim validation.
- Korean letter-spacing remediation is comprehensive — all headings and labels are properly locale-conditional.
- Public nav is well-structured after "Languages" move to footer.
- SEO route matrix and robots.txt are properly synchronized.
- Inline comments properly document tracking decisions.

## Agent Failures

None. All review perspectives completed successfully.
