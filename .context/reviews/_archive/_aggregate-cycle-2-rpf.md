# Aggregate Review — Cycle 2 (RPF Loop)

**Date:** 2026-05-11
**Scope:** Remaining unfixed items from cycle 1 aggregate + verification of cycle 1 fixes
**Reviewer:** comprehensive-reviewer (single-agent, subagent spawning unavailable)

---

## New Findings Summary (This Cycle)

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 0 |
| LOW      | 0 |
| **Total** | **0** |

No new findings. This cycle addressed deferred items from cycle 1.

---

## Fixes Implemented This Cycle (3 commits)

### Security (5 items)
1. **M4: CSRF rejects empty origin without sec-fetch-site** — Removed overly strict check that rejected requests with no Origin header when expectedHost was known and sec-fetch-site was absent. Now accepts these (older browsers, some fetch clients).
2. **L5: CSRF protocol-relative origin bypass** — Added `/^https?:\/\//i` validation before `new URL(origin)` to reject `//evil.com` and similar protocol-relative origins.
3. **M10: Backup stream abort handling gap** — `streamBackupWithFiles` now propagates `AbortError` without wrapping. Route handler returns 499 (client closed) instead of 500 for client-initiated aborts.
4. **M11: File download Content-Type not validated against magic bytes** — Added `verifyFileMagicBytes()` check before serving files. Mismatched content falls back to `application/octet-stream` with `Content-Disposition: attachment`.
5. **M12: Submissions API compileOutput filter inconsistency** — POST response now respects `submissions.view_all` capability (instructors/admins can see compile output even when `showCompileOutput=false`), matching `sanitizeSubmissionForViewer` behavior in the detail endpoint.

### Performance (2 items)
6. **M6: truncateObject O(n²) JSON serialization** — Replaced repeated `JSON.stringify` calls with `computeJsonLength()`, a bottom-up size estimator. Reduces worst-case from O(n²) to O(n) for nested objects.
7. **M8: N+1 query in cursor pagination** — Cursor tokens now encode `{id, submittedAt}` as base64 JSON, eliminating the extra `findFirst` lookup to resolve the cursor's timestamp. Old plain-ID cursors still supported via fallback.

---

## Cycle 1 Findings Status (30 total)

| Status | Count |
|--------|-------|
| Fixed in cycle 1 | 12 |
| Fixed in cycle 2 | 7 |
| Remaining | 11 |

### Remaining items (deferred)
- **M5:** Offset pagination without composite index — needs schema change (submissions table)
- **M9:** Double query for includeSummary — design trade-off (COUNT GROUP BY for summary)
- **M14:** No unit tests for useSourceDraft hook
- **M15:** No tests for audit event buffer flush
- **M16:** Monolithic handler factory without middleware composition — architectural
- **L1-L13:** Various LOW items (tests, minor code quality, known deferred items)

---

## Verification

- All cycle 1 fixes confirmed intact in current code
- TypeScript compilation: clean (no errors)
- Tests: 117 passed covering all changed areas (csrf, submissions, files, backup, audit, export, verdict)
- No regressions detected

## Convergence Assessment

**Not converged.** Cycle 2 produced 7 fixes across 3 commits. The remaining 11 items are either:
- Require schema changes (M5)
- Design trade-offs (M9)
- Test coverage gaps (M14, M15, L8-L11)
- Architectural refactoring (M16, L12-L13)

These are appropriate to defer per repo rules. A cycle 3 review is recommended after a cooling period or when new code is introduced.
