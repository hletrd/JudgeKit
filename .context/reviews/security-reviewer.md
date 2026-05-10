# Security Review — Cycle 33

**Reviewer:** security-reviewer
**Date:** 2026-05-10
**Scope:** Client-side security, auth flows, XSS, CSRF, data exposure

---

## Findings

### C33-SR-1: [MEDIUM] Ungated console.error in error boundaries leak server errors

**File:** Multiple error.tsx files
**Confidence:** HIGH

Error boundary components across the app (`src/app/(dashboard)/dashboard/admin/error.tsx:19`, `src/app/(public)/problems/error.tsx:20`, `src/app/(public)/groups/error.tsx:20`, `src/app/(public)/contests/manage/error.tsx:22`) have `console.error` calls that are NOT gated behind `process.env.NODE_ENV === "development"`. In production, these could leak internal error details including Next.js digest hashes and error messages to the browser console.

**Fix:** Gate all error boundary console.error calls:
```typescript
if (process.env.NODE_ENV === "development") {
  console.error("[problems-error-boundary]", error);
}
```

---

### C33-SR-2: [LOW] Anti-cheat monitor clipboard events lack sanitization

**File:** `src/components/exam/anti-cheat-monitor.tsx:245-255`
**Confidence:** MEDIUM

The `handleCopy` and `handlePaste` event handlers capture `e.target` element description. While the `describeElement` function (lines 222-243) no longer captures text content (fixed in a previous cycle), the event object itself contains clipboard data that could theoretically be accessed if the code is modified in the future.

**Fix:** Ensure clipboard events never access `e.clipboardData` or `window.clipboardData`. Current code is safe, but add a comment guard.

---

### C33-SR-3: [LOW] Compiler client stores arbitrary code in localStorage without quota check

**File:** `src/components/code/compiler-client.tsx:186`
**Confidence:** LOW

The compiler client stores language preference in localStorage with a try/catch, but doesn't check quota before storing. Large code submissions could exceed quota.

**Fix:** Current implementation already has try/catch. Verify that code drafts (not just language preference) also have quota protection.

---

### C33-SR-4: [LOW] apiFetchJson swallows JSON parse errors silently

**File:** `src/lib/api/client.ts:126-144`
**Confidence:** MEDIUM

When `res.json()` throws, `apiFetchJson` silently falls back without any logging or notification. This makes debugging JSON parse errors difficult in development.

**Fix:** Add a development-only console.warn for parse failures:
```typescript
} catch {
  if (process.env.NODE_ENV === "development") {
    console.warn("apiFetchJson: JSON parse failed for", input);
  }
  data = fallback;
}
```

---

## Previously Deferred Security Items (re-validated, still open)

- C-1: Test/Seed localhost check spoofable — still present
- C-2: Accepted solutions endpoint unauthenticated — still present
- C-3: File DELETE CSRF ordering — still present
- H-1: SSE result visibility bypass — still present
- H-5: Accepted solutions exposes userId for anonymous — still present
- DEFER-30: Recruiting validate token brute-force — still present
- DEFER-32: Admin settings exposes DB host/port — still present

## Positive Observations

1. DOMPurify sanitization is comprehensive with custom hooks for rel/target attributes.
2. Image src restricted to root-relative paths only.
3. No `eval()` or `Function()` constructor usage in client code.
4. All localStorage access wrapped in try/catch.
5. CSP policy in proxy.ts correctly includes nonce-based restrictions.
