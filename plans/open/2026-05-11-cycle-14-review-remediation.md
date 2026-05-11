# 2026-05-11 Cycle 14 Review Remediation Plan

**Source:** `/.context/reviews/_aggregate-cycle-14.md`
**Head reviewed:** `a4ad2d8c`

## Findings to implement this cycle

### Fix 1: Remove unnecessary `as` cast in backup stream (C14-1) ✅ DONE
- **File:** `src/lib/db/export-with-files.ts:155`
- **Severity:** LOW, High confidence
- **Issue:** `JSON.parse(dbJson) as JudgeKitExport` — unnecessary cast on trusted app-generated data. The parsed object is only used to access `redactionMode` with a `??` fallback. The cast masks any future export generator bugs.
- **Fix:** Removed the `as JudgeKitExport` cast. `JSON.parse` returns `any`, which is compatible with the `createBackupIntegrityManifest` parameter type. The `redactionMode` property access still has its `?? "legacy-unknown"` fallback.
- **Commit:** `fix(backup): 🐛 remove unnecessary as cast in backup stream`
- **Gate results:** eslint ✓, next build ✓, vitest ✓

### Fix 2: Fix fullscreen error handling in lecture toolbar (C14-3) ✅ DONE
- **File:** `src/components/lecture/lecture-toolbar.tsx:66-68`
- **Severity:** LOW, Low confidence
- **Issue:** Empty `.catch(() => {})` on fullscreen promise chains can leave UI state out of sync with actual fullscreen state. The `.then()` callbacks set `isFullscreen` before the browser confirms the state change, and are redundant with the `fullscreenchange` event listener (lines 116-120).
- **Fix:** Removed the redundant `.then(() => setIsFullscreen(...))` callbacks from both `exitFullscreen()` and `requestFullscreen()` calls. The existing `fullscreenchange` event listener already keeps `isFullscreen` in sync with the actual browser state. Kept `.catch(() => {})` to prevent unhandled promise rejections.
- **Commit:** `fix(lecture): 🐛 remove redundant fullscreen state callbacks`
- **Gate results:** eslint ✓, next build ✓, vitest ✓

## Deferred findings

Per repo rules (CLAUDE.md), LOW-severity code-quality findings may be deferred when they require architectural refactoring and have documented mitigations.

### DEFER-C14-2: rawQueryOne/rawQueryAll lack runtime validation
- **File:** `src/lib/db/queries.ts:43-73`
- **Severity:** LOW, Medium confidence
- **Reason for deferral:** Adding runtime validation (e.g., optional Zod schema parameter) would require refactoring 50+ call sites across the codebase. The cycle-13 documentation addition (lines 28-42) adequately warns developers of the risk. This is architectural debt, not an immediate bug.
- **Exit criterion:** Raw SQL helper refactor cycle opens, or a caller experiences a SQL/type drift bug in production.

### DEFER-C13-1: rawQueryOne generic cast
- **File:** `src/lib/db/queries.ts:50`
- **Severity:** LOW, High confidence
- **Reason for deferral:** Same as DEFER-C14-2. The `as T | undefined` cast is documented with extensive JSDoc warnings. Callers are expected to validate results. Refactoring would touch 50+ call sites.
- **Exit criterion:** Raw SQL helper refactor cycle opens.

### DEFER-C13-2: rawQueryAll generic cast
- **File:** `src/lib/db/queries.ts:72`
- **Severity:** LOW, High confidence
- **Reason for deferral:** Same as DEFER-C13-1 and DEFER-C14-2. The `as T[]` cast is documented with warnings.
- **Exit criterion:** Raw SQL helper refactor cycle opens.

## Verification
- `npm run lint`
- `npm run build`
- `npm run test:unit`
