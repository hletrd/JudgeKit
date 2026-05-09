# Cycle 11 Review Remediation Plan

**Date:** 2026-05-09
**Review source:** `.context/reviews/_aggregate.md` (cycle 11/100)
**HEAD:** 75d82a17
**Goal:** Fix all findings from cycle 11 code review.

---

## Items to implement this cycle

### 1. C11-1 — Fix literal `\n` rendered as text in TruncatedOutput JSX
- **File:** `src/components/code/compiler-client.tsx` (line 106)
- **Severity:** LOW
- **Task:** Replace literal `\n` in JSX with `{"\n"}` so it renders as an actual newline instead of backslash-n text.
- **Approach:** Change `<pre className={className}>{truncated}\n{outputTruncatedLabel}</pre>` to `<pre className={className}>{truncated}{"\n"}{outputTruncatedLabel}</pre>`.
- **Status:** OPEN

### 2. C11-2 — Fix `getDefaultCode` so `clang_cpp23`/`clang_cpp26` return C++ template
- **File:** `src/components/code/compiler-client.tsx` (lines 68-76)
- **Severity:** LOW
- **Task:** Reorder the language checks so C++ variants (`cpp*`, `clang_cpp*`) are checked before the generic C branch.
- **Approach:** Move the `language.startsWith("cpp") || language.startsWith("clang_cpp")` check above the `language.startsWith("c") && !language.startsWith("cs")` check.
- **Status:** OPEN

### 3. C11-3 — Wrap `decodeURIComponent` in try/catch in backup download handler
- **File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx` (line 64)
- **Severity:** LOW
- **Task:** Guard `decodeURIComponent` against malformed percent-encoding that throws `URIError`.
- **Approach:** Wrap `decodeURIComponent(filenameMatch[1] ?? filenameMatch[2])` in try/catch; on error, fall back to `null` so the client-side timestamp fallback is used.
- **Status:** OPEN

---

## Deferred items

None — all findings are straightforward fixes with no security/correctness tradeoffs.

---

## Gate results (pre-fix)

- `npx eslint .` — PASS (0 errors, 0 warnings)
- `npx tsc --noEmit` — PASS
- `npx next build` — PASS
- `npx vitest run` — PASS
- `npx vitest run --config vitest.config.component.ts` — PASS
