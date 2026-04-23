# Verifier Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## V-1: `handleBulkAddMembers` double `.json()` — body consumed twice on same Response [HIGH/HIGH]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`

**Description:** Verified by tracing the code path:
1. Line 180: `if (!response.ok)` — if true, line 181 calls `response.json()` and then `throw`.
2. Line 185: `const { enrolled, skipped } = await response.json()` — if ok, this calls `.json()`.

The branching is mutually exclusive, so no runtime error occurs today. But the API contract (Response body single-read) is violated in both branches — the code depends on only ONE branch executing. This is the documented anti-pattern from `src/lib/api/client.ts` lines 55-62.

**Fix:** Parse once before branching (same as the handleAddMember fix in this same file).

---

## V-2: Discussion components toast raw `error.message` — not i18n-safe [MEDIUM/MEDIUM]

**Files:**
- `src/components/discussions/discussion-post-form.tsx:54`
- `src/components/discussions/discussion-thread-form.tsx:61`
- `src/components/discussions/discussion-post-delete-button.tsx:36`
- `src/components/discussions/discussion-thread-moderation-controls.tsx:83,104`

**Description:** Verified: The pattern `toast.error(error instanceof Error ? error.message : errorLabel)` appears in all 4 components. The preceding `throw new Error(errorLabel)` means the normal path works, but the catch also catches the `.json()` SyntaxError on line 46/52/28/76, which would have a raw JS error message.

**Fix:** Always use i18n label in toast.

---

## V-3: `submission-overview.tsx` non-OK response silently swallowed [MEDIUM/MEDIUM]

**File:** `src/components/lecture/submission-overview.tsx:91`

**Description:** Verified: Line 91 `if (!res.ok) return;` silently returns. The `src/lib/api/client.ts` convention at line 21 explicitly states "Never silently swallow errors — always surface them to the user." This was fixed for comment-section but not for submission-overview.

**Fix:** Add toast for non-OK responses.

---

## V-4: Prior cycle fixes verified as correctly implemented

- Cycle 23 H1 (local normalizePage): Verified — all 5 files now import from `@/lib/pagination`
- Cycle 23 H2 (contest-join double .json()): Verified — now uses `apiFetchJson`
- Cycle 23 M1 (create-problem-form, group-members-manager handleAddMember): Verified — body parsed once
- Cycle 23 M2 (submission-overview Dialog): Verified — uses shared Dialog component
- Cycle 23 M3 (contest-quick-stats avgScore null): Verified — shows "---" when null

---

## Summary

- HIGH: 1 (V-1)
- MEDIUM: 2 (V-2, V-3)
- Total new findings: 3
