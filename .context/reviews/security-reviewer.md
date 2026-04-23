# Security Review — RPF Cycle 25

**Date:** 2026-04-22
**Base commit:** ac51baaa

## SEC-1: `compiler-client.tsx` exposes raw API error messages in toast descriptions [MEDIUM/HIGH]

**File:** `src/components/code/compiler-client.tsx:277-279`

```ts
toast.error(t("runFailed"), { description: errorMessage });
```

Where `errorMessage = data.error || data.message || res.statusText || "Request failed"`. The `res.statusText` and any unexpected `data.error`/`data.message` values could leak server internals (version numbers, stack traces if debug mode is on, etc.) to the user.

**Fix:** Use i18n keys only in toast descriptions. Log raw errors to console.

---

## SEC-2: `create-problem-form.tsx` and `assignment-form-dialog.tsx` default error cases leak `error.message` [MEDIUM/MEDIUM]

**Files:**
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`

Both have `default: return error.message || tCommon("error")` in their error message mappers. Any unexpected error (TypeError, SyntaxError from `.json()` parse failure, etc.) will have its raw message shown to the user.

**Fix:** Default case should return `tCommon("error")` and log the raw error.

---

## SEC-3: `window.location.origin` for URL construction -- carried from DEFER-24 [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:99`

Carried from DEFER-24. Two instances still present in recruiting-invitations-panel and access-code-manager.

---

## SEC-4: Encryption plaintext fallback -- carried from cycle 11 [MEDIUM/MEDIUM]

**File:** `src/lib/security/encryption.ts:79-81`

The `decrypt()` function returns plaintext as-is if the value doesn't start with `enc:`. This means any old unencrypted data is silently readable, and an attacker who can write to the database could inject plaintext values that would be treated as valid.

Carried from DEFER-39.

---

## SEC-5: `AUTH_CACHE_TTL_MS` has no upper bound [LOW/MEDIUM]

**File:** `src/proxy.ts:24-27`

```ts
const AUTH_CACHE_TTL_MS = (() => {
  const parsed = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
})();
```

An operator could set `AUTH_CACHE_TTL_MS=3600000` (1 hour), meaning revoked users retain access for up to an hour. There's no upper bound validation.

Carried from DEFER-40.

---

## SEC-6: `anti-cheat-monitor.tsx` stores event details in localStorage unencrypted [LOW/LOW]

**File:** `src/components/exam/anti-cheat-monitor.tsx:41-63`

Pending anti-cheat events are stored in localStorage as JSON. The `details` field contains element descriptions including text snippets from the page (line 209: `const text = (el.textContent ?? "").trim().slice(0, 80)`). While this is a client-side-only concern and localStorage is same-origin, it means exam content snippets could persist in localStorage after the exam.

**Fix:** Clear localStorage keys on exam completion or use sessionStorage instead. Low severity since exam content is visible to the student anyway.

---

## SEC-7: `sanitizeHtml` allows `img` tags with root-relative src -- potential for local resource enumeration [LOW/LOW]

**File:** `src/lib/security/sanitize-html.ts:11-14`

```ts
const isRootRelative = src.startsWith("/") && !src.startsWith("//");
if (!isRootRelative) { node.removeAttribute("src"); }
```

Root-relative image URLs are allowed. An admin could inject `<img src="/api/v1/admin/backup">` to check if the endpoint exists (though the response wouldn't render as an image). This is extremely low risk since only admins can set problem descriptions, and CSP's `img-src 'self' data: blob:` already restricts to same-origin.

**Fix:** Consider restricting img src to only allow specific patterns (e.g., `/api/v1/files/`). Very low priority.
