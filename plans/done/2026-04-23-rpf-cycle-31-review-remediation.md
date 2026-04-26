# RPF Cycle 31 Review Remediation Plan

**Date:** 2026-04-23
**Base commit:** 198e6a63
**Review artifacts:** All per-agent reviews in `.context/reviews/` + `.context/reviews/_aggregate.md`

## Previously Completed Tasks (Verified in Current Code)

All cycle 30 tasks are complete:
- [x] Task A: Countdown timer setInterval migration — Fixed in commit 19de5cf6
- [x] Task B: Rate-limiter .catch() guard — Fixed in commit 7ae57906
- [x] Task C: Chat widget sendMessage stabilization — Fixed in commit ce9aa4fa

## Tasks (priority order)

### Task A: Migrate `active-timed-assignment-sidebar-panel.tsx` from `setInterval` to recursive `setTimeout` [MEDIUM/MEDIUM]

**From:** AGG-1 (10 reviewers), CR-1, PERF-1, ARCH-1, CRI-1, V-1, DBG-1, TR-1, DES-1, TE-1, DOC-1
**Severity / confidence:** MEDIUM / MEDIUM (upgraded from DEFER-42 at LOW/LOW due to 10-reviewer consensus)
**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:63`

**Problem:** The sidebar panel uses `window.setInterval(() => {...}, 1000)`. The codebase has established recursive `setTimeout` as the standard pattern for all timer-based effects. This is the last remaining client-side timer using `setInterval`. The comment on line 78-79 says "This matches the pattern in countdown-timer.tsx" but it doesn't — countdown-timer now uses recursive `setTimeout`. When a student switches tabs during an active assignment, throttled `setInterval` callbacks fire in rapid succession on tab return, causing burst re-renders and progress bar stuttering.

**Plan:**
1. Replace `window.setInterval()` with recursive `setTimeout` pattern using `cancelled` flag
2. Keep the `visibilitychange` handler for immediate correction on tab switch
3. Keep the self-stopping behavior when all assignments expire
4. Use `clearTimeout` instead of `clearInterval` in the cleanup function
5. Update the misleading comment on line 78-79
6. Verify all gates pass

**Status:** DONE (commit 092dd688)

---

### Task B: Sanitize chat widget tool execution error messages before passing to LLM [MEDIUM/HIGH]

**From:** AGG-2 (6 reviewers), SEC-1, CRI-2, V-2, DBG-2, TR-2, TE-2
**Severity / confidence:** MEDIUM / HIGH
**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:431`

**Problem:** When a tool execution fails, the catch block constructs: `Error executing tool "${call.name}": ${err instanceof Error ? err.message : "unknown error"}`. This raw `err.message` is sent to the LLM as a tool result. Internal error messages can contain database connection strings, file system paths, stack traces, and internal service names. The LLM may relay these to the user.

**Plan:**
1. Replace the raw error message with a generic message: `Error executing tool "${call.name}" — please try again`
2. The full error is already logged by `logger.warn` on line 430, so no diagnostic information is lost
3. Verify all gates pass

**Status:** DONE (commit 6b1d3ee7)

---

### Task C: Add `.catch()` guards to three server-side sidecar `.json()` calls [LOW/MEDIUM]

**From:** AGG-3 (6 reviewers), CR-3, CR-4, CR-5, V-3, ARCH-2, SEC-3
**Severity / confidence:** LOW / MEDIUM
**Files:**
- `src/lib/assignments/code-similarity-client.ts:49`
- `src/lib/compiler/execute.ts:533`
- `src/lib/security/hcaptcha.ts:76`

**Problem:** Three server-side sidecar/external API clients call `response.json()` without `.catch()` on success paths. The rate-limiter-client.ts was fixed in cycle 30 with a `.catch(() => null)` pattern, establishing it as the canonical approach.

1. code-similarity-client.ts: `response.json()` without `.catch()`. If the sidecar returns 200 with non-JSON, the `SyntaxError` is caught by the outer catch and logged as "unreachable" which is misleading.
2. compiler/execute.ts: `response.json()` without `.catch()`. Same issue. The error is logged as "Rust runner unavailable" when the runner was actually reachable but returned invalid data.
3. hcaptcha.ts: `response.json()` without `.catch()`. If hcaptcha returns 200 with non-JSON, the `SyntaxError` is an unhandled promise rejection.

