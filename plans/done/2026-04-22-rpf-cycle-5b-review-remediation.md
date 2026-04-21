# RPF Cycle 5b Review Remediation Plan

## Source Review
- `.context/reviews/rpf-cycle-5b-comprehensive-review.md`

## Tasks

### H1: Fix toast-spam in contest polling components (HIGH)
- **Citation:** F1
- **Files:** `src/components/contest/contest-announcements.tsx`, `src/components/contest/contest-clarifications.tsx`
- **Plan:** Add `isInitialLoad` boolean parameter to load functions. Only call `toast.error()` when `isInitialLoad` is true. On refresh polling (from `useVisibilityPolling`), silently swallow errors.

### M1: Fix compiler-client JSON parse before res.ok check (MEDIUM)
- **Citation:** F2
- **File:** `src/components/code/compiler-client.tsx`
- **Plan:** Move `res.json()` after the `res.ok` check. Add a try/catch around `res.json()` for the error path to handle non-JSON error responses gracefully.

### M2: Add response shape validation in LeaderboardTable (MEDIUM)
- **Citation:** F3
- **File:** `src/components/contest/leaderboard-table.tsx`
- **Plan:** Validate that `json.data` is an object with `entries` array before calling `setData`. If invalid, set error state instead.

### L1: Extract shared formatTimestamp utility (LOW)
- **Citation:** F4
- **Files:** `src/components/contest/contest-announcements.tsx`, `src/components/contest/contest-clarifications.tsx`, `src/lib/formatting.ts`
- **Plan:** Move `formatTimestamp` to `src/lib/formatting.ts` and import from both components.
