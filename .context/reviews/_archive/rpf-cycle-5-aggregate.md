# Cycle 5 Aggregate Review (review-plan-fix loop)

## Scope
- Aggregated from: rpf-cycle-5-code-reviewer, rpf-cycle-5-security-reviewer, rpf-cycle-5-perf-reviewer, rpf-cycle-5-architect, rpf-cycle-5-test-engineer, rpf-cycle-5-critic, rpf-cycle-5-debugger, rpf-cycle-5-verifier, rpf-cycle-5-designer
- Base commit: 4c2769b2

## Deduped findings

### AGG-1 -- PublicHeader dropdown renders admin/instructor-only items to ALL authenticated users
- **Severity:** HIGH
- **Confidence:** HIGH
- **Cross-agent agreement:** designer F1, verifier F1+F2, debugger F3, critic F2, architect F2
- **Evidence:**
  - `src/components/layout/public-header.tsx:211-219`: desktop dropdown renders all items without filtering by `adminOnly`/`instructorOnly` flags
  - `src/components/layout/public-header.tsx:300-312`: mobile menu renders all items without filtering
  - `src/components/layout/public-header.tsx:30-32`: `adminOnly` and `instructorOnly` flags are defined in the type but never checked during rendering
  - `src/components/layout/public-header.tsx:51-72`: `getDropdownItems` sets the flags but they are dead code
- **Why it matters:** Students see "Admin", "Problems", and "Groups" links that they cannot access. Clicking produces a 403 error. This is an information disclosure and UX regression introduced by the Phase 2 dropdown.
- **Suggested fix:** Filter dropdown items by role before rendering in both desktop and mobile views. Better: refactor `getDropdownItems` to only include items the user can access, removing the need for filtering flags.

### AGG-2 -- Group assignment export has no row limit (OOM risk, carried from cycle 4)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F1, perf-reviewer F1, critic F1
- **Evidence:**
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:50`: `getAssignmentStatusRows(assignmentId)` returns unbounded data
  - `src/lib/assignments/submissions.ts:513-523`: enrolled students query has no limit
  - Contest export was fixed with `MAX_EXPORT_ENTRIES = 10_000` but group export was not
- **Why it matters:** A large group export can OOM the server. Same class of bug as contest export (AGG-1, cycle 4) which was rated HIGH.
- **Suggested fix:** Add `MAX_EXPORT_ROWS` cap after `getAssignmentStatusRows` call, matching the contest export pattern.

### AGG-3 -- Group assignment export route lacks rate limiting
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** security-reviewer F1, code-reviewer F6
- **Evidence:**
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:13`: uses manual `getApiUser` without `createApiHandler`
  - All other export routes use `createApiHandler` with `rateLimit: "export"`
- **Why it matters:** An attacker with instructor access can repeatedly request exports, causing resource exhaustion.
- **Suggested fix:** Migrate to `createApiHandler` with `rateLimit: "export"`.

### AGG-4 -- Deploy-worker.sh `ensure_env_var` has sed injection risk
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Cross-agent agreement:** security-reviewer F2, critic F3
- **Evidence:**
  - `scripts/deploy-worker.sh:101-107`: `sed -i "s|^${key}=.*|${key}=${value}|"` uses unsanitized value from `APP_URL`
  - Shell special characters (`|`, `$`, backticks) in the value could break the sed command or cause unintended behavior
- **Why it matters:** A URL with pipe characters or shell metacharacters could corrupt the remote .env file.
- **Suggested fix:** Use `awk` or Python for the remote env update, escaping special characters.

### AGG-5 -- Multiple API routes use dual count + data queries instead of COUNT(*) OVER()
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F2+F3+F4+F5, perf-reviewer F4, architect F3
- **Files:**
  - `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:158-180`
  - `src/app/api/v1/problems/route.ts:27-60, 77-108`
  - `src/app/api/v1/users/route.ts:38-49`
  - `src/app/api/v1/submissions/route.ts:111-159`
