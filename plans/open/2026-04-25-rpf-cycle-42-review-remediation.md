# RPF Cycle 42 (Fresh Pass) — Review Remediation Plan

**Date:** 2026-04-25
**Cycle:** 42/100
**Base commit:** d13970ad (current HEAD)
**Review artifacts:** `.context/reviews/comprehensive-reviewer-cycle-42.md` + `.context/reviews/_aggregate-cycle-42.md`

## Previously Completed Tasks (Verified in Current Code)

All prior cycle 41 tasks are complete:
- [x] Task A: Add source code size cap for auto-review — commit 69fa3218

All prior cycle 40 tasks are complete:
- [x] Task A: Remove `Date.now()` default from `getRetentionCutoff` — commit 2d4d9a62

All prior cycle 42 (earlier pass) tasks are complete:
- [x] Lane 1: Validate `problemPoints` length matches `problemIds` — commit 22df4779
- [x] Lane 2: Add capability-based auth to access-code routes — commit 1e2a8b76
- [x] Lane 3: Remove redundant non-null assertion — commit 9ede3eea

## Tasks (priority order)

### Task A: Fix `normalizeSource()` unclosed string literal handling for correct similarity detection [MEDIUM/MEDIUM]

**From:** AGG-1 (NEW-1)
**Severity / confidence:** MEDIUM / MEDIUM
**Files:**
- `src/lib/assignments/code-similarity.ts:51-65,68-83`

**Problem:** When `normalizeSource()` encounters an unclosed string literal (e.g., a `"` with no closing quote), the inner while loop scans the entire remaining file. The function outputs the opening quote but never closes it, causing the rest of the file to be consumed as string content. This means identifiers after the unclosed string are never processed by `normalizeIdentifiersForSimilarity()`, causing the similarity score to drop dramatically and allowing plagiarism to go undetected.

**Plan:**
1. For double-quoted strings (lines 51-65): When the while loop exits because `index >= source.length` (no closing quote found), do NOT output the quote character. Remove the opening quote that was already added to `result` (or simply don't add it until the string is fully parsed). This treats the unclosed quote as if it never started.
2. For single-quoted strings (lines 68-83): Apply the same fix.
3. Add a maximum string literal length cap (e.g., 10,000 chars) as a safety measure for both string types.
4. Verify all gates pass

**Status:** PENDING

---

### Task B: Add template literal (backtick) handling to `normalizeSource()` for JS/TS similarity accuracy [LOW/MEDIUM]

**From:** AGG-2 (NEW-2)
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/lib/assignments/code-similarity.ts:14-101`

**Problem:** The `normalizeSource()` function does not handle template literals (backtick-delimited strings). Content inside template literals is treated as code rather than strings, causing false positives in similarity detection for JavaScript/TypeScript submissions.

**Plan:**
1. Add backtick string handling after the single-quote handling block (around line 83)
2. Template literals with `${...}` interpolations are complex — treat the entire template literal as a single string, replacing it with `` ` ` `` (consistent with how double/single quoted strings are handled — they output the quotes but strip the content)
3. For simple template literals without interpolation, just output `` ` ` ``
4. For template literals with `${...}`, the simplest approach is to scan for the closing backtick, outputting `` ` ` `` — this matches the behavior for regular strings where the content is discarded but the delimiters are preserved for structural matching
5. Verify all gates pass

**Status:** PENDING

---

## Deferred Items

### Carried deferred items from cycle 41 (unchanged):

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
- DEFER-43: Docker client leaks `err.message` in build responses (addressed by cycle 39 AGG-1)
- DEFER-44: No documentation for timer pattern convention
- DEFER-45: Anti-cheat monitor captures user text snippets (design decision — partially fixed in cycle 38)
- DEFER-46: `error.message` as control-flow discriminator across 15+ API catch blocks
- DEFER-47: Import route JSON path uses unsafe `as JudgeKitExport` cast
- DEFER-48: CountdownTimer initial render uses uncorrected client time
- DEFER-49: SSE connection tracking uses O(n) scan for oldest-entry eviction
- DEFER-50: [LOW] `in-memory-rate-limit.ts` `maybeEvict` triggers on every rate-limit call
- DEFER-51: [LOW] `contest-scoring.ts` ranking cache mixes `Date.now()` staleness check with `getDbNowMs()` writes
- DEFER-52: [LOW] `buildDockerImageLocal` accumulates stdout/stderr up to 2MB with string slicing

Reason for deferral unchanged. See cycle 40 plan for details.

### New deferred items this cycle:

- AGG-3 (NEW-3): `files/[id]/route.ts` DELETE handler rate-limits before auth check — deferred due to LOW severity and consistency with `createApiHandler` behavior (which also checks rate limits before auth). The rate-limit-before-auth pattern is intentional design, not a bug. Exit criterion: architectural review of rate-limit-vs-auth ordering policy.

---

## Progress log

- 2026-04-25: Plan created with 2 tasks (A, B). 1 new deferred item this cycle.
- 2026-04-25: Archived completed prior cycle 41 and earlier cycle 42 plans.
