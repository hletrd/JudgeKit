# Debugger — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## New Findings

### C29-DBG-1: Recruiting token length — unbounded memory allocation before validation

- **File:** `src/lib/auth/config.ts:204-215`
- **Severity:** Medium
- **Confidence:** High
- **Description:** The `credentials?.recruitToken` string is passed to `.test()` with no length check. Node.js must allocate and hold the entire string before regex evaluation. A 100MB token causes 100MB allocation before rejection.
- **Failure mode:** Memory pressure → potential OOM on constrained instances → denial of service.
- **Fix:** Add `credentials.recruitToken.length > 128` check before regex, or use `/^[-A-Za-z0-9_]{16,128}$/`.

---

## Carry-Forward Findings

### DB-26-1: Transaction wrapper inconsistency
- **File:** `src/app/api/v1/judge/poll/route.ts:77,136`
- **Status:** Still present. 9+ cycles deferred.

### C27 findings (Docker inspect, prompt sanitization, DELETE audit)
- **Status:** Still present.

---

## Regressions Checked

- Timer cleanup: correct
- Event listener cleanup: correct
- AbortController cleanup: correct
- Stream reader cleanup: correct (chat widget streams have proper releaseLock)
- Async flow handling: correct

## Final Sweep

No new latent bugs in timer handling, event listener management, async flow, or state mutation.
