# Cycle 13 Review Remediation Plan

**Created:** 2026-05-09
**Review Head:** d9887d20
**Findings Source:** `.context/reviews/_aggregate-cycle-13.md`

---

## Planned Fixes

### C13-1 — Add timeout to docker/client.ts judge worker fetches

**Severity:** MEDIUM  
**File:** `src/lib/docker/client.ts:108-112` (callWorkerJson), `src/lib/docker/client.ts:139-143` (callWorkerNoContent)  
**Issue:** `fetch()` calls to the judge worker lack timeout/abort signals. A hung worker can cause indefinite request hangs.  
**Fix:** Add `signal: AbortSignal.timeout(N)` to both fetches. Use 30s for `callWorkerJson` (JSON parsing may take time) and 10s for `callWorkerNoContent`.

**Status:** PENDING

### C13-2 — Add timeout to hCaptcha verification fetch

**Severity:** LOW  
**File:** `src/lib/security/hcaptcha.ts:60-66`  
**Issue:** hCaptcha verification `fetch()` lacks a timeout. Unlike other external API calls (OpenAI, Anthropic, code-similarity), this fetch is unprotected.  
**Fix:** Add `signal: AbortSignal.timeout(10_000)` to the fetch call in `verifyHcaptchaToken`.

**Status:** PENDING

---

## Deferred Items

No new deferred items. All carry-forward deferred items from prior cycles remain valid with unchanged exit criteria. See `_aggregate-cycle-13.md` for full deferred inventory.

---

## Areas Verified This Cycle

- **Security**: Auth pipeline, CSRF, rate limiting, server actions origin validation, public signup, file serving, backup/restore
- **Correctness**: Docker client, hCaptcha, compiler execute, code similarity client, chat widget providers
- **Performance**: AbortController coverage, timer leaks, promise chains
- **Architecture**: API handler factory, raw API route coverage
- **Infrastructure**: Export engine, SSE events, discussions data

---

## Gate Results

TBD — will be recorded after fixes are implemented.

---

## Implementation Order

1. C13-2 (hCaptcha timeout) — simpler fix, single line
2. C13-1 (Docker client timeouts) — two functions to update

---

## Deploy Results

TBD — will be recorded after gates pass.
