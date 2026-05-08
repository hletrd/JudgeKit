# Cycle 13 — Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `9ecb3caa` (style(discussions): remove unused or import from drizzle-orm)
**Review approach:** Comprehensive deep review covering security, correctness, performance, architecture, code quality, and UI/UX. Targeted examination of critical paths (auth, rate-limiting, CSRF, encryption, discussions, code similarity, compiler, submissions visibility, recruiting, data retention, capabilities cache) with grep-based sweeps for SQL injection, XSS, empty catches, type safety, Date.now() misuse, Math.random(), dangerous patterns, and CSRF coverage.

**Prior aggregate snapshot:** `_aggregate-cycle-12.md` (HEAD `9b87eeee`).

---

## Total deduplicated NEW findings (still applicable at HEAD `9ecb3caa`)

**0 HIGH, 0 MEDIUM, 2 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C13-1 | LOW | Medium | `src/lib/discussions/data.ts:276-287` | `listModerationDiscussionThreads` defines "open" state as `isNull(lockedAt) AND isNull(pinnedAt)`. A thread that is both pinned AND locked simultaneously would be excluded from all four state filters ("all" shows it, but "open", "locked", and "pinned" each exclude it). While uncommon, this is a semantic gap. Fix: change "open" to `isNull(lockedAt)` only (open = not locked, regardless of pin status), or document that pinned+locked is an invalid state. |
| C13-2 | LOW | High | `src/app/api/v1/recruiting/validate/route.ts` | This standalone POST handler lacks CSRF protection. All other POST endpoints use `createApiHandler` which enforces CSRF via `csrfForbidden()`. This route manually calls `consumeApiRateLimit` but never checks CSRF headers. Impact is low: it is a public, read-only validation endpoint that does not mutate state, but the inconsistency means a cross-origin form submission could trigger token validation from a victim's browser. |

---

## Already-fixed findings from prior cycle 12 aggregate (verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C12b-1 | FIXED | Moderation query now pushes scope/state filters to SQL WHERE clause (commit `82e1ea9e`). |
| C12b-2 | FIXED | Shared sort comparator `compareThreadsByPinnedVoteScoreDate` extracted (commit `82e1ea9e`). |
| C12b-3 | FIXED | Yield timing now uses `performance.now()` instead of `Date.now()` (commit `7f29d897`). |

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved. Cycle-1 through cycle-12 fixes verified at HEAD.

---

## Areas reviewed this cycle

- **Auth pipeline**: `config.ts` — JWT sign-in uses DB time, session invalidation, dummy hash, rate-limit clearing, recruiting token path
- **Rate limiting**: `rate-limit.ts`, `api-rate-limit.ts` — DB-backed, atomic with SELECT FOR UPDATE, exponential backoff, sidecar fast-path
- **Rate limiter client**: `rate-limiter-client.ts` — circuit breaker, `Date.now()` usage acceptable for local timing
- **CSRF**: `csrf.ts` — X-Requested-With, Sec-Fetch-Site, origin host comparison
- **Encryption**: `encryption.ts` — AES-256-GCM, plaintext fallback documented (C7-AGG-7)
- **Timing safety**: `timing.ts` — HMAC-based constant-time comparison
- **Discussions**: `data.ts` — moderation query with SQL filters, shared sort comparator
- **Code similarity**: `code-similarity.ts` — `performance.now()` for yield timing, n-gram normalization
- **Compiler**: `execute.ts` — Docker sandboxing, seccomp, concurrency limiting, shell command validation
- **Submissions visibility**: `visibility.ts` — role-based sanitization
- **Submissions route**: `route.ts` — atomic rate limit + insert with advisory locks, DB time
- **API handler**: `handler.ts` — auth, CSRF, rate limiting, Zod validation, Cache-Control
- **Recruiting**: `access.ts`, `validate/route.ts` — dual caching, SQL NOW() for expiry
- **Data retention**: `data-retention.ts`, `data-retention-maintenance.ts` — DB time for cutoffs, legal hold
- **Capabilities cache**: `cache.ts` — in-memory role cache with TTL
- **IP extraction**: `ip.ts` — X-Forwarded-For hop validation, IPv4/IPv6 validation
- **Session security**: `session-security.ts` — token invalidation, clearAuthToken
- **Admin health**: `admin-health.ts` — `Date.now()` for uptime/response time (acceptable)
- **Chat widget**: `chat/route.ts` — least-privilege decryption, tool iteration bound, streaming
- **SQL injection**: All raw queries use parameterized patterns
- **XSS**: `dangerouslySetInnerHTML` only in `sanitizeHtml` (DOMPurify) and `safeJsonForScript` (both safe)
- **Math.random()**: No usage in production code (uses `nanoid` and `crypto`)
- **parseInt/parseFloat**: No unsafe usage in API routes
- **Console logging**: Only `console.warn` in client-side code (acceptable)
- **Empty catches**: All intentional (best-effort operations, `.json().catch()` patterns)
- **CSRF coverage**: All admin POST routes have CSRF; judge routes use Bearer token auth; recruiting/validate is the only gap

---

## Carry-forward DEFERRED items (status verified at HEAD `9ecb3caa`)

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

This cycle performed a comprehensive sweep of the entire `src/` tree (~575 TS/TSX files). Key techniques:
- Grep sweeps for: `Date.now()`, `Math.random()`, `console.log/warn/debug`, `dangerouslySetInnerHTML`, `parseInt/parseFloat`, `any` type in API routes, CSRF coverage gaps, empty catches
- Full reads of: auth config, rate limiting (both modules), encryption, CSRF, timing safety, discussions data, code similarity, compiler execute, submissions visibility/route, API handler, recruiting access/validate, data retention, capabilities cache, IP extraction, session security, admin health, chat widget route
- Cross-file interaction analysis: verified that all POST endpoints have CSRF protection (or documented exceptions)
- Verified all prior cycle 12 findings are resolved at HEAD

The codebase is in a mature, well-hardened state after 12 prior cycles of remediation. New findings this cycle are limited to a minor semantic gap in discussion moderation state filtering (C13-1) and a CSRF inconsistency on the recruiting validate endpoint (C13-2).