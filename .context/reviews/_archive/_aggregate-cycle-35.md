# Aggregate Review — Cycle 35

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 4 new (1 MEDIUM, 3 LOW) + 1 false positive + 14 carried deferred re-validated + 0 newly fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `parseFloat() || null` treats 0 as falsy — cannot set float error tolerance to zero

**Sources:** NEW-1 | **Confidence:** HIGH

In `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:424-425`, the float absolute and relative error values use `parseFloat(floatAbsoluteError) || null`. Since `parseFloat("0")` returns `0` and `0 || null` evaluates to `null`, users cannot set a float error tolerance of `0` (meaning exact match in float comparison mode). The server-side Zod schema allows `z.number().min(0).max(1).nullable()`, so `0` is a valid value that gets silently dropped client-side.

Notably, the `difficulty` field on line 426 of the same file already handles this correctly with `Number.isFinite(parseFloat(difficulty))`.

**Fix:** Replace `parseFloat(x) || null` with `const parsed = parseFloat(x); return Number.isFinite(parsed) ? parsed : null;`.

---

### AGG-2: [LOW] Tags PATCH route does not set `updatedAt` — inconsistent with all other update routes

**Sources:** NEW-2 | **Confidence:** HIGH

`src/app/api/v1/admin/tags/[id]/route.ts:27-35` does not include `updatedAt` in its update values. Every other PATCH/update route in the codebase consistently includes `updatedAt: await getDbNowUncached()`. The root cause is that the `tags` table schema (`src/lib/db/schema.pg.ts:1042-1057`) lacks an `updatedAt` column entirely — it only has `createdAt`.

**Fix:** Add an `updatedAt` column to the `tags` table schema and include it in the PATCH route's update values. This requires a database migration.

---

### AGG-3: [LOW] `SUBMISSION_GLOBAL_QUEUE_LIMIT` deprecated constant still uses `parseInt(...) ||` pattern

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/lib/security/constants.ts:27-30` has `parseInt(process.env.SUBMISSION_GLOBAL_QUEUE_LIMIT || "100", 10)`. The `|| "100"` fallback means `SUBMISSION_GLOBAL_QUEUE_LIMIT=0` silently defaults to `100`. While the constant is `@deprecated` and active code uses the function `getSubmissionGlobalQueueLimit()`, the constant is still exported and could be accidentally used. This is the same class of bug as `TRUSTED_PROXY_HOPS` (fixed in cycle 34).

**Fix:** Either remove the deprecated constant entirely, or fix it to use `?? "100"` and `Number.isNaN` like the `TRUSTED_PROXY_HOPS` fix.

---

### AGG-4: [LOW] `group-instructors-manager.tsx` logs raw API response data in development

**Sources:** NEW-4 | **Confidence:** LOW

`src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:74` logs the raw API response `data` object via `console.error(data)` in development. This could leak internal error details. Other components in the same file and elsewhere log only the error message string.

**Fix:** Replace `console.error(data)` with `console.error("Instructor add failed:", (data as { error?: string }).error)`.

---

## False Positive Dismissed

- NEW-5: `parseFloat() || 0` in assignment form for late penalty — FALSE POSITIVE. `0` is valid and `parseFloat("0") || 0` correctly returns `0`.

---

## Carried Deferred Items (unchanged from cycle 34)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler` — assignments POST now fixed
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries — contests segment now fixed
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision)

## Previously Deferred Items Now Fixed

- (No new fixes this cycle beyond those tracked in cycle 34)

## No Agent Failures

The comprehensive review completed successfully.
