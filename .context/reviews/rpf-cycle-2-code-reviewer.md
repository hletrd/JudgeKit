# RPF Cycle 2 (2026-05-01) — Code Reviewer

**Date:** 2026-05-01
**HEAD reviewed:** `70c02a02` (docs(plans): mark cycle 1 RPF plan done; archive to plans/done/)

## Review scope

Full codebase scan of 567 source files (87,697 lines). Focus: cycle-1 change surface (24 files), carry-forward verification, cross-file correctness.

## Findings

### C2-CR-1: [MEDIUM] encryption.ts JSDoc says "base64" but code uses "hex" encoding

- **File:** `src/lib/security/encryption.ts:5-6`
- **Description:** Module-level JSDoc says "followed by base64(IV || authTag || ciphertext)" but the actual implementation (line 78) uses `toString("hex")`. The `decrypt()` function (lines 127-129) uses `Buffer.from(..., "hex")`. The code is internally consistent and works correctly, but the module-level JSDoc is wrong. Anyone reading the docs and implementing decryption in another language or tool would use base64 decoding on hex-encoded data, producing silent data corruption.
- **Confidence:** HIGH
- **Fix:** Change "base64(IV || authTag || ciphertext)" to "hex(IV || authTag || ciphertext)" in the module-level JSDoc.

### C2-CR-2: [LOW] Dead `_context` parameter still passed from bulk users route

- **File:** `src/lib/users/core.ts:57` (definition), `src/app/api/v1/users/bulk/route.ts:73-76` (call site)
- **Description:** `validateAndHashPassword` accepts `_context?: { username?: string; email?: string | null }` but it's prefixed `_` (unused). After cycle 1's removal of username/email/password checks, the parameter is dead code. However, `bulk/route.ts:73-76` still passes it:
  ```ts
  const passwordResult = await validateAndHashPassword(item.password, {
    username: item.username,
    email: item.email?.trim() || null,
  });
  ```
  Other call sites (change-password.ts, public-signup.ts, users/route.ts) correctly omit it.
- **Confidence:** HIGH
- **Fix:** Remove `_context` parameter from `validateAndHashPassword` signature. Update bulk/route.ts call site.

### C2-CR-3: [LOW] Type assertion bypasses type safety in isNaN check

- **File:** `src/lib/assignments/submissions.ts:664`
- **Description:** `isNaN(bestScore as number)` uses a type assertion to bypass TypeScript. At this point `bestScore` is `number | null`. The `as number` cast hides the null possibility. While the NaN check would still work at runtime (isNaN(null) is false), the assertion is misleading.
- **Confidence:** MEDIUM
- **Fix:** Use explicit narrowing: `if (bestScore !== null && isNaN(bestScore)) bestScore = null;`

### C2-CR-4: [LOW] Further parallelization opportunity in getAssignmentStatusRows

- **File:** `src/lib/assignments/submissions.ts:563-646`
- **Description:** Cycle 1 parallelized the first 3 independent queries. The `overrideRows` query at line 639 is also independent of `problemAggRows` and could run in parallel with it.
- **Confidence:** MEDIUM
- **Fix:** Run `rawQueryAll` and the overrides query via `Promise.all`.

## Carry-forward verification

All carry-forward items from cycle 1 verified at HEAD `70c02a02`:
- C1-AGG-1 (password validation): RESOLVED
- C1-AGG-2 (latestSubmittedAt): RESOLVED
- C1-AGG-3 (import.ts any types): still DEFERRED at `src/lib/db/import.ts:19`
- C1-AGG-5 (query parallelization): RESOLVED
- All other carry-forwards unchanged at HEAD
