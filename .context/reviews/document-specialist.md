# Document Specialist Review — Cycle 34

**Reviewer:** document-specialist
**Date:** 2026-05-10
**Scope:** Documentation/code mismatches, comment accuracy

---

## Findings

### C34-DS-1: [MEDIUM] `apiFetchJson` docs claim "safe wrapper" but parse failures are silent

**File:** `src/lib/api/client.ts:98-106`
**Confidence:** HIGH

The doc comment lists three eliminated footguns: (1) forgetting to check `res.ok`, (2) forgetting `.catch()` on `.json()`, (3) calling `.json()` twice. While accurate, the documentation does NOT mention that JSON parse failures are completely silent — there is no logging, no warning, no event. This contradicts the broader module convention stated at line 20: "Never silently swallow errors."

**Fix:** Update the doc comment to note the silent fallback behavior, and add a development-only warning.

---

### C34-DS-2: [LOW] `startRateLimitEviction` lacks documentation on teardown

**File:** `src/lib/security/rate-limit.ts:70-75`
**Confidence:** MEDIUM

The function starts a background process but documents nothing about:
- When it should be called
- How to stop it
- Whether it is safe to call multiple times

**Fix:** Add JSDoc comment explaining lifecycle and that a stop function is available (after adding one).

---

### C34-DS-3: [LOW] `anti-cheat-monitor` heartbeat scheduling behavior undocumented

**File:** `src/components/exam/anti-cheat-monitor.tsx:185-191`
**Confidence:** LOW

The heartbeat continues scheduling while the tab is hidden. There is no comment explaining why this is intentional (to resume heartbeats when visible again) or noting the potential waste.

**Fix:** Add comment explaining the scheduling behavior.

---

## Previously Addressed (cycle 33)

- C33-DS-1 (apiFetchJson fetch error docs): **FIXED** — fetch now wrapped in try/catch
- C33-DS-2 (contests layout TODO): **FIXED** — upstream issue link added

## Positive Observations

1. `api/client.ts` has excellent inline documentation with examples.
2. Anti-cheat storage module has thorough rationale comments.
3. Rate-limit modules cross-reference each other to prevent drift.
