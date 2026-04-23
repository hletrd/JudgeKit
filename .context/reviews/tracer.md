# Tracer Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** tracer
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 tracer findings are fixed:
- TR-1 (double `res.json()` in create-problem-form): Fixed — single parse + `.catch()` guard
- TR-2 (problem-export-button null-safety): Fixed — null-safe access
- TR-3 (problem-import-button file size validation): Fixed — 10MB limit

## Findings

### TR-1: `recruiting-invitations-panel.tsx:137` — causal trace: unguarded `res.json()` on success path [MEDIUM/MEDIUM]

**Description:** Causal trace when the API returns a non-JSON 200 response:

1. User opens the recruiting invitations panel
2. `fetchInvitations` calls `apiFetch(...)` on line 133
3. Server returns 200 but with HTML body (e.g., CDN injects error page)
4. Line 136: `invRes.ok` is `true`
5. Line 137: `await invRes.json()` throws SyntaxError: "Unexpected token <"
6. Line 140: catch block shows `t("fetchError")` toast
7. User sees generic "fetch error" with no indication that the response was malformed
8. User refreshes — same error persists until CDN is fixed

**Hypothesis 1 (confirmed):** The unguarded `.json()` on the success path can throw when the response is non-JSON, even though `res.ok` is true.

**Alternative hypothesis (rejected):** The CDN would return a non-200 status. Rejected — CDNs often return 200 with HTML error pages.

**Fix:** Add `.catch(() => ({ data: [] }))` or use `apiFetchJson`.

**Confidence:** HIGH

---

### TR-2: `workers-client.tsx:235,241` — causal trace: unguarded `res.json()` on success paths [MEDIUM/MEDIUM]

**Description:** Same causal trace as TR-1, but for the workers admin page. If the workers API or stats API returns a 200 with non-JSON body, both `.json()` calls throw SyntaxError. The catch block shows generic "fetchError" toast.

**Fix:** Add `.catch()` guards or use `apiFetchJson`.

**Confidence:** HIGH

---

### TR-3: `recruiting-invitations-panel.tsx:99` — causal trace: `window.location.origin` for invitation URLs [MEDIUM/MEDIUM]

**Description:** Carried from cycle 14. Causal trace when the app is behind a reverse proxy:

1. App is deployed behind nginx at `algo.xylolabs.com`
2. Nginx proxies to Next.js on `localhost:3000`
3. `window.location.origin` resolves to `http://localhost:3000` on the client
4. Wait — on the client side, `window.location.origin` would resolve to the public URL since the browser sees the public domain
5. BUT if the app uses SSR with a misconfigured proxy that doesn't set `X-Forwarded-Host`, the client could see the internal URL in some edge cases

**Revised hypothesis:** The risk is lower than initially assessed because `window.location.origin` resolves on the client side (browser), which sees the public URL. The risk only applies in unusual proxy configurations where the browser sees an internal hostname.

**Fix:** Use server-provided `appUrl` for consistency and to handle edge cases.

**Confidence:** MEDIUM

---

## Final Sweep

The 4 remaining unguarded `.json()` calls in 2 files are the primary concern. The causal traces show they can fail when a 200 response has a non-JSON body. The `window.location.origin` risk is lower than initially assessed since it resolves on the client side, but using a server-provided config remains the safer approach.
