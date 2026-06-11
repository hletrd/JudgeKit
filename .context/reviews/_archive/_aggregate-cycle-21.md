# Aggregate Review -- Cycle 21/100

**Date:** 2026-05-09
**HEAD:** 17ae0bda
**Reviewers:** code-reviewer, security-reviewer, test-engineer (manual comprehensive sweep)
**Scope:** Full TypeScript/TSX source review focusing on areas not well-covered in cycles 19-20

---

## Total Deduplicated NEW Findings

**0 HIGH, 2 MEDIUM, 2 LOW**

---

## Findings

### C21-1: Import timestamp column detection uses wrong Drizzle dataType string [MEDIUM]
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File+line:** `src/lib/db/import.ts:33`
- **Issue:** `buildImportColumnSets` checks `dataType === "date"` to detect timestamp columns, but the PostgreSQL schema uses `timestamp()` which reports `dataType === "timestamp"`. There are zero `date()` columns in the schema. `TIMESTAMP_COLUMNS` is always empty, so `convertValue` never converts ISO strings back to `Date` objects during import. This can corrupt temporal data or cause insert failures.
- **Fix:** Change `dataType === "date"` to `dataType === "timestamp"`.

### C21-2: Unvalidated plugin config cast in auto-review background job [MEDIUM]
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File+line:** `src/lib/judge/auto-review.ts:92`
- **Issue:** `auto-review.ts` casts `pluginState.config` without runtime validation. Cycle 20 fixed the same pattern in `chat/route.ts` (C20-5) but missed this file. Corrupted config could cause unexpected behavior.
- **Fix:** Reuse/extract `pluginConfigSchema` from `chat/route.ts` and validate before use.

### C21-3: use-mobile hook uses inconsistent width-detection methods [LOW]
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File+line:** `src/hooks/use-mobile.ts:9-15`
- **Issue:** Initializes with `window.innerWidth` but listens to media query for changes. These can disagree in edge cases.
- **Fix:** Use `mql.matches` for initial state.

### C21-4: use-keyboard-shortcuts blocks ALL modifier-key combinations [LOW]
- **Severity:** LOW
- **Confidence:** HIGH
- **File+line:** `src/hooks/use-keyboard-shortcuts.ts:30`
- **Issue:** Returns early for ANY modifier key, contradicting the comment that says "except for our own shortcuts". No shortcuts with modifiers can ever work.
- **Fix:** Remove blanket modifier check or support explicit modifier specification.

---

## Areas Verified (No Issues Found)

- **Cycle 19-20 fixes:** All verified at HEAD and remain resolved.
- **AbortController cleanup:** All fetch-based components properly abort in-flight requests on unmount.
- **Timer cleanup:** All setTimeout/setInterval usages have proper cleanup.
- **Event listener cleanup:** All addEventListener calls have matching removeEventListener.
- **JSON.parse guards:** All JSON.parse calls either have try/catch or are in safe contexts.
- **React key stability:** All dynamic `.map()` uses stable IDs except skeleton arrays.
- **Judge routes:** All 5 judge API routes properly guard `request.json()` with try/catch.
- **CSRF coverage:** All mutating POST endpoints have CSRF protection or correct exemptions.
- **Type safety:** No `@ts-ignore`, no `any` types in source.
- **Security:** No new vulnerabilities; auth, rate-limiting, and XSS protections verified.
- **Korean letter spacing:** All `tracking-*` usages are either conditional on locale or documented as ASCII-only.

---

## Already-fixed findings from prior cycles (verified at HEAD)

All cycle 1-20 fixes remain resolved. Key verified areas:
- Cycle 20: zod error mapping in public-signup.ts, JSON parse error handling in recruiting validate, compiler time limit NaN guard, backup stream try/catch, chat-widget config validation
- Cycle 19: em-dash replacements, RAF cleanup in contest-replay, recruiting invitation stable keys
- Cycle 18: file upload dropzone keyboard accessibility, public-header RAF cleanup
- Cycles 15-17: Bulk-create React keys, file-upload nanoid IDs, locale-switcher Secure flag, etc.

---

## Carry-forward DEFERRED items

All deferred items from prior aggregates remain deferred with unchanged exit criteria. See `_aggregate-cycle-15.md` (2026-05-08) for full list.

No new deferred items this cycle.

---

## Review methodology notes

- Full grep sweeps for: refs, RAF, timers, JSON.parse, event listeners, keys, catches, any, ts-ignore, eslint-disable, tracking-*
- Full reads of: recently modified files and areas not covered in cycles 19-20
- Re-verification of all cycle 19-20 fixes
- All 575+ TS/TSX files in scope
- All gates pass (eslint, tsc, next build, vitest integration + component)
