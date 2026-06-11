# Cycle 4 Critic Review

**Reviewer:** critic
**Base commit:** 5086ec22

## Findings

### F1 — Contest export has no row limit (OOM risk — reconfirms code-reviewer F6, perf F1, debugger F4)
- **Severity:** HIGH
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer F6, perf-reviewer F1, debugger F4
- **File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:67`
- **Description:** This is the same class of bug as the admin submissions export (AGG-1, cycle 3) but in the contest export route. It uses `computeContestRanking` which loads all entries. The cycle 3 fix only covered the admin submissions CSV export, missing this route because it uses a different code path.

### F2 — Three divergent CSV escape implementations exist in the codebase
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/lib/csv/escape-field.ts` — shared utility (tab prefix for formula injection)
  - `src/app/api/v1/contests/[assignmentId]/export/route.ts:11-21` — local `escapeCsvCell` (single-quote prefix)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:12-25` — local `escapeCsvField` (tab prefix, matches shared)
- **Description:** Three different CSV escape implementations exist. The contest export version uses a weaker formula-injection mitigation (single-quote vs tab prefix). The shared utility was created in cycle 2 but two routes were not migrated.
- **Suggested fix:** Migrate both local implementations to the shared `escapeCsvField`.

### F3 — Workspace-to-public migration Phase 2 is not implemented yet
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Description:** Phase 1 (workspace route group elimination) was completed in cycle 3. Phase 2 (unified top navbar with authenticated dropdown) is the next step and is listed as user-injected TODO #1. The current `PublicHeader` shows only a single "Dashboard" link when logged in, with no dropdown for role-appropriate navigation.
- **Suggested fix:** Implement Phase 2 of the migration plan.

### F4 — Deploy-worker.sh `.env` overwrite and deploy-docker.sh COMPILER_RUNNER_URL auto-injection are user-injected TODOs that should be fixed this cycle
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:** `scripts/deploy-worker.sh:102-109`, `deploy-docker.sh:335-341`
- **Description:** User-injected TODOs #2 and #3 describe real operational pain points that cause deploy failures or lost configuration. The `.env` overwrite can silently remove `DOCKER_HOST` settings; the missing `COMPILER_RUNNER_URL` auto-injection forces manual edits before each deploy.
- **Suggested fix:** Implement both fixes as described in the TODOs.

### F5 — Proxy matcher dead code (`/workspace/:path*`)
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/proxy.ts:311`
- **Description:** The `/workspace/:path*` matcher entry is dead code after Phase 1 migration. Should be cleaned up.
