# Cycle 5b Deep Code Review

## Scope
- Current HEAD: 7b8362e1
- Focus: Files modified in recent commits, SSE route, contest components, compiler client, API routes

## New Findings

### F1 -- Contest polling components show toast.error on every failed fetch (HIGH)
- **Severity:** HIGH
- **Confidence:** HIGH
- **Evidence:**
  - `src/components/contest/contest-announcements.tsx:66`: `toast.error(t("fetchError"))` inside `loadAnnouncements` callback
  - `src/components/contest/contest-clarifications.tsx:89`: `toast.error(t("fetchError"))` inside `loadClarifications` callback
  - Both use `useVisibilityPolling` which fires immediately on visibility change and every 30s
  - A transient network blip or server restart will toast-spam the user on every poll cycle
- **Fix:** Only show toast.error on the initial load, not on refresh polling. Use a parameter like `isInitialLoad` to distinguish.

### F2 -- CompilerClient parses JSON before checking res.ok (MEDIUM)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Evidence:**
  - `src/components/code/compiler-client.tsx:265`: `const data = await res.json()` runs before `if (!res.ok)` on line 267
  - If the server returns a non-JSON error (e.g., 502 HTML page from nginx), `res.json()` throws SyntaxError
  - The catch on line 285 produces a confusing "Unexpected token <" error message instead of a meaningful one
- **Fix:** Check `res.ok` first, then parse JSON. Use a safe JSON parse helper or wrap in try/catch.

### F3 -- LeaderboardTable does not validate API response shape (MEDIUM)
- **Severity:** MEDIUM
- **Confidence:** MEDIUM
- **Evidence:**
  - `src/components/contest/leaderboard-table.tsx:227-228`: `setData(json.data)` with no validation
  - If `json.data` is null, undefined, or missing the expected fields, the component shows "no entries" instead of an error
- **Fix:** Validate that `json.data` has the expected shape before setting state.

### F4 -- Duplicated formatTimestamp in contest components (LOW)
- **Severity:** LOW
- **Confidence:** HIGH
- **Evidence:**
  - `src/components/contest/contest-announcements.tsx:30-38`: `formatTimestamp` function
  - `src/components/contest/contest-clarifications.tsx:47-55`: identical `formatTimestamp` function
- **Fix:** Extract to shared utility, e.g. `src/lib/formatting.ts` or a shared contest utils file.

## Verified fixes from prior cycles

| Finding | Status |
|---|---|
| Cycle 5 AGG-1: PublicHeader dropdown role filtering | CONFIRMED FIXED (capability-based filtering via getDropdownItems) |
| Cycle 5 AGG-2: Group export no row limit | CONFIRMED FIXED (MAX_EXPORT_ROWS = 10_000) |
| Cycle 5 AGG-3: Group export no rate limiting | CONFIRMED FIXED (createApiHandler with rateLimit: "export") |
| Cycle 5 AGG-8: Group export bestTotalScore "null" in CSV | CONFIRMED FIXED (row.bestTotalScore ?? "") |
| Cycle 4 AGG-10: Export route tests | NOT FIXED (no test added) |
| Cycle 5 AGG-5: Dual count+data queries | NOT FIXED (only 2 routes migrated to COUNT(*) OVER()) |
| Cycle 5 AGG-6: Manual getApiUser routes | NOT FIXED (11 routes still use manual pattern) |
| Cycle 5 AGG-7: Missing tests | NOT FIXED |
| Cycle 5 AGG-9: parsePagination silent cap | NOT FIXED |

## Carried forward (not deferrable)

None of the carried-forward items are security/correctness/data-loss, so they remain LOW priority.

## Lower-signal findings

- SSE route: auth recheck at 30s is a documented tradeoff, not a bug
- SSE route: connection tracking with in-memory Maps is appropriate for single-instance deployment
- `useVisibilityPolling`: the immediate-fire-on-visibility-change behavior is intentional (user returns to page, data should be fresh)
