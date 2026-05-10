# Cycle 36 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate-cycle-36.md`
**HEAD:** a714608a

---

## Active Tasks

No new tasks. Cycle 36 review found 0 new issues.

---

## Actions Taken This Cycle

1. **Archived completed plans:**
   - `plans/open/2026-05-10-cycle-32-review-remediation.md` → `plans/closed/`
   - `plans/open/2026-05-10-cycle-33-review-remediation.md` → `plans/closed/`

2. **Verified all prior cycle fixes:**
   - Cycle 35 (4 findings): ALL FIXED
   - Cycle 32 (2 findings): ALL FIXED
   - Cycle 33 (6 findings): ALL FIXED

3. **Ran quality gates:** All pass
   - `npx eslint .` — 0 errors
   - `npx tsc --noEmit` — 0 errors
   - `npx vitest run` — 317 files, 2391 tests (all pass)
   - `npx vitest run --config vitest.config.component.ts` — 68 files, 208 tests (all pass)

---

## Carry-Forward Deferred Items (unchanged)

### CRITICAL (requires architecture/product decision)
- **C-1**: Test/Seed localhost check spoofable — requires architecture review
- **C-2**: Accepted solutions endpoint unauthenticated — requires product decision
- **C-3**: File DELETE CSRF ordering — requires API refactor

### HIGH
- **H-1**: SSE result visibility bypass — requires SSE sanitization refactor
- **H-2**: Problem-Set PATCH bypasses createApiHandler — requires schema migration
- **H-3**: Overrides route doesn't use createApiHandler — requires route refactor
- **H-4**: In-memory rate limiter for judge claims — requires infra decision
- **H-5**: Accepted solutions exposes userId for anonymous — requires data migration

### MEDIUM
- **DEFER-C30-4**: `.json()` before `.ok` in non-critical components (30+ files) — large refactor
- **DEFER-C30-5**: Raw API error strings without i18n (ongoing incremental)
- **DEFER-C30-6**: `as { error?: string }` unsafe type assertions (15 instances)
- **C29 AGG-10**: Admin routes bypass createApiHandler (partially fixed, 15 routes remain)
- **C29 AGG-12**: Recruiting validate endpoint token brute-force

### LOW
- **DEFER-27**: Missing AbortController on polling fetches
- **DEFER-34**: Hardcoded English fallback strings
- **DEFER-35**: Hardcoded English strings in editor title attributes
- **DEFER-36**: `formData.get()` cast assertions without validation
- **C25-6**: Client-side console.error (8 remaining instances)
- **C25-7**: WeakMap complexity in api-rate-limit.ts
- **C29 AGG-13**: files/[id] GET selects storedName
- **C29 AGG-14**: Admin settings exposes DB host/port
- **C29 AGG-15**: Missing error boundaries
- **C29 AGG-17**: Hardcoded English in throw new Error (permissions.ts)
- **C29 AGG-18**: Hardcoded English fallback strings in code-editor.tsx
- **C29 AGG-19**: formData.get() cast assertions without validation

---

## Exit Criteria for Deferred Items

See individual cycle plans for specific exit criteria. General rules:
- **CRITICAL/HIGH**: Require explicit architecture/product decision before deferral expiry
- **MEDIUM**: Should be addressed in dedicated refactoring cycles
- **LOW**: Address opportunistically during feature work or when file is touched
