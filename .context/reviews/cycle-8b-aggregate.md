# Aggregate Review — Cycle 8

## Deduplicated Findings (sorted by severity)

### HIGH SIGNAL (flagged by 2+ reviewers)

| ID | Finding | Severity | Confidence | Sources |
|----|---------|----------|------------|---------|
| AGG-1 | `formatScore` called without `locale` in recruit results page | MEDIUM | High | CR-5, UX-1 |
| AGG-2 | Public contest page: uncached expensive analytics on every request | MEDIUM | High | CR-8, PERF-1, UX-4 |
| AGG-3 | `editUser` self-edit password guard lacks self-exclusion (confirmed bug) | MEDIUM | High | CR-2, DBG-1, TE-1 |
| AGG-4 | Contest detail page fetches `compileOutput` without visibility check | MEDIUM | High | CR-6 |
| AGG-5 | Rate-limiting has two divergent implementations (DRY violation) | MEDIUM | High | CR-1, ARCH-1 |

### SINGLE-SOURCE FINDINGS

| ID | Finding | Severity | Confidence | Source |
|----|---------|----------|------------|--------|
| AGG-6 | Recruiting token IP rate limit consumed before token validation | MEDIUM | High | SEC-1 |
| AGG-7 | `resetFailedRedeemAttempt` fire-and-forget race with increment | MEDIUM | Medium | SEC-2 |
| AGG-8 | `checkServerActionRateLimit` lacks blockedUntil (no cooldown) | MEDIUM | High | SEC-6 |
| AGG-9 | `getApiUser` makes sequential DB queries for API-key-only clients | MEDIUM | High | PERF-2 |
| AGG-10 | `sanitizeSubmissionForViewer` hidden DB query N+1 risk | MEDIUM | High | DBG-4 |
| AGG-11 | `redeemRecruitingToken` increments counter for "alreadyRedeemed" race | LOW | High | DBG-2 |
| AGG-12 | Missing `X-Content-Type-Options: nosniff` on API responses | LOW | High | SEC-3 |
| AGG-13 | `contactEmail` on recruit results page lacks validation | LOW | High | SEC-4 |
| AGG-14 | JWT callback DB query on every request (known deferred F5) | MEDIUM | High | SEC-5 |
| AGG-15 | `recordRateLimitFailure`/`recordRateLimitFailureMulti` unused | LOW | High | CR-3 |
| AGG-16 | `isAnyKeyRateLimited` uses N separate queries | LOW | Medium | CR-4, PERF-4 |
| AGG-17 | `updateRecruitingInvitation` uses untyped updates | LOW | High | CR-7 |
| AGG-18 | Submission advisory lock acquired for non-exam submissions | LOW | Medium | PERF-6 |
| AGG-19 | `createApiHandler` doesn't support user-level rate limiting | LOW | High | ARCH-2 |
| AGG-20 | Recruiting rate-limit logic leaks into auth config | LOW | High | ARCH-4 |
| AGG-21 | Contest detail page sequential Promise.all blocks | MEDIUM | Medium | PERF-5 |
| AGG-22 | `recruiting-access.ts` sequential queries could be JOIN | LOW | High | PERF-3 |
| AGG-23 | Rate-limited recruit results: no retry hint for users | LOW | High | UX-3 |
| AGG-24 | Missing tests for reset/increment concurrency | MEDIUM | Medium | TE-2 |
| AGG-25 | Missing test for checkServerActionRateLimit no-cooldown behavior | LOW | High | TE-3 |
| AGG-26 | Missing test for formatScore locale | LOW | High | TE-4 |
| AGG-27 | Missing test for recruiting token rate-limit consumption on invalid | LOW | Medium | TE-5 |

## Carried-Forward Deferred Items (from prior cycles)

- F3 (MEDIUM): Candidate PII encryption at rest — schema migration needed
- F5 (MEDIUM): JWT callback DB query optimization — auth caching design required (same as AGG-14)
- F6 (LOW): Production deployment lag — operator action
- F8 (LOW): API route rate limiting — gradual hardening
- F10 (LOW): File validation test coverage — ongoing
- C6-7 (LOW): Compiler stdin newline appending inconsistency
- C6-8 (LOW): Misleading public route group for auth submission detail
- C6-9 (LOW): CSRF origin rejection impact on non-browser clients
- C6-10 (LOW): Privacy page hardcoded retention periods
- AGG-7/8/9 (LOW from prior): Missing unit tests for resetFailedRedeemAttempt, submission visibility guard, sidecar failover
- 24 pre-existing test failures — investigation needed

## Summary

- **Total new findings this cycle**: 27
- **High signal (cross-agent agreement)**: 5
- **Actionable this cycle** (MEDIUM, actionable without major refactoring): AGG-1, AGG-3, AGG-4, AGG-6, AGG-8, AGG-9, AGG-10
- **Deferred to future cycles** (requires schema migration, major refactoring, or design work): AGG-5, AGG-7, AGG-14, AGG-21
