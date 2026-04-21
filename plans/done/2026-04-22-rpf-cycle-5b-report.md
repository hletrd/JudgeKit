# RPF Cycle 5b -- End-of-Cycle Report

**Cycle**: 5b
**Date**: 2026-04-22
**Mode**: DEPLOY_MODE=per-cycle
**Deploy target**: algo.xylolabs.com (10.50.1.116)

---

## Gate Results (post-change)

| Gate | Status |
|------|--------|
| eslint | PASS |
| tsc --noEmit | PASS |
| npm run build | PASS |
| vitest run | PASS (294 files, 2104 tests) |

## Deployment

- **Command**: `source .env.deploy.algo && ./deploy-docker.sh --skip-languages`
- **Result**: SUCCESS -- HTTP 200 at oj-internal.maum.ai
- **Migrations**: 0 changes detected (schema already current)
- **Nginx**: Reloaded OK

## Commits (5 fine-grained)

| Commit | Message |
|--------|---------|
| `861651f1` | `fix(formatting): add shared formatContestTimestamp utility` |
| `11ff42c1` | `fix(contests): suppress toast-spam on polling refresh in announcements` |
| `993394d1` | `fix(contests): suppress toast-spam on polling refresh in clarifications` |
| `cdfbc287` | `fix(compiler): check res.ok before parsing JSON response` |
| `33859718` | `fix(contests): validate leaderboard API response shape before setting state` |

## Findings Addressed

| ID | Severity | Component | Summary | Status |
|----|----------|------------|---------|--------|
| H1 | HIGH | contest-announcements, contest-clarifications | Polling refresh spams error toasts every 30s on transient failures | FIXED |
| M1 | MEDIUM | compiler-client | JSON parsed before checking res.ok; non-JSON error responses crash | FIXED |
| M2 | MEDIUM | leaderboard-table | No validation of API response shape before setData | FIXED |
| L1 | LOW | formatting.ts, contest-announcements, contest-clarifications | Duplicated timestamp formatting logic extracted to shared utility | FIXED |

## Prior-Cycle Findings Verified as Already Fixed

| ID | Severity | Summary | Status |
|----|----------|---------|--------|
| AGG-1 | HIGH | PublicHeader dropdown filtering by capabilities | Already fixed |
| AGG-2 | MEDIUM | Export route missing MAX_EXPORT_ROWS | Already fixed |
| AGG-3 | MEDIUM | Export route not using createApiHandler | Already fixed |
| AGG-8 | LOW | Null-to-empty-string fallback missing in export | Already fixed |

## Files Changed

- `src/lib/formatting.ts` -- Added `formatContestTimestamp` utility
- `src/components/contest/contest-announcements.tsx` -- Toast-spam fix + shared timestamp import
- `src/components/contest/contest-clarifications.tsx` -- Toast-spam fix + shared timestamp import
- `src/components/code/compiler-client.tsx` -- res.ok check before JSON parse
- `src/components/contest/leaderboard-table.tsx` -- API response shape validation

## Carry-Over / Not Addressed

| ID | Severity | Summary | Reason |
|----|----------|---------|--------|
| M2 (prev) | MEDIUM | apiFetch JSDoc does not document error handling behavior | Low risk, deferred |

## Metrics

- **Findings identified**: 4 new + 4 prior-cycle verified-already-fixed
- **Findings fixed this cycle**: 4
- **Lines changed**: ~50 (net)
- **Test regression**: 0 (all 2104 tests pass)
- **Build regression**: 0 (clean build)
