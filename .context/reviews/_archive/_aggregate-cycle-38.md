# Aggregate Review — Cycle 38

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 6 new (2 MEDIUM, 4 LOW) + 0 false positives + 15 carried deferred re-validated + 6 cycle-37 fixes confirmed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `error.message` used as control-flow discriminator across 15+ API catch blocks

**Sources:** NEW-1 | **Confidence:** HIGH

Multiple API route handlers use `error.message === "someString"` to discriminate error types in catch blocks. This anti-pattern is fragile (refactoring error messages silently breaks control flow) and can leak internal state. Found in:
- `exam-session/route.ts:77` — `switch (error.message)`
- `assignment route.ts:191-196`
- `admin/restore/route.ts:91`
- `admin/migrate/validate/route.ts:40,49,52`
- `admin/migrate/import/route.ts:80,128,131`
- `recruiting-invitations/route.ts:118-127`
- `recruiting-invitations/bulk/route.ts:111`
- `members/[userId]/route.ts:87`
- `admin/roles/route.ts:105`
- `users/route.ts:135,138`
- `judge/poll/route.ts:168`
- `recruiting-invitations.ts:541,544`
- `user-management.ts:326,329,439,442`
- `public-signup.ts:120`

**Fix:** Introduce custom error classes (e.g., `class AppError extends Error { code: string }`) or result objects. Plan incrementally — start with the most critical paths (exam-session, assignment mutation).

---

### AGG-2: [MEDIUM] Import route JSON path uses `as JudgeKitExport` unsafe cast without Zod validation of export data

**Sources:** NEW-2 | **Confidence:** HIGH

`src/app/api/v1/admin/migrate/import/route.ts:164-166` — The Zod schema for the JSON import body defines `data: z.unknown().optional()`, which passes any value. The data is then cast to `JudgeKitExport` with `as JudgeKitExport` (line 165) or `as unknown as JudgeKitExport` (line 166). While `validateExport()` is called afterwards, the cast itself is unsound and could be missed if the validation function has gaps.

**Fix:** Create a proper Zod schema for `JudgeKitExport` and use it as the `data` field type in `jsonImportBodySchema`, eliminating the unsafe cast.

---

### AGG-3: [LOW] `db/import.ts` error messages leak internal DB error text to API responses

**Sources:** NEW-3 | **Confidence:** HIGH

`src/lib/db/import.ts:136,200,214` — When table truncation or batch insert fails, `err.message` is included in error strings that propagate through `importDatabase` result to the API response (`details: result.errors` at route.ts:108). PostgreSQL internal errors (table names, constraint names, column types) are exposed to the admin client.

**Fix:** Sanitize error messages before including in `result.errors`. Use generic messages for API responses; log detailed errors server-side only.

---

### AGG-4: [LOW] Anti-cheat monitor captures problem text snippets (up to 80 chars) in copy/paste events

**Sources:** NEW-4 | **Confidence:** MEDIUM

`src/components/exam/anti-cheat-monitor.tsx:206-210` — `describeElement` captures `(el.textContent ?? "").trim().slice(0, 80)` for headings/paragraphs/spans. This text is sent to the server as anti-cheat event details and stored in the audit log. This could include copyrighted exam problem content from external sources.

**Note:** Previously deferred as DEFER-45, but the specific risk of capturing copyrighted exam problem text was not called out in the original deferral.

**Fix:** For copy/paste events, omit text content from `describeElement` output. Keep only element type and CSS class identifier.

---

### AGG-5: [LOW] CountdownTimer initial render uses uncorrected client time before server sync

**Sources:** NEW-5 | **Confidence:** LOW

`src/components/exam/countdown-timer.tsx:46-47` — The `remaining` state initializes with `deadline - Date.now()` (client clock), but after server time sync, uses `deadline - (Date.now() + offsetRef.current)`. If the client clock is significantly off, the initial badge shows an incorrect time that briefly flashes before correction.

**Fix:** Consider showing a neutral loading state until the first server time sync completes, or at minimum document this as accepted behavior. LOW because the sync completes within 5 seconds.

---

### AGG-6: [LOW] SSE connection tracking uses O(n) scan for oldest-entry eviction

**Sources:** NEW-6 | **Confidence:** LOW

`src/app/api/v1/submissions/[id]/events/route.ts:44-53` — The `addConnection` function iterates all entries in `connectionInfoMap` to find the oldest-by-age entry for eviction. This is O(n) and could become a bottleneck during connection bursts (e.g., exam start).

**Fix:** Consider an ordered data structure for O(1) oldest-entry lookup, or increase eviction batch size. LOW because `MAX_TRACKED_CONNECTIONS = 1000` is rarely exceeded.

---

## Previously Fixed Items (confirmed in current code)

All cycle 37 fixes verified:
- AGG-1 (cycle 37): `parseInt || default` in quick-create-contest-form — fixed with `Number.isFinite`
- AGG-2 (cycle 37): `parseFloat || 0` in assignment-form-dialog — fixed with `Number.isFinite`
- AGG-3 (cycle 37): `parseInt || null` in assignment-form-dialog — fixed with `Number.isFinite`
- AGG-4 (cycle 37): Flaky public-seo-metadata test — fixed with 15s timeout

---

## Carried Deferred Items (unchanged from cycle 37)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — Zod validation not yet built (partially addressed by AGG-2)
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