**Plan:**
1. Add `.catch(() => null)` to code-similarity-client.ts and add null check
2. Add `.catch(() => null)` to compiler/execute.ts tryRustRunner and add null check with accurate log message
3. Add `.catch(() => ({ success: false, "error-codes": ["parse-error"] }))` to hcaptcha.ts
4. Verify all gates pass

**Status:** DONE (commit fd265c61)

---

### Task D: Extract triple `find()` in edit-group-dialog SelectValue to a variable [LOW/LOW]

**From:** AGG-4 (3 reviewers), CR-2, PERF-2, DES-2
**Severity / confidence:** LOW / LOW
**File:** `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:141-143`

**Problem:** The `SelectValue` render calls `group.availableInstructors.find(...)` three times with the same predicate. Minor unnecessary O(3n) instead of O(n) on every render.

**Plan:**
1. Extract `const selectedInstructor = group.availableInstructors.find(...)` before the JSX
2. Use `selectedInstructor` in the render expression
3. Verify all gates pass

**Status:** DONE (commit 0d27ecac)

---

## Deferred Items

### DEFER-1 through DEFER-21: Carried from cycle 29

See `plans/open/2026-04-23-rpf-cycle-29-review-remediation.md` for the full deferred list. All carry forward unchanged.

### DEFER-29: Migrate raw route handlers to `createApiHandler` (carried from DEFER-1)

**Reason:** Large refactor requiring careful testing of each route. Not a quick fix.
**Exit criterion:** All manual-auth routes migrated and tested.

### DEFER-30: SSRF via chat widget test-connection endpoint (SEC-1)

**Reason:** Already mitigated — uses stored keys, model validation applied. Requires API design decision for further hardening.
**Severity:** HIGH but mitigated.
**Exit criterion:** Product decision made on test-connection API design; implementation follows.

### DEFER-31: Performance P0 fixes (deregister race, unbounded analytics, unbounded similarity check, scoring full-table scan)

**Reason:** These are production performance issues requiring careful benchmarking and testing.
**Severity:** CRITICAL but requires production testing.
**Exit criterion:** Each P0 fix benchmarked and tested in staging.

### DEFER-32 through DEFER-41: Carried from cycle 29

All deferred items from the cycle 29 plan carry forward unchanged.

### DEFER-42: ~~`active-timed-assignment-sidebar-panel.tsx` uses `setInterval` for countdown~~ PROMOTED TO TASK A

This item was previously deferred at LOW/LOW but is now flagged by 10 of 11 reviewers at MEDIUM/MEDIUM. Promoted to Task A of this cycle.

### DEFER-43: Docker client leaks `err.message` in build error responses [LOW/MEDIUM]

- **Source:** AGG-5 (SEC-2)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/lib/docker/client.ts:174`
- **Reason for deferral:** The endpoint is admin-only, significantly reducing risk. The Docker client is used only in worker-side operations. Requires careful review of all error message consumers.
- **Exit criterion:** When the Docker client module is being modified for another reason, or when a dedicated security hardening pass is scheduled.

### DEFER-44: No documentation for the established timer pattern convention [LOW/LOW]

- **Source:** DOC-2
- **Severity / confidence:** LOW / LOW
- **Citations:** Codebase convention
- **Reason for deferral:** Documentation-only change. No functional impact. Best addressed when the last timer is migrated (Task A this cycle) as part of the commit or a follow-up docs commit.
- **Exit criterion:** When a documentation pass is scheduled, or as a follow-up to Task A.

---

## Progress log

- 2026-04-23: Plan created with 4 tasks, DEFER-42 promoted to Task A, 2 new deferred items (DEFER-43, DEFER-44).
- 2026-04-23: All 4 tasks completed. Task A (sidebar setTimeout) — commit 092dd688. Task B (chat tool error sanitization) — commit 6b1d3ee7. Task C (sidecar .catch() guards) — commit fd265c61. Task D (triple find extraction) — commit 0d27ecac. All gates passed (ESLint, next build, vitest unit 294/294 pass, vitest integration 37 skipped, vitest component 22 pre-existing failures unrelated to changes, all changed-file tests pass).
