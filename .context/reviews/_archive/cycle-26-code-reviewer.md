# Cycle 26 Code Review — Code Quality & Logic

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## CR-1: Flaky test — `recruit-page-metadata.test.ts` times out on second test case [HIGH/HIGH]

**Files:** `tests/unit/recruit-page-metadata.test.ts:42`
**Description:** The second test case ("uses generic metadata for valid public invite tokens") consistently times out at the 5000ms vitest default. The test uses dynamic `import()` to load the page module, which re-triggers all module-level side effects (including `vi.mock` calls). The `generateMetadata` function in `src/app/(auth)/recruit/[token]/page.tsx` calls `getRecruitingInvitationByToken()` which does a real DB query via Drizzle when mocks are not properly isolated between dynamic imports. The mock for `@/lib/db` is set up with `dbSelectMock` but the `generateMetadata` function does not call `db.select` — it calls `getRecruitingInvitationByToken` which uses `db` directly. The `dbSelectMock` assertion `expect(dbSelectMock).not.toHaveBeenCalled()` may also be stale since `generateMetadata` never calls `db.select` directly for the valid-token path.
**Concrete failure scenario:** Running `npx vitest run` fails with 1 test timing out. CI would fail on this test.
**Fix:** Increase test timeout, or refactor the test to avoid dynamic `import()` (use static import with proper mock setup), or mock `getRecruitingInvitationByToken` more robustly for the async module reload.

## CR-2: ESLint `no-unused-vars` warnings for `_total` destructuring in 3 API routes [MEDIUM/HIGH]

**Files:**
- `src/app/api/v1/files/route.ts:191`
- `src/app/api/v1/submissions/route.ts:136`
- `src/app/api/v1/users/route.ts:50`

**Description:** The pattern `rows.map(({ _total, ...rest }) => rest)` uses destructuring to strip the `_total` field from paginated results. The underscore-prefixed variable is intentionally unused, but ESLint's `@typescript-eslint/no-unused-vars` does not have an `argsIgnorePattern` or `destructuredArrayIgnorePattern` configured for `_`-prefixed names. The 3 warnings will block any `eslint --max-warnings=0` CI gate.
**Concrete failure scenario:** CI with `--max-warnings=0` fails the pipeline despite zero errors.
**Fix:** Either (a) add `destructuredArrayIgnorePattern: "^_"` to the eslint rule config, or (b) use a rest-only pattern: `rows.map(({ _total: _, ...rest }) => rest)` with `_` as a conventional ignore name, or (c) update eslint config with `argsIgnorePattern: "^_"`.

## CR-3: Hardcoded `tracking-[0.35em]` on contest join access-code input — not locale-conditional [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:102`
**Description:** The access code input has `className="text-center text-xl tracking-[0.35em] font-mono h-12"`. While this is a `<Input>` for an access code (typically alphanumeric), the `tracking-[0.35em]` is not locale-conditional. If the access code can contain Korean characters (unlikely but possible for user-generated codes), this would violate CLAUDE.md's Korean letter-spacing rule. More importantly, this is inconsistent with the established pattern used everywhere else in the codebase.
**Concrete failure scenario:** Minor consistency issue — all other tracking classes in the codebase are locale-conditional; this one is not.
**Fix:** Since access codes are alphanumeric (font-mono), this is arguably safe as-is. Add a comment `/* access codes are alphanumeric — tracking safe for Korean locale */` for documentation consistency, or make it locale-conditional for uniformity.

## CR-4: `access-code-manager.tsx:122` uses `tracking-widest` on a `<code>` element displaying an access code — not locale-conditional [LOW/LOW]

**Files:** `src/components/contest/access-code-manager.tsx:122`
**Description:** `<code className="flex-1 text-center text-lg font-mono tracking-widest">` renders the displayed access code. Access codes are alphanumeric and rendered in monospace, so Korean text is not expected. However, this is another instance where the tracking is not locale-conditional, creating inconsistency.
**Concrete failure scenario:** No real user impact — access codes are always alphanumeric.
**Fix:** Add a comment noting that `tracking-widest` is safe for monospace access codes. No code change needed.

## CR-5: Recruit page calls `getRecruitingInvitationByToken` twice — once in `generateMetadata` and once in the page component [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Description:** The recruit page module has both a `generateMetadata` function and a default page component. Both independently call `getRecruitingInvitationByToken(token)`, resulting in two DB queries for the same token on every page load. In Next.js, `generateMetadata` and the page component run in the same server render, but there is no built-in deduplication for custom DB queries (unlike `fetch` which React caches automatically).
**Concrete failure scenario:** Every recruit page load performs 2 identical DB queries to look up the invitation by token, wasting DB resources and adding latency.
**Fix:** Use `React.cache()` to wrap `getRecruitingInvitationByToken` in the page module, or restructure to pass the invitation from metadata to the page via a shared cached function.

---

## Final Sweep

- No `console.log` in production code (only one instance in a code template string for JavaScript — safe).
- No `as any` type casts.
- No `@ts-ignore` or `@ts-expect-error`.
- Only 2 eslint-disable directives, both with justification comments.
- No silently swallowed catch blocks.
- `dangerouslySetInnerHTML` uses are properly sanitized (sanitizeHtml, safeJsonForScript).
- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
