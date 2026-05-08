# Cycle 12 — Aggregate Review (2026-05-03, continued)

**Date:** 2026-05-03
**HEAD reviewed:** `9b87eeee` (fix(ui): widen login and signup card from max-w-md to max-w-lg)
**Review approach:** Comprehensive deep review covering security, correctness, performance, architecture, code quality, and UI/UX. Targeted examination of critical paths (auth, rate-limiting, CSRF, encryption, discussions, code similarity, compiler, submissions visibility) with grep-based sweeps for SQL injection, XSS, empty catches, type safety, and time-source consistency.

**Prior aggregate snapshot:** Preserved at `_aggregate-cycle-12.md` (first version, HEAD `22cefcf7`).

---

## Total deduplicated NEW findings (still applicable at HEAD `9b87eeee`)

**0 HIGH, 1 MEDIUM, 2 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C12b-1 | MEDIUM | High | `src/lib/discussions/data.ts:275-299` | `listModerationDiscussionThreads` fetches ALL threads from DB (`findMany` with no `where` clause for `scope`, limit: 100) then filters in JS. The `scopeType` column is indexed (`dt_scope_idx`). The `scope` filter should be pushed to the SQL `WHERE` clause so the DB only returns matching rows, reducing I/O. The `state` filter (locked/pinned/open) depends on nullable timestamp columns, but could also use IS NOT NULL conditions. |
| C12b-2 | LOW | High | `src/lib/discussions/data.ts:87-93,111-117,131-138,169-175` | Four list functions (`listGeneralDiscussionThreads`, `listProblemDiscussionThreads`, `listProblemSolutionThreads`, `listProblemEditorials`) share identical sort logic (pinned first, then by voteScore desc, then by updatedAt desc) implemented as inline JS `.sort()`. Duplicated sort code; a change to sort priority would require updating 4+ places. Should be extracted to a shared comparator. |
| C12b-3 | LOW | Medium | `src/lib/assignments/code-similarity.ts:278,297,299` | `runSimilarityCheckTS` uses `Date.now()` for yield timing instead of `performance.now()`. While this is not a DB time comparison (it measures event-loop responsiveness, not temporal ordering), `Date.now()` can be affected by NTP clock adjustments, causing a sudden yield interval change. `performance.now()` is monotonic and preferred for duration measurement. |

---

## Already-fixed findings from prior cycle 12 aggregate (verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C12-1 | STILL OPEN | Moderation query still fetches all then filters in JS. Now tracked as C12b-1. |
| C12-2 | FIXED | Chat widget now decrypts only the selected provider's API key (commit `03623f0b`). |
| C12-3 | STILL OPEN | Duplicated sort logic. Now tracked as C12b-2. |
| C12-4 | FIXED | Locale regex now supports hyphenated variants via `[A-Za-z0-9_-]+` pattern (in current code). |
| C12-5 | STILL OPEN | Date.now() for yield timing. Now tracked as C12b-3. |

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved. Cycle-1 through cycle-11 fixes verified at HEAD.

---

## Carry-forward DEFERRED items (status verified at HEAD `9b87eeee`)

| ID | Severity | File+line | Status | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` (1088+ lines) | DEFERRED | Modular extraction scheduled; OR >1500 lines |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (24) | DEFERRED | Telemetry/observability cycle opens |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew (outside config.ts) | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | JWT DB query per request (outside config.ts) | DEFERRED | Auth-perf cycle |
| AGG-2 | MEDIUM | Rate-limit Date.now + overflow sort | DEFERRED | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw API handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | SSE coordination | DEFERRED | SSE perf cycle OR > 500 concurrent |
| PERF-3 | MEDIUM | Anti-cheat dashboard query | DEFERRED | p99 > 800ms OR > 50 concurrent contests |
| C7-AGG-6 | LOW | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary OR refactor |
| C7-AGG-7 | LOW | `encryption.ts` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | 3-module rate-limit duplication | DEFERRED-with-doc-mitigation | Rate-limit consolidation cycle |
| F3 | MEDIUM | Candidate PII encryption at rest | DEFERRED | Schema migration needed |
| F5 | MEDIUM | JWT callback DB query optimization | DEFERRED | Auth caching design required |
| F6 | LOW | Production deployment lag | DEFERRED | Operator action |
| F8 | LOW | API route rate limiting | DEFERRED | Gradual hardening |
| F10 | LOW | File validation test coverage | DEFERRED | Ongoing |

No HIGH findings deferred. No security/correctness/data-loss findings deferred without exit criteria.

---

## Review methodology notes

This cycle's review examined:
- **Rate limiting**: `rate-limit.ts`, `api-rate-limit.ts` — DB-backed, atomic with SELECT FOR UPDATE, exponential backoff on login, sidecar fast-path for API limits, all using DB server time
- **Auth pipeline**: `config.ts` — JWT sign-in uses DB time, session invalidation checks, dummy password hash for timing, rate-limit clearing on success (not for recruiting tokens)
- **CSRF**: `csrf.ts` — X-Requested-With header check, Sec-Fetch-Site validation, origin host comparison
- **Encryption**: `encryption.ts` — AES-256-GCM, plaintext fallback documented and deferred (C7-AGG-7)
- **Timing safety**: `timing.ts` — HMAC-based constant-time comparison, no length leak
- **Discussions**: `data.ts` — moderation query fetches all then filters in JS (C12b-1), duplicated sort logic (C12b-2)
- **Code similarity**: `code-similarity.ts` — Date.now() for yield timing (C12b-3), well-documented
- **Submissions visibility**: `visibility.ts` — role-based sanitization, hidden DB query warning, N+1 prevention guidance
- **Compiler**: `execute.ts` — container age check uses Date.now() (acceptable for wall-clock staleness, not DB comparison)
- **SQL injection**: All raw queries use parameterized patterns
- **XSS**: dangerouslySetInnerHTML only in sanitizeHtml (DOMPurify) and safeJsonForScript (both safe)
- **Empty catches**: 3 in submissions events route and groups assignments route — all intentional (best-effort operations)

The codebase is in a mature, well-hardened state after 11 prior cycles of remediation. New findings this cycle are limited to a DB query optimization gap in moderation listing (C12b-1) and minor code quality issues (duplicated sort logic, Date.now() for yield timing).