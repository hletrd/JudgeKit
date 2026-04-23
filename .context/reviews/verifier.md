# Verifier Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** verifier
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 verifier findings are verified fixed:
- V-1 (unguarded `res.json()` in 11+ components): Partially fixed — `apiFetchJson` helper created, 4 components migrated. 4 calls remain in 2 components.
- V-2 (double `res.json()` in create-problem-form): Fixed — single parse with `.catch()` guard
- V-3 (problem-export-button null-safety): Fixed — null-safe access added

## Findings

### V-1: Four unguarded `res.json()` calls remain — verified by code inspection [MEDIUM/HIGH]

**Files (verified):**
- `src/components/contest/recruiting-invitations-panel.tsx:137` — `const json = await invRes.json();` — NO `.catch()` guard
- `src/components/contest/recruiting-invitations-panel.tsx:152` — `const json = await statsRes.json();` — NO `.catch()` guard
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235` — `const wd = await workersRes.json();` — NO `.catch()` guard
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:241` — `const sd = await statsRes.json();` — NO `.catch()` guard

**Description:** Verified by reading each file. The `apiFetchJson` helper created in cycle 14 is used correctly in 4 components, but 4 calls in 2 files were not migrated. These are on success paths (after `res.ok` checks), but a 200 response with non-JSON body would throw SyntaxError.

**Fix:** Migrate both files to use `apiFetchJson` or add `.catch()` guards.

**Confidence:** HIGH

---

### V-2: `recruiting-invitations-panel.tsx` metadata remove button missing `aria-label` — verified [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`

**Description:** Verified: The button at line 479-485 renders only a `Trash2` icon with no `aria-label` attribute. This is an icon-only button that screen readers would announce as an unlabeled button.

**Fix:** Add `aria-label` with appropriate i18n key.

**Confidence:** HIGH

---

## Final Sweep

The `apiFetchJson` migration from cycle 14 is verified as correctly implemented in the 4 migrated components. The remaining 4 unguarded calls are verified as present. The accessibility issue with the metadata remove button is verified. No other unguarded `.json()` calls were found in the client-side codebase.
