# Comprehensive Review — Cycle 37

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository scan focusing on new issues since cycle 36

---

## NEW-1: [MEDIUM] `parseInt(x, 10) || default` in quick-create-contest-form treats `0` as falsy

**File:** `src/components/contest/quick-create-contest-form.tsx:133`
**Confidence:** HIGH

`setDurationMinutes(parseInt(e.target.value, 10) || 60)` treats `0` as falsy. If a user enters `0` for duration, it silently resets to 60 minutes. The HTML `min={1}` prevents the UI from submitting 0, but the `||` pattern is fragile and inconsistent with the `Number.isFinite` convention established in cycles 34-36.

Similarly at line 172: `parseInt(e.target.value, 10) || 100` for problem points. HTML `min={1}` constrains the UI, but the pattern should be consistent.

**Fix:** Use `Number.isFinite` pattern:
```ts
const v = parseInt(e.target.value, 10);
setDurationMinutes(Number.isFinite(v) ? v : 60);
```

---

## NEW-2: [MEDIUM] `parseFloat(x) || 0` in assignment-form-dialog treats `0` as falsy

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:410`
**Confidence:** HIGH

`parseFloat(event.target.value) || 0` for late penalty. If a user enters `0` (meaning no late penalty), `parseFloat("0")` returns `0`, and `0 || 0` evaluates to `0` -- same result by coincidence. But for a "points" field (line 654), `parseFloat(event.target.value) || 0` for problem points where `0` points is semantically different from "invalid input." While HTML `min={1}` constrains the points field, the pattern is inconsistent.

For the late penalty field specifically, `0` IS a valid value meaning "no penalty," and `0 || 0` happens to produce the same result, but the pattern obscures the intent: NaN is silently masked as 0 instead of signaling invalid input.

**Fix:** Use `Number.isFinite` pattern for consistency:
```ts
const v = parseFloat(event.target.value);
setLatePenalty(Number.isFinite(v) ? v : 0);
```

---

## NEW-3: [LOW] `parseInt(e.target.value, 10) || null` in assignment-form-dialog masks NaN

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:457`
**Confidence:** MEDIUM

`parseInt(e.target.value, 10) || null` for exam duration. When the user clears the input, `parseInt("", 10)` returns `NaN`, and `NaN || null` correctly returns `null`. When the user types `0`, `0 || null` returns `null`, which loses the `0` value. However, HTML `min={1}` constrains the field, so `0` cannot be entered via the UI.

While the practical impact is low due to the HTML `min` constraint, the pattern is inconsistent with the codebase convention of using `Number.isFinite`.

**Fix:** Use `Number.isFinite` pattern:
```ts
const v = e.target.value ? parseInt(e.target.value, 10) : null;
setExamDurationMinutes(v !== null && Number.isFinite(v) ? v : null);
```

---

## NEW-4: [LOW] Flaky test: `public-seo-metadata.test.ts` times out intermittently

**File:** `tests/unit/public-seo-metadata.test.ts:103`
**Confidence:** HIGH

The test "builds page-aware practice catalog metadata for page 2" timed out at the default 5000ms during the full test suite run but passed on rerun (taking 1614ms). This is a known class of vitest flake where dynamic `import()` of Next.js page modules under high parallelism can exceed the default timeout.

**Fix:** Add an explicit timeout to this test:
```ts
it("builds page-aware practice catalog metadata for page 2", async () => {
  // ... existing test
}, 15_000); // Allow more time for dynamic import under parallelism
```

---

## Previously Identified Issues Verified as Fixed

- AGG-1 (cycle 36): Analytics route unhandled rejection chain -- **FIXED** (async IIFE with defensive `.catch()` now in place)
- AGG-6 (cycle 36): Exam-session GET returns `examModeInvalid` (400) -- **FIXED** (now returns `notFound("ExamSession")`)
- AGG-2 (cycle 36): `database-backup-restore.tsx` raw `console.error(data)` -- **FIXED** (now logs structured error message)
- AGG-3 (cycle 36): Chat widget `parseInt || default` -- **FIXED** (now uses `Number.isFinite`)
- AGG-4 (cycle 36): Role editor `parseInt || 0` -- **FIXED** (now uses `Number.isFinite`)
- AGG-5 (cycle 36): `parseInt(diskUsage.usePercent) || 0` -- **FIXED** (now uses `Number.isFinite`)

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
