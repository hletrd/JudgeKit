# Cycle 24 Code Review

**Date:** 2026-05-09
**HEAD:** c86576a1
**Scope:** Full repository re-review at HEAD c86576a1, focusing on changes since cycle-22 (91e99c91)

---

## Prior Findings Status

All April 2026 cycle-24 findings verified at current HEAD:
- CR-1 (dead titleKeyByMode): Fixed - app-sidebar.tsx no longer has this dead code
- CR-2/CR-3/CR-4/CR-5 (silent error swallowing): All fixed in prior cycles
- CR-6 (ContestsLayout interception): Still present; this is a known Next.js workaround

---

## New Findings

### CR-1: [MEDIUM] Export redaction map merge uses object spread that could lose columns

**Files:** `src/lib/db/export.ts:78`
**Confidence:** HIGH

The active redaction map is built with:
```typescript
const activeRedactionMap = options.sanitize
  ? { ...EXPORT_SANITIZED_COLUMNS, ...EXPORT_ALWAYS_REDACT_COLUMNS }
  : EXPORT_ALWAYS_REDACT_COLUMNS;
```

For tables present in both objects (users, sessions, accounts, apiKeys, systemSettings), the Set from `EXPORT_ALWAYS_REDACT_COLUMNS` overwrites the one from `EXPORT_SANITIZED_COLUMNS`. Currently these Sets are identical for overlapping tables, but if a future change adds a column to only one of them for the same table, the spread will silently drop it.

**Concrete failure:** Developer adds `users.someNewSecret` to `EXPORT_SANITIZED_COLUMNS` but not to `EXPORT_ALWAYS_REDACT_COLUMNS`. During a sanitized export, the `users` entry from ALWAYS (which doesn't have `someNewSecret`) overwrites the SANITIZED entry, and `someNewSecret` is exported in plaintext.

**Fix:** Merge the Sets explicitly per table:
```typescript
function mergeRedactionMaps(
  sanitized: Record<string, Set<string>>,
  always: Record<string, Set<string>>
): Record<string, Set<string>> {
  const merged: Record<string, Set<string>> = {};
  for (const [table, cols] of Object.entries(sanitized)) {
    merged[table] = new Set([...cols, ...(always[table] ?? [])]);
  }
  for (const [table, cols] of Object.entries(always)) {
    if (!merged[table]) merged[table] = new Set(cols);
  }
  return merged;
}
```

---

### CR-2: [LOW] Missing explicit return type on normalizeValue

**Files:** `src/lib/db/export.ts:225`
**Confidence:** LOW

`normalizeValue` lacks an explicit return type annotation. While TypeScript infers `unknown`, this makes the function contract implicit.

**Fix:** Add explicit return type `unknown`.

---

## Areas Verified (No Issues Found)

- All `Date.now()` usages in server code are either in Edge Runtime contexts (proxy.ts) or documented as intentional
- All timer/setInterval usages have proper cleanup
- No `eval()` or `new Function()` in source
- No `as any` casts in server code (only in test files and documented edge cases)
- All JSON.parse calls have try/catch or are in safe contexts
- SQL injection prevention verified: all raw SQL uses parameterized queries or module-level constants
- Korean letter spacing: no `tracking-*` applied to Korean text
- Contest access token expiry is correctly implemented across all queries
- ICPC tie-breaker direction corrected (earlier last AC ranks better)
- Logger redaction paths centralized in secrets.ts
