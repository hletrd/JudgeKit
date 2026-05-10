# Verifier Review — Cycle 33

**Reviewer:** verifier
**Date:** 2026-05-10
**Scope:** Evidence-based correctness check against stated behavior

---

## Findings

### C33-VR-1: [MEDIUM] apiFetchJson behavior does not match documentation

**File:** `src/lib/api/client.ts:126-144`
**Confidence:** HIGH

The documentation claims: "Both success and error response JSON parsing is wrapped in `.catch()`, ensuring non-JSON bodies never throw SyntaxError." This is true for JSON parsing. However, the function does NOT handle `fetch()` throwing, contradicting the "safe wrapper" claim.

**Evidence:** Line 131: `const res = await apiFetch(input, init);` — no try/catch.

**Fix:** Update docs or add fetch error handling.

---

### C33-VR-2: [LOW] submission-list-auto-refresh visibility check timing

**File:** `src/components/submission-list-auto-refresh.tsx:40`
**Confidence:** MEDIUM

The component checks `document.visibilityState === "hidden"` to skip refresh. However, this check happens AFTER `isRunningRef.current = true`, meaning the tick is marked as running even when it returns early. The errorCountRef is not incremented, but isRunningRef is set and then cleared.

**Fix:** Move visibility check before `isRunningRef.current = true`.

---

### C33-VR-3: [LOW] export-button Content-Disposition parsing regex incomplete

**File:** `src/components/contest/export-button.tsx:27`
**Confidence:** MEDIUM

The regex `/filename="?([^"]+)"?/` does not handle RFC 5987 encoding (e.g., `filename*=UTF-8''%e2%g3.pdf`). While the API likely uses simple ASCII filenames, the regex is technically incomplete.

**Fix:** Document the assumption or use a more robust parser.

---

## Positive Observations

1. apiFetch documentation in client.ts is excellent and detailed.
2. Anti-cheat storage has clear comments explaining MAX_PENDING_EVENTS rationale.
3. Contests layout workaround is well-documented with TODO and explanation.
