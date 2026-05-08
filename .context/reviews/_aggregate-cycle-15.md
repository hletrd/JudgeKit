# Cycle 15 -- Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `ec8939ca` (docs(plan): update cycle 3 plan with gate results and completion status)
**Review approach:** Comprehensive deep review covering security, correctness, performance, architecture, code quality, and UI/UX. Full grep-based sweeps for SQL injection, XSS, empty catches, type safety, Date.now() misuse, Math.random(), dangerous patterns, CSRF coverage, missing event listener cleanup, module-level caches, Promise.all error handling, and i18n completeness. Focused on changes since cycle 14 HEAD (`4cd03c2b`).

**Prior aggregate snapshot:** `_aggregate-cycle-14.md` (HEAD `4cd03c2b`).

---

## Total deduplicated NEW findings (still applicable at HEAD `ec8939ca`)

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## NEW findings this cycle

None. The codebase is in a mature, well-hardened state after 14 prior cycles of remediation.

---

## Already-fixed findings from prior cycle 14 aggregate (verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C14-1 | FIXED | Trailing newline in `conditional-header.tsx` now present (commit `960fd185`). |

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved. Cycle-1 through cycle-14 fixes verified at HEAD.

---

## Areas reviewed this cycle

- **Auth pipeline**: `config.ts` -- JWT sign-in uses DB time, session invalidation, dummy hash, rate-limit clearing, recruiting token path. Verified proper error handling and field mapping.
- **Rate limiting**: All rate limiter modules -- DB-backed, atomic with SELECT FOR UPDATE, exponential backoff, sidecar fast-path.
- **CSRF**: Full coverage verified. All 9 mutating POST endpoints either use CSRF protection (browser-initiated) or are correctly exempted:
  - `auth/[...nextauth]` -- NextAuth handles its own CSRF
  - `internal/cleanup` -- CRON_SECRET Bearer token (server-to-server)
  - `judge/*` (5 endpoints) -- IP allowlist + API key auth (machine-to-machine)
- **IP extraction**: `ip.ts` -- X-Forwarded-For hop validation, IPv4/IPv6 validation
- **Timing safety**: `timing.ts` -- HMAC-based constant-time comparison
- **Encryption**: `encryption.ts` -- AES-256-GCM, plaintext fallback documented
- **Compiler**: `execute.ts` -- Docker sandboxing, seccomp, concurrency limiting, proper cleanup with `.catch()`
- **Discussions**: SQL filters, moderation query verified
- **Rate limiter client**: Circuit breaker pattern verified
- **Submissions visibility**: Role-based sanitization verified
- **Submissions route**: Atomic rate limit + insert with advisory locks, DB time
- **API handler**: Auth, CSRF, rate limiting, Zod validation, Cache-Control
- **Recruiting**: Access control, CSRF enforcement, brute-force lockout
- **Data retention**: Dynamic retention periods, in-process pruners
- **Capabilities cache**: In-memory role cache with TTL, proper expiration
- **Session security**: Token invalidation, clearAuthToken
- **System settings**: Date.now() usage for cache TTL (acceptable, in-memory cache)
- **Loading pages**: Both `(dashboard)/loading.tsx` and `(public)/loading.tsx` -- proper i18n, aria attributes, sr-only text
- **Conditional header**: `conditional-header.tsx` -- proper client-side rendering, admin path check, trailing newline present
- **Code timeline panel**: `code-timeline-panel.tsx` -- proper error handling, loading states, empty states, accessibility
- **Event listeners**: All useEffect + addEventListener patterns have proper cleanup (verified in shortcuts-help.tsx, lecture-toolbar.tsx)
- **Module-level caches**: All are either static data (Set of statuses, language maps) or properly TTL-bounded caches
- **Promise.all usage**: All properly handle errors; data-retention uses Promise.allSettled for isolation
- **setTimeout/setInterval**: All either have proper cleanup or are intentional background timers
- **i18n**: 538 translation hook usages, no hardcoded strings found needing translation
- **Trailing newlines**: All source files have proper trailing newlines (verified with find + od scan)
- **Type safety**: No `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` in source (only 2 legitimate comments in config files)
- **dangerouslySetInnerHTML**: Only in sanitizeHtml (DOMPurify) and safeJsonForScript (both safe)
- **Math.random()**: Only in UI skeleton jitter and polling jitter (acceptable)
- **Console logging**: Only `console.warn/error` in client-side code (acceptable)
- **Empty catches**: All intentional (best-effort operations, `.json().catch()` patterns)
- **eval()**: None found
- **Raw SQL**: Only `SELECT 1` in health check endpoint (parameterized)
- **parseInt/parseFloat**: All use radix 10 or are hex-parsing with radix 16

---

## Carry-forward DEFERRED items (status verified at HEAD `ec8939ca`)

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

This cycle performed a comprehensive sweep of the entire `src/` tree (~575 TS/TSX files) focusing on changes since cycle 14 and re-verification of all prior findings. Key techniques:
- Full grep sweeps for: `Date.now()`, `Math.random()`, `console.log/warn/debug`, `dangerouslySetInnerHTML`, `parseInt/parseFloat`, `any` type, CSRF coverage gaps, empty catches, `@ts-ignore`, `eslint-disable`, `eval()`, raw SQL, `.then()` patterns, `cookies()/headers()` usage, `setTimeout/setInterval`, `Promise.all/race`, event listener cleanup
- Full reads of: auth config, recently changed files (loading.tsx, code-timeline-panel.tsx, conditional-header.tsx)
- CSRF coverage audit: verified all 9 mutating POST endpoints either have CSRF protection or are correctly exempted
- Trailing newline scan: verified all 575 source files have proper trailing newlines
- Event listener cleanup: verified all useEffect + addEventListener patterns return cleanup functions
- Module-level cache audit: verified all module-level caches are either static or TTL-bounded

The codebase continues to be in a mature, well-hardened state after 14 prior cycles of remediation. This cycle found zero new issues.