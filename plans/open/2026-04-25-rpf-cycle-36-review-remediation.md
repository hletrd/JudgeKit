# RPF Cycle 36 — Review Remediation Plan

**Date:** 2026-04-25
**Status:** DONE

---

## Tasks

### A. [MEDIUM] Fix unhandled rejection risk in analytics and contest-scoring background refresh
**Finding:** AGG-1
**Files:**
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:67-78`
- `src/lib/assignments/contest-scoring.ts:118-129`

**Plan:** Replace the `.then(async ...)`/`.catch(async ...)`/`.finally(...)` chain with a standalone async IIFE wrapped in try/catch/finally. Add a defensive outer `.catch()` to swallow any failures from `getDbNowMs()` itself during DB connectivity degradation. This prevents unhandled promise rejections that could crash the Node.js process.

**Progress:**
- [x] Fix analytics route
- [x] Fix contest-scoring route
- [x] Verify gates pass

---

### B. [LOW] Fix raw API response logging in database-backup-restore.tsx
**Finding:** AGG-2
**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:153-154`

**Plan:** Replace `console.error(data)` with `console.error("Restore failed:", (data as { error?: string }).error)` to match the fix applied to `group-instructors-manager.tsx` in cycle 35.

**Progress:**
- [x] Fix console.error
- [x] Verify gates pass

---

### C. [LOW] Fix `parseInt() ||` pattern in chat widget admin config
**Finding:** AGG-3
**File:** `src/lib/plugins/chat-widget/admin-config.tsx:295,306`

**Plan:** Replace `parseInt(e.target.value, 10) || defaultValue` with `Number.isFinite` pattern for consistency with cycle 35 fixes.

**Progress:**
- [x] Fix maxTokens and rateLimitPerMinute onChange handlers
- [x] Verify gates pass

---

### D. [LOW] Fix `parseInt() || 0` pattern in admin roles editor
**Finding:** AGG-4
**File:** `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:187`

**Plan:** Replace `parseInt(e.target.value, 10) || 0` with `Number.isFinite` pattern for consistency.

**Progress:**
- [x] Fix level onChange handler
- [x] Verify gates pass

---

### E. [LOW] Fix `parseInt() || 0` pattern in language config table
**Finding:** AGG-5
**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:320`

**Plan:** Replace `parseInt(diskUsage.usePercent) || 0` with `Number.isFinite` pattern for consistency.

**Progress:**
- [x] Fix diskUsage usePercent parsing
- [x] Verify gates pass

---

### F. [LOW] Fix exam-session GET to return 404 instead of 400 for non-exam assignments
**Finding:** AGG-6
**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:106`

**Plan:** Change `apiError("examModeInvalid", 400)` to `notFound("ExamSession")` for the GET route, consistent with the analytics route's handling of the same condition. A non-exam assignment has no exam session to GET, which is a "not found" semantic, not a "bad request".

**Progress:**
- [x] Fix GET route error response
- [x] Verify gates pass

---

## Deferred Findings

All carried deferred items from previous cycles remain deferred (see `_aggregate-cycle-36.md` Carried Deferred Items section). No new findings are being deferred this cycle — all 6 findings are scheduled for implementation above.
