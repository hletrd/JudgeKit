# Cycle 18 Debugger Reviewer Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** Latent bug surface, failure modes, regressions
**Base commit:** 75d82a17
**Previous review:** cycle-18-debugger.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | `import-transfer.ts` string concatenation OOM risk | **STILL OPEN** — unchanged |
| F2 | `updateRecruitingInvitation` uses `new Date()` | **STILL OPEN** — unchanged |

---

## New Findings

### N1: Unhandled Promise Rejection in Auto Code Review

- **File**: `src/app/api/v1/judge/poll/route.ts:206`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `void triggerAutoCodeReview(submissionId)` creates floating promise. May crash process if `--unhandled-rejections=strict`.
- **Fix**: Add `.catch()` handler.

### N2: Docker Build Timeout May Leave Orphan Containers

- **File**: `src/lib/docker/client.ts:266-269`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: SIGKILL may not trigger cleanup. Container removal is fire-and-forget.
- **Fix**: Await container removal with retry.

### N3: `getDiskUsageLocal` Fragile `df` Output Parsing

- **File**: `src/lib/docker/client.ts:294-307`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Parses `df -h /` by fixed column indices. Locale/format changes break parsing.
- **Fix**: Use `fs.statfs()` (Node.js 18+) or `df -B1` for machine-readable output.

### N4: Git Status Reports Non-Existent Untracked Files

- **Evidence**: `git status` listed `active-timed-assignment-sidebar-panel.tsx`, `app-sidebar.tsx`, `conditional-header.tsx` and tests. Files do not exist on disk.
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: Corrupted git index or stale entries.
- **Fix**: `git rm --cached` phantom entries or reset index.
