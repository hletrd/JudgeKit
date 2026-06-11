# Aggregate Review — Cycle 37

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 4 new (2 MEDIUM, 2 LOW) + 0 false positives + 15 carried deferred re-validated + 6 newly fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `parseInt(x, 10) || default` in quick-create-contest-form treats `0` as falsy

**Sources:** NEW-1 | **Confidence:** HIGH

`src/components/contest/quick-create-contest-form.tsx:133,172` uses `parseInt(e.target.value, 10) || 60` and `|| 100`. While HTML `min` constraints prevent `0` entry via the UI, the `||` pattern is fragile and inconsistent with the `Number.isFinite` convention established in cycles 34-36. A programmatic call or future UI change could pass `0`.

**Fix:** Use `Number.isFinite` pattern for both instances.

---

### AGG-2: [MEDIUM] `parseFloat(x) || 0` in assignment-form-dialog treats `0` as falsy / masks NaN

**Sources:** NEW-2, NEW-3 | **Confidence:** HIGH

`src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:410,654` uses `parseFloat(event.target.value) || 0`. While `0 || 0` evaluates to `0` (same result by coincidence), NaN inputs are silently masked as `0` instead of signaling invalid input. The pattern is inconsistent with codebase convention. Also at line 457: `parseInt(e.target.value, 10) || null`.

**Fix:** Use `Number.isFinite` pattern for all three instances.

---

### AGG-3: [LOW] Flaky test: `public-seo-metadata.test.ts` times out intermittently

**Sources:** NEW-4 | **Confidence:** HIGH

`tests/unit/public-seo-metadata.test.ts:103` timed out at 5000ms during full suite run but passed on rerun (1614ms). Dynamic `import()` of Next.js page modules under high parallelism can exceed the default timeout.

**Fix:** Add explicit timeout of 15000ms to the affected test.

---

### AGG-4: [LOW] `parseInt(e.target.value, 10) || null` in assignment-form-dialog masks NaN

**Sources:** NEW-3 | **Confidence:** MEDIUM

`src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:457` — `0 || null` returns `null`, losing the `0` value. HTML `min={1}` constrains the field so practical impact is low, but the pattern is inconsistent.

**Fix:** Use `Number.isFinite` pattern. (Merged into AGG-2 for implementation since same file.)

---

## Previously Deferred Items Now Fixed (since cycle 36)

- AGG-1 (cycle 36): Analytics route unhandled rejection chain — fixed with async IIFE + defensive `.catch()`
- AGG-2 (cycle 36): `database-backup-restore.tsx` raw console.error(data) — fixed with structured error message
- AGG-3 (cycle 36): Chat widget `parseInt || default` — fixed with `Number.isFinite`
- AGG-4 (cycle 36): Role editor `parseInt || 0` — fixed with `Number.isFinite`
- AGG-5 (cycle 36): `parseInt(diskUsage.usePercent) || 0` — fixed with `Number.isFinite`
- AGG-6 (cycle 36): Exam-session GET `examModeInvalid` (400) — fixed to `notFound("ExamSession")`

---

## Carried Deferred Items (unchanged from cycle 36)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries — contests segment now fixed
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision)

---

## No Agent Failures

The comprehensive review completed successfully.
