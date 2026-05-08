# Cycle 4 Review Remediation Plan

**Date:** 2026-05-08
**Review source:** `.context/reviews/_aggregate.md` (cycle 4/100)
**HEAD:** main / cf8cf423
**Goal:** Fix actionable findings from production browser review and code analysis.

---

## Items to implement this cycle

### 1. D1/C2 — Add missing "discussions" i18n key to nav namespace
- **Files:**
  - `messages/en.json` — add `"discussions": "Discussion Moderation"` under `nav`
  - `messages/ko.json` — add `"discussions": "토론 관리"` under `nav`
- **Task:** The breadcrumb on `/dashboard/admin/discussions` shows raw key `nav.discussions` because the key is missing from both locale files.
- **Status:** DONE — Added to both locale files. Also added `home` and `workspace` keys as part of C3.

### 2. C1/P1 — Fix timer leak in SubmissionListAutoRefresh on unmount
- **File:** `src/components/submission-list-auto-refresh.tsx` (lines 60-74)
- **Task:** Guard `scheduleNext()` so it does not create new timers after cleanup. Check `timerRef.current !== null` before recursing.
- **Status:** DONE — Added `if (timerRef.current !== null)` guard before `scheduleNext()` recursion.

### 3. C3 — Add missing nav i18n keys for workspace and control segments
- **Files:**
  - `messages/en.json` — add `"workspace": "Workspace"` and `"home": "Home"` under `nav`
  - `messages/ko.json` — add `"workspace": "작업 공간"` and `"home": "홈"` under `nav`
- **Task:** Prevent future breadcrumb raw-key display if these segments are ever used.
- **Status:** DONE — Added alongside D1/C2 in the same commit.

### 4. S1/D3 — Remove database connection string from admin settings UI
- **File:** `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx`
- **Task:** Remove the connection string display entirely. Show only database type, version, size, and table count.
- **Status:** DONE — Removed `dbPath` row from the DatabaseInfo component.

---

## Deferred items (must record exit criteria)

| ID | Severity | File/Line | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| T1 | LOW | `src/components/layout/breadcrumb.tsx` | Test coverage gap is best-effort improvement, not a bug | Re-open when expanding test suite with i18n validation |
| T2 | LOW | `src/components/submission-list-auto-refresh.tsx` | Timer cleanup test is best-effort improvement | Re-open when adding component-level timer tests |
| T3 | LOW | `src/components/hash-tabs.tsx` | Hash-tabs hydration test is best-effort improvement | Re-open when adding component test suite |

---

## Prior cycle deferred items (still valid)

All items from `_aggregate.md` prior cycle deferred list remain valid. See that file for full inventory.

---

## Implementation order

1. D1/C2 (discussions i18n) — user-facing UI bug
2. C1/P1 (timer leak) — correctness/resource leak bug
3. C3 (workspace/home i18n) — preventive fix
4. S1/D3 (DB connection string) — security hardening
