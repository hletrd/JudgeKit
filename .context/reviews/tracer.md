# Tracer Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## TR-1: Trace raw error.message leak through `getErrorMessage` default cases

**Hypothesis:** A `SyntaxError` from `.json()` on a non-JSON response body could reach the `getErrorMessage` default case and leak its message to the user.

**Trace:**
1. User submits form (e.g., create-problem-form)
2. `apiFetch()` returns a Response with `!response.ok`
3. `.json().catch(() => ({}))` catches the SyntaxError if body is not JSON -- returns `{}`
4. `throw new Error(({} as {error?:string}).error || "createFailed")` -- throws `new Error("createFailed")`
5. In catch block, `getErrorMessage(error)` is called
6. `error.message === "createFailed"` doesn't match any case
7. Falls to `default: return error.message || tCommon("error")`
8. Returns `"createFailed"` -- which is a known i18n key, not a raw server error

**Verdict:** In this specific flow, the `error.message` value is actually a server-thrown error string that gets used as an i18n key lookup. The leak risk is lower than initially assessed because the throw always uses known error strings. However, if a completely unexpected error (e.g., TypeError from a network disconnection) reaches the catch block, `error.message` would be a raw browser error string like `"Failed to fetch"`.

**Confidence:** MEDIUM -- the most likely failure mode (server errors) are safe, but unexpected client-side errors could leak.

---

## TR-2: Trace `compiler-client.tsx` error flow for non-string error values

**Hypothesis:** If `data.error` is an object instead of a string, the toast would show `[object Object]`.

**Trace:**
1. API returns `{ error: { code: "rate_limited" } }` with `!res.ok`
2. `data.error` is `{ code: "rate_limited" }`
3. `errorMessage = data.error || data.message || res.statusText || "Request failed"`
4. `errorMessage` is now `{ code: "rate_limited" }` (an object)
5. `toast.error(t("runFailed"), { description: errorMessage })` -- shows `[object Object]`
6. `updateTestCase(..., { error: errorMessage, ... })` -- React renders `[object Object]` in the error alert

**Verdict:** Confirmed. The `errorMessage` variable is not guaranteed to be a string. Any object-valued `data.error` or `data.message` would be coerced to `[object Object]`.

**Confidence:** HIGH -- this is a real bug that can occur with non-standard API responses.

---

## TR-3: Trace `contest-quick-stats.tsx` avgScore null handling

**Hypothesis:** `avgScore: null` from the API could become `0` in the UI.

**Trace:**
1. API returns `{ data: { avgScore: null } }`
2. `data.data!.avgScore !== null` -- false
3. Falls to `null` in the ternary
4. `stats.avgScore` is `null`
5. UI renders `stats.avgScore !== null ? formatNumber(...) : "---"` -- shows "---"

**Verdict:** Correctly handled. The null check is explicit and the UI shows "---" for null avgScore.

**Confidence:** HIGH -- the fix from cycle 23 is working correctly.
