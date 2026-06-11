# RPF Cycle 3 — Perf Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** 66146861
**Scope:** Hot paths, polling, DB queries, memory, deploy script.

## Cycle change surface

`deploy-docker.sh` only.

### Performance impact of cycle-2 commits

The SSH ControlMaster change is a pure win:
- Before: each `remote`/`remote_copy`/`remote_rsync`/`remote_sudo` call performed full SSH key exchange + sshpass auth (≈300-800 ms per call, depending on RTT and crypto agility).
- After: only the first call authenticates (≈800 ms). Subsequent calls reuse the multiplexed channel (≈10-30 ms RTT).

A typical deploy invokes ≈40-60 remote calls (preflight, sync, drizzle-push, build, container restart, nginx config, verify). Estimated savings: ≈40 × (500ms - 20ms) = ≈19 seconds wall time per deploy. No new perf regressions introduced.

### Performance findings on the change surface

**C3-PR-1 [LOW] `_initial_ssh_check` exponential backoff doubles the worst-case wall time but uses fixed `delay=2,4,8`.**
- File/lines: `deploy-docker.sh:165-178`.
- Severity: LOW.
- Confidence: HIGH.
- Rationale: Worst case = `2 + 4 + 8 = 14s` of `sleep` + 4 × ConnectTimeout=15s = 74s before declaring SSH unreachable. For an actually-down host, this is wall-time on the operator. For a transiently-glitchy host, this is fine.
- Failure scenario: Operator deploys to a host that has been decommissioned. They wait 74s to find out. Acceptable but not ideal.
- Suggested fix: Optional — accept env var `SSH_INIT_RETRIES` (default 4) to let CI/automation cap retries. One-line addition.
- Status: LOW, deferrable with exit criterion: "operator complains about long wait when host is down."

## Carry-forward findings (status verified at HEAD)

**C2-AGG-6 [LOW — DEFERRED] Practice page Path B in-memory progress filter.**
- File/lines: `src/app/(public)/practice/page.tsx:417` (Path B branch).
- Severity (preserved): LOW.
- Status: UNCHANGED. The `progress filter active` branch still:
  1. Fetches all matching problem IDs (`problemsTable` with whatever filters are not progress-related).
  2. Fetches all user submissions for those problem IDs.
  3. Filters in JavaScript by progress state.
  4. Paginates the filtered list.
  Memory is bounded by `O(unfiltered-problem-count + user-submission-count)`. For a fresh user with 5k problems and 0 submissions, that's tractable. For an active user with 5k problems and 50k submissions, memory pressure is real on a small dyno.
- Concrete trigger: Practice page p99 latency > 1.5s OR > 5k matching problems for any active query (entry criterion preserved).
- Carry-forward.

**AGG-2 [MEDIUM — DEFERRED, carry from earlier cycles] `Date.now()` in `atomicConsumeRateLimit` hot path.**
- File/lines: `src/lib/api-rate-limit.ts:56` (line approximate per cycle-2 review).
- Severity (preserved): MEDIUM.
- Status: UNCHANGED. Same finding as cycle-2 carry-forward.

**PERF-3 [MEDIUM — DEFERRED] Anti-cheat heartbeat gap query transfers up to 5000 rows.**
- File/lines: `src/lib/anti-cheat/`.
- Severity (preserved): MEDIUM.
- Status: UNCHANGED. No anti-cheat code touched this cycle.

## Hot-path sweeps (no new findings)

- `grep -RIn "for.*of.*\\.map\\|\\.filter\\(.*\\)\\.length" src/lib/` — no obvious O(n²) hot-path constructions in the diff'd files.
- `grep -RIn "useEffect\\(\\(\\) => .* setInterval" src/components/` — same 14 visibility-aware polling sites as cycle-2 (carry-forward, not regressed).
- `grep -RIn "JSON\\.parse\\|JSON\\.stringify" src/lib/realtime/` — bounded message sizes, no perf issue.

## Summary

- 1 new LOW finding (C3-PR-1) on the deploy script.
- Cycle-2 SSH multiplexing IS a positive perf win (~19s saved per deploy).
- All carry-forward perf findings unchanged.

**Total new findings this cycle:** 1 LOW.
