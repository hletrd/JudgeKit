# RPF Cycle 20 — Document Specialist

**Date:** 2026-04-22
**Base commit:** 4182e529

## Findings

### DOC-1: `apiFetchJson` JSDoc does not mention that it also guards success-path `.json()` [LOW/MEDIUM]

**File:** `src/lib/api/client.ts:87-123`

**Description:** The `apiFetchJson` JSDoc explains it handles "forgetting to check `res.ok`" and "forgetting `.catch()` on `.json()` calls" but does not explicitly state that it applies the `.catch()` to the success-path `.json()` call as well. Developers may assume `apiFetchJson` only handles error paths, leading them to continue using raw `apiFetch` + `.json()` on success paths.

**Fix:** Update the JSDoc to explicitly state: "Both success and error response JSON parsing is wrapped in `.catch()`, ensuring non-JSON bodies never throw SyntaxError regardless of the HTTP status code."

---

### DOC-2: `create-group-dialog.tsx` — `getErrorMessage` catches SyntaxError but no code comment explains why [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:44-46`

**Description:** The `getErrorMessage` function explicitly handles `SyntaxError` (added in a previous cycle), but there is no code comment explaining this is specifically for the unguarded `.json()` on line 74. Without the comment, a future developer might remove the SyntaxError check thinking it's unnecessary, not realizing line 74 lacks `.catch()`.

**Fix:** Either add `.catch()` to line 74 (preferred), or add a comment explaining the SyntaxError handler is needed for the unguarded `.json()` call.

---

## Verified Safe (No Issue Found)

- `apiFetch` JSDoc correctly documents the `.json()` anti-pattern and the success-first pattern
- `forceNavigate` JSDoc properly documents when to prefer `router.push()`
- `formatting.ts` functions have comprehensive JSDoc with examples
- `apiFetchJson` JSDoc correctly describes the fallback parameter behavior
