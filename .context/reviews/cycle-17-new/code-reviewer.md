# Cycle 17 Code Review

**Date:** 2026-05-08
**Base commit:** 919c8ba3
**Reviewer angle:** Code quality, correctness, maintainability

## Scope
- Entire `src/` tree (575 TS/TSX files)
- Focus on files modified in cycle 16 and their interactions
- Cross-file consistency checks
- Common bug patterns (cleanup, race conditions, error handling)

## Findings

### C17-CR-1 — [LOW] `DropdownMenuShortcut` applies `tracking-widest` unconditionally

- **Severity:** LOW (CLAUDE.md compliance)
- **Confidence:** HIGH
- **Files:** `src/components/ui/dropdown-menu.tsx:247`
- **Evidence:** The `DropdownMenuShortcut` component renders `<span className="... tracking-widest ...">{props.children}</span>`. The `tracking-widest` class is applied unconditionally via the `cn()` utility. While shortcut text is typically ASCII (e.g., "Ctrl+K"), the component accepts arbitrary children via `React.ComponentProps<"span">`. If Korean text is passed as a shortcut label, it violates the CLAUDE.md rule that Korean text must use default letter spacing.
- **Failure scenario:** A Korean locale translation passes a multi-character shortcut label containing Korean glyphs. The `tracking-widest` class applies excessive spacing to Korean characters, producing visually broken text.
- **Suggested fix:** Document that `DropdownMenuShortcut` children must be ASCII-only, or conditionally apply `tracking-widest` based on locale if the children could contain Korean text.

### C17-CR-2 — [LOW] `public-footer.tsx` uses `new Date().getFullYear()` in server component

- **Severity:** LOW (SSR/hydration edge case)
- **Confidence:** LOW
- **Files:** `src/components/layout/public-footer.tsx:20`
- **Evidence:** The copyright text is computed as `© ${new Date().getFullYear()} ${siteTitle}` in an async server component. The year is evaluated at render time on the server. In the rare case where a request spans a year boundary (e.g., Dec 31 23:59:59 server time → Jan 1 client time), SSR and hydration could disagree on the year.
- **Failure scenario:** Page is rendered at 23:59:59 on Dec 31. Client hydrates at 00:00:01 on Jan 1. Next.js hydration mismatch because server rendered "2025" and client expects "2026".
- **Suggested fix:** Use a stable year source (e.g., build time constant, or `getBuildInfo().year`) instead of runtime `new Date()`.

### C17-CR-3 — [LOW] `node-shutdown.ts:beforeExit` handler lacks `.catch()` on `flushAuditBuffer()`

- **Severity:** LOW (unhandled rejection during shutdown)
- **Confidence:** MEDIUM
- **Files:** `src/lib/audit/node-shutdown.ts:29`
- **Evidence:** The `beforeExit` handler calls `void flushAuditBuffer()` without a `.catch()` handler. Unlike the `SIGTERM` and `SIGINT` handlers which use `.finally()`, the `beforeExit` handler does not guard against rejection. If `flushAuditBuffer()` throws, Node.js may log an unhandled rejection during shutdown.
- **Failure scenario:** Audit buffer flush fails (e.g., DB connection already closed) during graceful shutdown. Unhandled rejection logged before process exits.
- **Suggested fix:** Add `.catch(() => {})` or `.catch((err) => logger.warn(...))` to the `beforeExit` handler for consistency with other fire-and-forget DB operations in the codebase.

## Previously Fixed (Verified)

- C16-1: Callback ref non-null assertion in create-problem-form — **FIXED** (commit 3104e401)
- C16-2: RAF cleanup in public-header — **FIXED** (commit a1aae071)
- C16-AGG-1: PublicHeader sign-out error handling — **FIXED** (via `handleSignOutWithCleanup` in sign-out.ts)
- C16-AGG-2: AppSidebar tracking-wider — **FIXED** (conditional based on locale)
- C16-AGG-3: localStorage.clear() origin-wide destruction — **FIXED** (via targeted prefix removal in sign-out.ts)
- C16-AGG-7: redeemRecruitingToken JS-side date comparison — **FIXED** (uses SQL NOW() and defaults to alreadyRedeemed)
- C16-AGG-8: SSE re-auth IIFE unhandled rejection — **FIXED** (`.catch()` handler added on IIFE and sendTerminalResult)

## Final Sweep

- Checked all 155 useEffect sites for cleanup correctness — all have proper cleanup
- Checked all event listener additions — all have corresponding removals
- Checked all timer/RAF usage — all have cancellation paths
- Checked for missing error handling in async flows — patterns are consistent
- No relevant files were skipped.
