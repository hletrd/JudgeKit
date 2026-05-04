# Code Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** code-reviewer
**HEAD reviewed:** `767b1fee`
**Scope:** Full codebase — recent changes + carry-forward verification

---

## Recent changes verification

### ConditionalHeader component (commit `767b1fee`)
- **File:** `src/components/layout/conditional-header.tsx`
- **Status:** CLEAN — Properly uses `usePathname()` for client-side route detection. The `startsWith("/dashboard/admin")` check correctly hides the top navbar on admin pages. Type props are well-defined.

### i18n hardcoded string fixes (commit `95cbcf6a`)
- **File:** `messages/en.json`, `messages/ko.json`, contest and community pages
- **Status:** CLEAN — `metadataFallbackTitle` and `keywords.*` keys added. Contest page now uses `tContest("metadataFallbackTitle")` and `tContest("keywords.programmingContest")` etc.

### Discussions data refactor (commit `82e1ea9e`)
- **File:** `src/lib/discussions/data.ts`
- **Status:** CLEAN — `compareThreadsByPinnedVoteScoreDate` shared comparator eliminates duplication. SQL WHERE filters replace JS-side filtering for scope/state.

### Code similarity performance (commit `7f29d897`)
- **File:** `src/lib/assignments/code-similarity.ts`
- **Status:** CLEAN — `performance.now()` replaces `Date.now()` for yield timing. Monotonic clock avoids NTP jump issues.

---

## New findings

### C2-CR-1: [LOW] `import.ts` TABLE_MAP still typed as `Record<string, any>`

- **File:** `src/lib/db/import.ts:19-24`
- **Confidence:** MEDIUM (carry-forward from C1-CR-2)
- **Description:** `TABLE_MAP` is still typed as `Record<string, any>` and `buildImportColumnSets` takes `Record<string, any>`. This bypasses type safety for the import pipeline.
- **Fix:** Use `Record<string, unknown>` with type guards, or define a proper table schema type.
- **Status:** Carry-forward. No regression.

### C2-CR-2: [LOW] 25 `console.error`/`console.log` sites in app/components

- **File:** Multiple files under `src/app/` and `src/components/`
- **Confidence:** HIGH (carry-forward from C1-AGG-3)
- **Description:** 25 client-side console sites remain. No new sites added this cycle. Previously tracked as deferred.
- **Status:** Carry-forward. No regression.

---

## Carry-forward from cycle 1

### C1-CR-1 [RESOLVED]: Password policy-code mismatch
- `src/lib/security/password.ts` now only checks minimum length. Matches AGENTS.md policy. RESOLVED.

### C1-CR-3 [CARRY]: `latestSubmittedAt` mixed-type comparison
- `src/lib/assignments/submissions.ts:625-627` — still uses `>` on `string | Date | null`. Carry-forward.

---

## No-issue confirmations

- Auth flow uses timing-safe comparison with dummy hash for user enumeration prevention. Correct.
- CSRF validation properly checks origin, sec-fetch-site, X-Requested-With. Correct.
- `createApiHandler` wrapper chains rate limiting, auth, CSRF, body validation. Correct.
- AES-256-GCM encryption with proper IV/auth tag handling. Correct.
- `sanitizeHtml` uses DOMPurify with narrow allow-list. Correct.
- `rawQueryAll`/`rawQueryOne` use parameterized queries. No SQL injection. Correct.
