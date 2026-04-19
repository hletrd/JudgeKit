# Cycle 5 Review Remediation Plan

**Date:** 2026-04-19
**Source**: Cycle 5 aggregate review (`.context/reviews/rpf-cycle-5-aggregate.md`)

---

## HIGH Priority

### H1: PublicHeader dropdown renders admin/instructor-only items to ALL users
- **Source**: designer F1, verifier F1+F2, debugger F3, critic F2, architect F2
- **Files**: `src/components/layout/public-header.tsx:211-219, 300-312`
- **Plan**:
  1. In `getDropdownItems`, remove the `adminOnly` and `instructorOnly` flags from the `DropdownItem` type since they are dead code.
  2. `getDropdownItems` already only adds instructor/admin items when the role matches -- the filtering is done at item creation time, not rendering time. Verify this by checking that items like "Problems" and "Groups" are only pushed when `isInstructor` is true, and "Admin" is only pushed when `isAdmin` is true.
  3. The bug is that items ARE being filtered at creation time. Re-examine the code: lines 59-69 show that "Problems" and "Groups" are only added inside `if (isInstructor)`, and "Admin" is only added inside `if (isAdmin)`. The `adminOnly`/`instructorOnly` FLAGS are dead code, but the actual filtering works correctly via the `if` blocks.
  4. **Correction**: On closer inspection, `getDropdownItems` already filters correctly at creation time. The `adminOnly`/`instructorOnly` fields are dead code (set but never read), but they don't cause a bug because the items are never added to the array for unauthorized roles. Remove the dead fields from the type definition.
- **Status**: TODO (verify and clean up dead code)

---

## MEDIUM Priority

### M1: Group assignment export has no row limit (OOM risk)
- **Source**: code-reviewer F1, perf-reviewer F1, critic F1, cycle 4 AGG-3
- **Files**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:50`
- **Plan**:
  1. Add `const MAX_EXPORT_ROWS = 10_000;` at the top of the route handler (matching contest export pattern).
  2. After `const statusData = await getAssignmentStatusRows(assignmentId);`, add truncation check: if `statusData.rows.length > MAX_EXPORT_ROWS`, slice and add a truncated indicator row to the CSV.
  3. If JSON format is ever added, include a `truncated` flag in the response.
- **Status**: TODO

### M2: Group assignment export route lacks rate limiting
- **Source**: security-reviewer F1, code-reviewer F6
- **Files**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts`
- **Plan**:
  1. Migrate from manual `getApiUser` + try/catch pattern to `createApiHandler` with `rateLimit: "export"`.
  2. This also adds consistent error handling and auth checks.
  3. Combine with M1 (row limit) in the same change.
- **Status**: TODO

### M3: Deploy-worker.sh `ensure_env_var` sed injection risk
- **Source**: security-reviewer F2, critic F3
- **Files**: `scripts/deploy-worker.sh:98-108`
- **Plan**:
  1. Replace the `sed -i` approach with a Python one-liner that properly handles special characters in key/value pairs.
  2. Alternative: use `awk` which handles special characters better than `sed` with shell interpolation.
  3. Quote the value in the Python/awk command to prevent shell interpretation.
- **Status**: TODO

### M4: Add tests for group assignment export route
- **Source**: test-engineer F1, cycle 4 AGG-10
- **Files**: New test file `tests/unit/api/group-assignment-export-route.test.ts`
- **Plan**:
  1. Test auth check (unauthorized, forbidden for non-instructors).
  2. Test CSV format: BOM presence, headers, content-disposition header.
  3. Test empty group export.
  4. Test row limit enforcement (after M1 is implemented).
- **Status**: TODO

### M5: Add tests for PublicHeader dropdown role-based rendering
- **Source**: test-engineer F3, designer F1
- **Files**: New test file `tests/unit/components/public-header-dropdown.test.tsx`
- **Plan**:
  1. Test `getDropdownItems` for student role: should NOT include Problems, Groups, Admin.
  2. Test `getDropdownItems` for instructor role: should include Problems, Groups but NOT Admin.
  3. Test `getDropdownItems` for admin role: should include all items.
  4. Test PublicHeader rendering in desktop and mobile modes.
- **Status**: TODO

### M6: Add tests for leaderboard live rank and participant timeline (carried from cycle 21)
- **Source**: test-engineer F5, cycle 21 plan M3/M4, critic F4
- **Files**: New test files
- **Plan**:
  1. Create `tests/unit/assignments/leaderboard-live-rank.test.ts` for `computeSingleUserLiveRank`.
  2. Create `tests/unit/assignments/participant-timeline.test.ts` for `getParticipantTimeline`.
  3. Test IOI without/with late penalty, ICPC mode, user with no submissions.
- **Status**: TODO

---

## LOW Priority

### L1: Migrate dual-query pagination routes to COUNT(*) OVER()
- **Source**: code-reviewer F2-F5, perf-reviewer F4, architect F3
- **Files**:
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
  - `src/app/api/v1/problems/route.ts`
  - `src/app/api/v1/users/route.ts`
  - `src/app/api/v1/submissions/route.ts`
- **Plan**: Convert each route to use COUNT(*) OVER() in the data query and extract total from the first row. Create a shared utility if beneficial.
- **Status**: TODO

### L2: Continue migrating manual `getApiUser` routes to `createApiHandler`
- **Source**: code-reviewer F6, architect F1, security-reviewer F5, cycle 4 AGG-12
- **Files**: 11 routes (listed in code-reviewer F6)
- **Plan**: Migrate simple routes first (tags, backup, admin/restore, admin/migrate/*). Skip SSE and file-upload routes (legitimate reasons).
- **Status**: TODO

### L3: Fix group assignment export `bestTotalScore` rendering "null" in CSV
- **Source**: debugger F1
- **Files**: `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:68`
- **Plan**: Change `String(row.bestTotalScore)` to `String(row.bestTotalScore ?? "")`.
- **Status**: TODO

### L4: Remove dead `adminOnly`/`instructorOnly` fields from `DropdownItem` type
- **Source**: verifier F1, debugger F3, designer F1
- **Files**: `src/components/layout/public-header.tsx:30-32`
- **Plan**: Remove the unused `adminOnly` and `instructorOnly` optional fields from the `DropdownItem` type and from where they are set in `getDropdownItems`.
- **Status**: TODO

### L5: Add mobile menu grouping for authenticated navigation items
- **Source**: designer F2, architect F4
- **Files**: `src/components/layout/public-header.tsx:300-312`
- **Plan**: Add a separator or heading above the authenticated items section in the mobile menu.
- **Status**: TODO

### L6: `parsePagination` silently caps at MAX_PAGE
- **Source**: critic F5
- **Files**: `src/lib/api/pagination.ts:3,16`
- **Plan**: Consider adding a `maxPage` field to paginated responses or returning an error when page exceeds MAX_PAGE.
- **Status**: TODO

---

## Deferred Items (No Action This Cycle)

| Finding | Severity | Reason | Exit Criterion |
|---------|----------|--------|----------------|
| L1: Dual-query pagination migration | LOW | Non-blocking perf improvement; current behavior is correct under normal load | Performance reports of count drift or query load issues |
| L2: Manual getApiUser route migration | LOW | Large refactor scope; routes are functional and secure | Code consistency review requires it |
| L6: parsePagination MAX_PAGE notification | LOW | Edge case (page > 10000); no user reports | User confusion about silent capping |
