# Document Specialist Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** document-specialist
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

- apiFetch JSDoc example: Updated to show i18n-first error pattern (cycle 11)

## Findings

### DOC-1: `apiFetch` JSDoc does not document success-path `.json()` safety pattern [LOW/MEDIUM]

**File:** `src/lib/api/client.ts` (apiFetch JSDoc)

**Description:** Carried from DOC-1 (cycle 13). The `apiFetch` JSDoc documents the error-path pattern (use `.json().catch(() => ({}))` on error paths) but does not provide guidance for the success path. The codebase has inconsistent success-path handling — some components use `.catch()` and others don't. The JSDoc should document the recommended pattern for both paths.

This documentation gap directly contributes to the recurring unguarded `res.json()` findings across cycles 11-14.

**Fix:** Update the JSDoc to include a success-path example:
```typescript
// Success path — also use .catch() for resilience:
const { data } = await res.json().catch(() => ({ data: null }));
if (!data) { /* handle parse failure */ }
```

**Confidence:** HIGH

---

### DOC-2: `encryption.ts` plaintext fallback lacks migration guidance [LOW/LOW]

**File:** `src/lib/security/encryption.ts:73-76`

**Description:** Carried from DOC-2 (cycle 13). The JSDoc for `decrypt()` documents the plaintext fallback but does not document when the fallback can be deprecated, how to migrate existing plaintext data, or what security implications the fallback has.

**Fix:** Add migration guidance to the JSDoc or create a separate migration document.

**Confidence:** LOW

---

### DOC-3: `apiFetch` JSDoc does not mention the double-read anti-pattern [LOW/MEDIUM]

**File:** `src/lib/api/client.ts` (apiFetch JSDoc)

**Description:** The codebase has instances of calling `res.json()` twice on the same response (e.g., `create-problem-form.tsx:332,336`). The `apiFetch` JSDoc should explicitly warn against this anti-pattern since the Response body can only be consumed once.

**Fix:** Add a warning to the JSDoc:
```typescript
// WARNING: Response body can only be read once.
// Do NOT call res.json() twice on the same response.
// Parse once and branch on res.ok:
const data = await res.json().catch(() => ({}));
if (!res.ok) { /* handle error */ }
// use data for success
```

**Confidence:** MEDIUM

---

## Final Sweep

The documentation gaps in `apiFetch` JSDoc (DOC-1, DOC-3) directly contribute to the recurring unguarded `res.json()` and double-read findings. Updating the JSDoc with both success-path guidance and the double-read warning would help prevent future instances of these patterns.
