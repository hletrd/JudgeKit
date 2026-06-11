# Cycle 18 Critic Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** Multi-perspective critique
**Base commit:** 75d82a17
**Previous review:** cycle-18-critic.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | Deprecated `cleanupOldEvents` still called by cron | **STILL OPEN** — endpoint still active |
| F2 | Contest analytics first-AC comment without fix | **STILL OPEN** — documented but not fixed |
| F3 | Workspace migration Phase 3 design decisions | **STILL OPEN** — no progress |

---

## New Findings

### N1: Cross-Agent Agreement on `getRecruitingAccessContext` Caching

- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Agreed across security, code, perf, and architect reviewers: the N+1 query pattern from `getRecruitingAccessContext` is the most impactful issue. The `withRecruitingContextCache` added in `api/handler.ts:109` only covers API routes that use `createApiHandler`. Page components and server actions that call `getRecruitingAccessContext` directly are NOT covered.
- **Fix**: Apply the same caching pattern to all entry points (page components, server actions, direct route handlers).

### N2: `decryptPluginSecret` Plaintext Fallback Has No Production Guard

- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Security reviewer N1 and architect reviewer N2 both flagged this. The plugin encryption module silently bypasses decryption for non-encrypted values, with no production safeguard. This is a higher-severity issue than the column encryption fallback (which at least throws in production).
- **Fix**: Add production rejection and warn-log, matching `encryption.ts` behavior.

### N3: Admin Route `needsRehash` Still Ignored After Multiple Cycles

- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: This has been flagged in cycles 17 and 18. Four admin routes still discard `needsRehash`. The recruiting-invitations path has been fixed. The admin routes remain unfixed.
- **Fix**: Add rehash logic to admin backup/export/import routes, or document why they are exempt.

---

## Cross-Agent Agreement Summary

| Finding | Security | Code | Perf | Architect | Debugger | Test |
|---------|----------|------|------|-----------|----------|------|
| Plugin secret plaintext fallback | N1 | — | — | N2 | — | — |
| Recruiting context N+1 | F2 | F1 | F1 | F1 | — | F1 |
| Rate limit dual implementation | — | — | — | N1 | — | — |
| Unhandled auto-review promise | N2 | — | — | — | N1 | — |
| `needsRehash` admin routes | F1 | — | — | — | — | F2 |
| `cleanupOldEvents` deprecated | F3 | — | — | — | — | F3 |
