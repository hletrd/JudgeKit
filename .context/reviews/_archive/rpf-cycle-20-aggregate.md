# RPF Cycle 20 — Aggregate Review (Fresh)

**Date:** 2026-04-24
**Base commit:** 9bd909a2
**Review artifacts:** rpf-cycle-20-code-reviewer.md, rpf-cycle-20-security-reviewer.md, rpf-cycle-20-debugger.md, rpf-cycle-20-perf-reviewer.md

## Previous Findings Resolution

| Previous ID | Finding | Resolution |
|-------------|---------|------------|
| AGG-1 (prev cycle 20) | Unguarded `.json()` + undefined navigation in create-group-dialog | FIXED — `.catch()` + guard present |
| AGG-2 (prev cycle 20) | Unguarded `.json()` in admin-config test-connection | FIXED — `.catch()` present |
| AGG-3 (prev cycle 20) | Unguarded `.json()` in AI provider chatWithTools | FIXED — `.catch()` on all three |
| AGG-4 (prev cycle 20) | Unguarded `.json()` in comment-section GET fetch | FIXED — `.catch()` present |
| AGG-5 (prev cycle 20) | `Number()` NaN risk in admin-config | FIXED — `parseInt()` with fallbacks |
| AGG-6 (prev cycle 20) | `Number()` NaN risk in assignment-form-dialog | FIXED — `parseInt()` with fallback |
| AGG-7 (prev cycle 20) | `apiFetchJson` JSDoc missing `.catch()` mention | FIXED — JSDoc updated |
| AGG-8 (prev cycle 20) | Test connection result not announced to screen readers | FIXED — `role="status"` + `aria-live="polite"` |

## New Deduped Findings (sorted by severity then signal)

### AGG-1: Raw server error leaked to users via `toast.error()` — 4 files, 6 locations [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1, CR-2, CR-3, CR-5), security-reviewer (SEC-1)

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:73`
- `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:137,160,187`
- `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:146`
- `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:38`

**Description:** These locations pass raw server error strings to `toast.error()`. The server error could contain SQL constraint names, stack traces, or other internal details. The most dangerous variant is `database-backup-restore.tsx:146` where the raw error is used as a `t()` translation key — if it doesn't match a key, the raw string is shown verbatim.

**Concrete failure scenario:** A database constraint violation returns `{ "error": "duplicate key value violates unique constraint \"users_email_key\"" }`. The raw SQL constraint name is displayed to the end user, aiding reconnaissance.

**Fix:** Use `console.error(rawError); toast.error(localizedLabel)` pattern for all locations.

---

### AGG-2: `problem-import-button.tsx:44` navigates to `/dashboard/problems/undefined` when JSON parse fallback fires [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-4), debugger (DBG-1)

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:42-44`

**Description:** After `res.ok`, line 42 calls `res.json().catch(() => ({ data: {} }))`. If the `.catch()` fires (non-JSON success body), `result.data.id` is `undefined`. Line 44 navigates to `/dashboard/problems/undefined`.

**Concrete failure scenario:** A CDN returns `200 OK` with an HTML body. `.json()` throws `SyntaxError`, caught by `.catch()`. The user sees "Import success" toast but lands on a broken page.

**Fix:** Add guard: `const problemId = result.data?.id; if (problemId) { router.push(`/dashboard/problems/${problemId}`); } else { router.push("/dashboard/problems"); }`.

---

## Previously Deferred Items (Carried Forward)

- DEFER-1: Practice page Path B progress filter (SQL CTE required)
- DEFER-2: Mobile menu sign-out button touch target
- DEFER-3: ESLint rule to prevent unguarded `.json()` calls
- DEFER-4: Component tests for create-group-dialog, admin-config, comment-section, providers
- D1: JWT authenticatedAt clock skew with DB tokenInvalidatedAt
- D2: JWT callback DB query on every request — add TTL cache
- A19: `new Date()` clock skew risk in remaining routes
- DEFER-20 through DEFER-57: See previous aggregate for full list

## Agent Failures

None.
