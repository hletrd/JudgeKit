# Security Review — Cycle 2

**Reviewer:** security-reviewer
**Date:** 2026-04-28
**Scope:** Verification of cycle 1 fixes + new security review

---

## Cycle 1 Fix Verification

All cycle 1 HIGH/MEDIUM security findings were deferred (AGG-4, AGG-5, AGG-6) — no security fixes were applied. These remain valid.

---

## New Findings

### SEC-C2-1: [MEDIUM] Import route JSON path `as Record<string, unknown>` cast is unsafe

**File:** `src/app/api/v1/admin/migrate/import/route.ts:162`
**Confidence:** HIGH

```tsx
const rawRecord = rawJsonBody as Record<string, unknown>;
```

After Zod validation of `{ password, data? }`, the code casts `rawJsonBody` (which is `unknown` from `readJsonBodyWithLimit`) to `Record<string, unknown>`. If `rawJsonBody` is not an object (e.g., an array `["malicious"]`), this cast is unsound and `restFields` would produce unexpected results. The subsequent `restFields as unknown as JudgeKitExport` then treats this as a valid export.

While `validateExport()` catches structural issues, the cast chain allows a non-object to reach validation with unexpected shape. This is a defense-in-depth concern.

**Fix:** Add a runtime type check: `if (typeof rawJsonBody !== "object" || rawJsonBody === null || Array.isArray(rawJsonBody)) return error response`.

---

### SEC-C2-2: [LOW] Password comparison timing side-channel in import route

**File:** `src/app/api/v1/admin/migrate/import/route.ts:65`
**Confidence:** LOW

The multipart path uses `verifyAndRehashPassword()` which is timing-safe. The JSON body path (line 155) also uses `verifyAndRehashPassword()`. Both paths are consistent. No new issue.

---

## Carried Deferred Items Re-verified

- DEFER-22: `.json()` before `response.ok` — Still present. No change.
- DEFER-27: Missing AbortController on polling fetches — No new instances found in recently modified files.
- DEFER-28: `as { error?: string }` pattern — Still present. No change.
- DEFER-29: Admin routes bypass `createApiHandler` — Still present. No change.
- DEFER-30: Recruiting validate token brute-force — No change.