- **Why it matters:** Under concurrent load, the count can drift from the actual rows returned. Each query is a full scan with the same WHERE clause, doubling query load.
- **Suggested fix:** Use COUNT(*) OVER() to collapse into a single query. Create a shared utility for extracting the total from the first row.

### AGG-6 -- 11 API routes still use manual `getApiUser` pattern
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F6, architect F1, security-reviewer F5
- **Description:** Carried from cycle 4 AGG-12. No progress has been made. The SSE and file-upload routes have legitimate reasons. The others (tags, backup, admin/migrate/*, admin/restore, group assignment export, group assignments POST) should be migrated.
- **Suggested fix:** Incrementally migrate simple routes to `createApiHandler`.

### AGG-7 -- No tests for group assignment export route, PublicHeader dropdown, or leaderboard live rank
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Cross-agent agreement:** test-engineer F1+F3+F5, critic F4
- **Evidence:**
  - Group assignment export: no route-level tests
  - PublicHeader dropdown: no component tests for role-based rendering
  - Leaderboard `computeSingleUserLiveRank`: no unit tests (carried from cycle 21 plan M3)
  - `getParticipantTimeline`: no unit tests (carried from cycle 21 plan M4)
- **Suggested fix:** Add tests for all four areas. Prioritize the dropdown test (AGG-1 regression risk) and the leaderboard test (scoring correctness).

### AGG-8 -- Group assignment export `bestTotalScore` renders "null" in CSV
- **Severity:** LOW
- **Confidence:** HIGH
- **Cross-agent agreement:** debugger F1
- **Evidence:**
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:68`: `String(row.bestTotalScore)` produces "null" when the value is null
- **Why it matters:** CSV output shows "null" instead of empty or "0" for students with no graded submissions.
- **Suggested fix:** Use `row.bestTotalScore ?? ""` or `row.bestTotalScore ?? 0`.

### AGG-9 -- `parsePagination` silently caps at MAX_PAGE without client notification
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Cross-agent agreement:** critic F5
- **Evidence:**
  - `src/lib/api/pagination.ts:3,16`: `Math.min(MAX_PAGE, ...)` silently caps page to 10000
- **Suggested fix:** Return an error or include maxPage metadata when the cap is hit.

## Verification results from prior-cycle fixes

| Fix | Status |
|---|---|
| Cycle 4 AGG-1: Contest export row limit | CONFIRMED FIXED |
| Cycle 4 AGG-2: Contest export CSV escape | CONFIRMED FIXED |
| Cycle 4 AGG-3: Group assignment export CSV escape | CONFIRMED FIXED |
| Cycle 4 AGG-4: Deploy-worker.sh .env preservation | CONFIRMED FIXED |
| Cycle 4 AGG-5: COMPILER_RUNNER_URL auto-injection | CONFIRMED FIXED |
| Cycle 4 AGG-7: parsePagination uses parsePositiveInt | CONFIRMED FIXED |
| Cycle 4 AGG-9: Proxy matcher /workspace removal | CONFIRMED FIXED |
| Cycle 4 AGG-6: PublicHeader dropdown (Phase 2) | PARTIALLY FIXED - dropdown added but items not filtered by role |
| Cycle 4 AGG-10: Export route tests | NOT FIXED |
| Cycle 4 AGG-11: Submissions GET dual query | NOT FIXED |
| Cycle 4 AGG-12: Manual getApiUser routes | NOT FIXED |

## Lower-signal / validation-needed findings

- security-reviewer F4: SSE auth recheck interval of 30s is a known tradeoff
- perf-reviewer F5: SSE inArray with 500 IDs is acceptable for current scale
- debugger F2: SSE close race is theoretical in single-threaded JS
- debugger F4: Anti-cheat 500-char details limit is adequate
- designer F3: Skip-to-content link verification needed
- designer F4: DropdownMenu ARIA attributes need verification

## Agent failures
- No agent failures -- all 9 reviews completed successfully
