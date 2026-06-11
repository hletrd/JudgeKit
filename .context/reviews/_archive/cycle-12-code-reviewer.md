# Cycle 12 — Code Reviewer

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-CR1 — [MEDIUM] `authorizeRecruitingToken` manually constructs `AuthenticatedLoginUser` instead of using `mapUserToAuthFields`

- **File:** `src/lib/auth/recruiting-token.ts:55-72`
- **Confidence:** HIGH
- **Evidence:** The function manually lists every field (id, username, email, name, className, role, mustChangePassword, preferredLanguage, preferredTheme, etc.) when constructing the return value. This is the exact same pattern that was fixed in config.ts (cycle 11 AGG-1) — an inline field list that must be kept in sync with `mapUserToAuthFields`. The DB query on line 27-49 already selects all necessary columns, so the inline construction is redundant. If a new preference field is added, this site will silently miss it.
- **Suggested fix:** Use `mapUserToAuthFields(user)` and spread it into the return value, or at minimum add a comment linking this site to the AUTH_PREFERENCE_FIELDS contract.

### CR12-CR2 — [MEDIUM] `AuthUserInput` type has index signature `[key: string]: unknown` — weakens type safety

- **File:** `src/lib/auth/types.ts:71`
- **Confidence:** HIGH
- **Evidence:** The `AuthUserInput` type includes `[key: string]: unknown`, which allows any arbitrary key-value pair to be assigned without error. This was likely added for flexibility when the DB user type has extra fields (passwordHash, isActive, tokenInvalidatedAt), but it defeats the purpose of having typed fields at all. TypeScript will not flag typos like `user.preferrdLanguage` because the index signature accepts any string key.
- **Suggested fix:** Remove the index signature. If extra DB fields need to pass through, use a separate type or a `Record<string, unknown>` intersection only at the call site.

### CR12-CR3 — [LOW] `TABLE_MAP` in import.ts uses `Record<string, any>` — loses type safety

- **File:** `src/lib/db/import.ts:15,57`
- **Confidence:** HIGH
- **Evidence:** `TABLE_MAP` is typed as `Record<string, any>`, and `buildImportColumnSets` accepts `Record<string, any>`. This allows passing any object, not just Drizzle table references. A typo in a table name or a wrong schema reference would not be caught at compile time.
- **Suggested fix:** Type as `Record<string, PgTable>` or use a more specific type from the Drizzle schema.

### CR12-CR4 — [LOW] `eslint-disable` for `@typescript-eslint/no-explicit-any` in users route

- **File:** `src/app/api/v1/users/route.ts:90-91`
- **Confidence:** MEDIUM
- **Evidence:** The `any` type is used for `created` variable with an eslint-disable comment. This suggests the return type of the user creation is not properly typed. The variable is later used in a response, potentially leaking unexpected fields.
- **Suggested fix:** Define a proper type for the created user and cast/assert accordingly.

### CR12-CR5 — [LOW] `eslint-disable` for `react-hooks/exhaustive-deps` in chat-widget

- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx:131`
- **Confidence:** LOW
- **Evidence:** The useEffect dependency array is intentionally incomplete. While this may be correct by design, the suppression should include a comment explaining why the dependency is omitted.
- **Suggested fix:** Add an explanatory comment next to the eslint-disable.

### CR12-CR6 — [LOW] `eslint-disable` for `react-hooks/static-components` in plugin-config-client

- **File:** `src/app/(dashboard)/dashboard/admin/plugins/[id]/plugin-config-client.tsx:2`
- **Confidence:** LOW
- **Evidence:** Plugin admin components are lazily prebuilt at module scope. The disable has an explanatory comment, which is acceptable.

### CR12-CR7 — [MEDIUM] Dashboard layout makes 5 sequential/parallel DB queries on every page load — no caching

- **File:** `src/app/(dashboard)/layout.tsx:34-62`
- **Confidence:** MEDIUM
- **Evidence:** The dashboard layout queries: (1) recruiting access context, (2) translations, (3) capabilities + plugin status + AI status, (4) system settings + lecture mode + timed assignments, (5) more queries nested inside. While some are parallelized via Promise.all, the overall latency is high for a layout that renders on every dashboard navigation. The `getResolvedSystemSettings` call is likely redundant if the proxy already resolved it.
- **Suggested fix:** Cache capabilities per role (they don't change per request), and consider passing system settings from the proxy layer instead of re-querying.

## Previously Fixed (Verified This Cycle)

- AGG-1 (cycle 11): Inline AuthUserRecord construction eliminated from config.ts — VERIFIED
- AGG-2 (cycle 11): AUTH_TOKEN_FIELDS derived from AUTH_PREFERENCE_FIELDS — VERIFIED
- AGG-6/7 (cycle 11): SSE stream close guards — VERIFIED
