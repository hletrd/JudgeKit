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
**Fix:** Add `signal: AbortSignal.timeout(N)` to both fetches. Use 30s for `callWorkerJson` and 60s for `callWorkerNoContent`.
**Commit:** `e6d7755d`
**Status:** DONE

### C13-2 — Add timeout to hCaptcha verification fetch

**Severity:** LOW
**File:** `src/lib/security/hcaptcha.ts:60-66`
**Issue:** hCaptcha verification `fetch()` lacks a timeout. Unlike other external API calls (OpenAI, Anthropic, code-similarity), this fetch is unprotected.
**Fix:** Add `signal: AbortSignal.timeout(10_000)` to the fetch call in `verifyHcaptchaToken`.
**Commit:** `c8bf8609`
**Status:** DONE

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

- `npx eslint src/lib/security/hcaptcha.ts src/lib/docker/client.ts`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (66 files, 179 tests)

---

## Implementation Order

1. C13-2 (hCaptcha timeout) — simpler fix, single line
2. C13-1 (Docker client timeouts) — two functions to update

---

## Deploy Results

- **test.worv.ai**: SUCCESS (2026-05-09) — app container healthy, nginx reloaded, HTTPS verified
- **algo.xylolabs.com**: SUCCESS (2026-05-09) — app container healthy, nginx reloaded, HTTPS verified
