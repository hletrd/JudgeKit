# Aggregate Review — Cycle 34

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 6 new (2 MEDIUM, 4 LOW) + 14 carried deferred re-validated + 0 newly fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `request.json()` without try/catch in assignments POST route

**Sources:** NEW-1 | **Confidence:** HIGH

In `src/app/api/v1/groups/[id]/assignments/route.ts:109`, the POST handler calls `const body = await request.json()` without a try/catch. If the client sends invalid JSON, this will throw an unhandled `SyntaxError` that results in a 500 instead of a 400. All other non-`createApiHandler` admin routes (backup, restore, migrate/export, migrate/import) properly wrap `request.json()` in try/catch. The `createApiHandler` wrapper also handles this correctly, but this route does not use it.

**Fix:** Wrap `request.json()` in try/catch returning a 400 on parse failure, or migrate the route to `createApiHandler`.

---

### AGG-2: [MEDIUM] `parseInt() || fallback` treats 0 as falsy — security-relevant in ip.ts

**Sources:** NEW-2 | **Confidence:** MEDIUM

Multiple files use `parseInt(x, 10) || fallback` where `||` treats 0 as falsy. The most security-relevant instance is `src/lib/security/ip.ts:9`:
```ts
parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1
```
If someone explicitly sets `TRUSTED_PROXY_HOPS=0` (meaning "no trusted proxies"), it silently defaults to 1, which is a security misconfiguration that would trust the first proxy's `X-Forwarded-For` header when it shouldn't.

Other instances (quick-create-contest-form, assignment-form-dialog, role-editor-dialog, language-config-table) have `min` HTML attributes preventing 0, making the issue cosmetic only.

**Fix:** Use `??` (nullish coalescing) instead of `||` in `src/lib/security/ip.ts:9`. For the UI files, optional — change `||` to `??` for correctness.

---

### AGG-3: [LOW] Chat widget `response.json()` error key coupling

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/lib/plugins/chat-widget/chat-widget.tsx:204` compares `data.error === "rateLimit"` from the API response, coupling the client to the server's internal error key naming. If the server changes its error key, the client silently degrades to a generic error.

**Fix:** Optional. Consider checking response status codes instead of error string matching.

---

### AGG-4: [LOW] Missing error boundary for contests route segment

**Sources:** NEW-4 | **Confidence:** LOW

`src/app/(dashboard)/dashboard/contests/` lacks its own `error.tsx`. The parent dashboard error boundary catches errors, but contests is complex (real-time polling, replay, analytics) and would benefit from context-specific recovery options.

**Fix:** Add `src/app/(dashboard)/dashboard/contests/error.tsx` with contest-specific messaging.

---

### AGG-5: [LOW] `useSearchParams` without Suspense boundary in some client components

**Sources:** NEW-5 | **Confidence:** LOW

Several client components use `useSearchParams()` which Next.js 14+ warns about when not wrapped in Suspense. This is build-log only and does not cause runtime failures if the pages already have Suspense.

**Fix:** Verify that all pages importing these components wrap them in `<Suspense>`.

---

### AGG-6: [LOW] `admin/languages` list route uses `select()` exposing all columns including large `dockerfile`

**Sources:** NEW-6 | **Confidence:** LOW

`src/app/api/v1/admin/languages/route.ts:27` uses `.select()` (no explicit column list), exposing all columns including the `dockerfile` column which can contain up to 10,000 characters per entry. While admin-only, this bloats the list response.

**Fix:** Use explicit column selects on the list endpoint, omitting `dockerfile` unless specifically requested.

---

## Carried Deferred Items (unchanged from cycle 33)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler` — assignments POST now also identified (AGG-1)
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries — contests segment now identified (AGG-4)
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision)

## Previously Deferred Items Now Fixed

- DEFER-25: `LectureModeContext` value instability — FIXED
- DEFER-31: files/[id] explicit select — FIXED

## No Agent Failures

The comprehensive review completed successfully.
