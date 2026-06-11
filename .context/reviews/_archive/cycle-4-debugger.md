# Cycle 4 Debugger Review

**Reviewer:** debugger
**Base commit:** 5086ec22

## Findings

### F1 — Contest export `escapeCsvCell` prefixes with single-quote instead of tab — diverges from shared utility
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:17`
- **Description:** The local `escapeCsvCell` uses `'${escaped}'` (single-quote prefix) for formula injection prevention, while the shared `escapeCsvField` uses `"\t" + str` (tab prefix). These produce different CSV output for the same input. A student name like `=SUM(A1:A10)` would be rendered as `'=SUM(A1:A10)` in contest exports but `\t=SUM(A1:A10)` in admin exports. The tab prefix is more robust.
- **Concrete failure:** Opening a contest export CSV in a spreadsheet application could trigger formula injection for cells starting with `=`, `+`, `-`, or `@`.
- **Suggested fix:** Replace local `escapeCsvCell` with shared `escapeCsvField`.

### F2 — Deploy-worker.sh silently overwrites remote `.env` customizations
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `scripts/deploy-worker.sh:102-109`
- **Description:** The script creates a new `.env` file with 5 variables and uploads it via `scp`, replacing any existing `.env`. If the operator has added `DOCKER_HOST`, custom `RUST_LOG`, or other worker-specific settings, those are silently lost.
- **Concrete failure:** After a worker deploy, the worker may fail to start because it lost a custom `DOCKER_HOST=tcp://docker-proxy:2375` setting that was in the previous `.env`.
- **Suggested fix:** Preserve remote `.env` entries that are not in the generated file. Use `ssh ... 'cat >> .env'` for new entries only, or use a `.env.local` overlay.

### F3 — `parsePagination` uses `parseInt` with `||` fallback — fragile against future refactoring
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/lib/api/pagination.ts:14-17`
- **Description:** The `||` fallback pattern `parseInt(...) || 1` works correctly for NaN but also treats `0` as falsy. While `0` is already excluded by `Math.max(1, ...)`, the pattern is fragile. If someone removes the `Math.max` wrapper or changes the logic, NaN would propagate. The `parsePositiveInt` utility is the canonical pattern.
- **Suggested fix:** Refactor to use `parsePositiveInt`.

### F4 — Contest export has no row limit — same bug class as fixed AGG-1
- **Severity:** HIGH
- **Confidence:** HIGH
- **File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:67`
- **Description:** `computeContestRanking` returns all entries without a limit. The admin submissions export was fixed in cycle 3 with `.limit(10000)`, but the contest export was missed because it uses a different code path (`computeContestRanking` instead of a direct DB query).
- **Concrete failure:** Exporting a contest with 10,000+ participants would OOM the server.
- **Suggested fix:** Add a row limit to the contest export.
