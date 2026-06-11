# Security Review — Cycle 41

**Date:** 2026-05-10
**Scope:** Auth forms, export streaming, API routes
**Reviewer:** Primary agent (subagent spawning unavailable)
**New findings:** 0
**Confidence in coverage:** HIGH

---

## Areas Reviewed

### 1. Auth Form Input Validation

**Files:** `src/app/(auth)/login/login-form.tsx`, `src/app/change-password/change-password-form.tsx`

The cycle 40 fix correctly replaces unsafe `as string` casts with `String(formData.get(...) ?? "")`:
- login-form.tsx:27-28 — `String(formData.get("username") ?? "")` and `String(formData.get("password") ?? "")`
- change-password-form.tsx:29-31 — All three password fields use safe pattern

This prevents null/undefined values from silently passing through as typed strings. The `String(null)` produces `"null"` but with `?? ""`, it produces `""` which is safer for downstream validation.

**Server-side routes checked:**
- `src/app/api/v1/admin/restore/route.ts:40` — Uses `as string | null` with immediate `typeof` validation at line 42. The cast is defensive (acknowledges null) and the runtime check validates before use. Acceptable pattern.
- `src/app/api/v1/admin/migrate/import/route.ts:48` — Same pattern: `as string | null` with `typeof` check at line 51. Acceptable.

### 2. Export Streaming Abort Handling

**File:** `src/lib/db/export.ts:71-181`

The pre-aborted signal check added at lines 81-84:
```typescript
if (options.signal?.aborted) {
  controller.close();
  return;
}
```

This correctly prevents starting a database transaction and streaming work when the signal is already aborted. The `addEventListener` at line 85 uses `{ once: true }` and the `removeEventListener` in the finally block (line 174) prevents memory leaks.

No security implications: this is a DoS-prevention hardening (prevents wasted DB work) but does not introduce new attack surfaces.

### 3. Import Route Headers

**File:** `src/app/api/v1/admin/migrate/import/route.ts:203,211`

The Deprecation and Sunset headers are correctly set on both success and error responses for the deprecated JSON body path. The Sunset date (`Sun, 01 Nov 2026 00:00:00 GMT`) is in the future.

The test file `tests/unit/api/import-sunset-headers.route.test.ts` verifies these headers are present in source code.

### 4. Secrets and Configuration

No new secrets exposure found. No changes to `.env.example`, auth config, or Docker configurations since cycle 40.

---

## Findings

No new security findings in this cycle.

---

## Verification of Prior Security Findings

| Finding | Status | Evidence |
|---------|--------|----------|
| Auth form `as string` casts | FIXED | All auth forms now use `String(... ?? "")` |
| Export streaming abort | FIXED | Pre-abort check added |
| DEFER-30: Recruiting token brute-force | UNCHANGED | Still deferred |
| DEFER-32: Admin settings exposes DB host/port | UNCHANGED | Still deferred |
| DEFER-45: Anti-cheat monitor captures text | PARTIAL | Fixed in cycle 38, design decision recorded |
