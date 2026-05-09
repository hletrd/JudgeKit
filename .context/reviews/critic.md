# Critic Review — Cycle 15 Review

**Date:** 2026-05-09
**HEAD:** e7d25c46
**Scope:** Multi-perspective critique of the whole codebase

## Summary

One design-level observation was identified. The codebase continues to show strong consistency.

## Findings

### CT-1: apiFetch wrapper design is too minimal for a production app

- **File:** `src/lib/api/client.ts:74-89`
- **Confidence:** Medium
- **Severity:** Medium
- **Problem:** The `apiFetch` wrapper is documented as "Wrapper around fetch() that adds the required X-Requested-With header for CSRF protection." But it doesn't protect against several common fetch footguns that are well-documented in the file's own comment block:
  1. No default timeout (causes indefinite hangs)
  2. No automatic retry for transient network failures
  3. No request deduplication for identical in-flight requests
  4. No automatic parsing of JSON error responses
- **Contradiction:** The file contains extensive documentation about fetch anti-patterns (checking `response.ok` before `.json()`, body consumption rules), but the wrapper itself doesn't enforce any of these patterns. Callers must manually implement them every time.
- **Cross-perspective:** From code quality, this is a missed abstraction opportunity. From UX, it means every component author must remember to handle timeouts, retries, and error parsing correctly. From maintenance, it leads to inconsistent error handling across the UI.
- **Fix:** Enhance `apiFetch` with a default timeout. Consider adding an opt-in retry mechanism for network errors. The `apiFetchJson` helper already addresses parsing safety — promote its use more broadly.

## Prior Fixes Verified

- C14 copy-code-button timer leak: Fixed
- C14 language-config-table shared AbortController: Fixed

## Final Sweep

No contradictions between modules, no inconsistent error handling strategies, no mismatched frontend/backend contracts found.
