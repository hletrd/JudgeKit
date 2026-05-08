# Cycle 14 -- Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `4cd03c2b` (docs(plan): update cycle 2 plan with completion status and gate results)
**Review approach:** Comprehensive deep review covering security, correctness, performance, architecture, code quality, and UI/UX. Targeted examination of critical paths with grep-based sweeps for SQL injection, XSS, empty catches, type safety, Date.now() misuse, Math.random(), dangerous patterns, and CSRF coverage. Focused on changes since cycle 13 HEAD (`9ecb3caa`).

**Prior aggregate snapshot:** `_aggregate-cycle-13.md` (HEAD `9ecb3caa`).

---

## Total deduplicated NEW findings (still applicable at HEAD `4cd03c2b`)

**0 HIGH, 0 MEDIUM, 1 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C14-1 | LOW | High | `src/components/layout/conditional-header.tsx` | Missing trailing newline at end of file. POSIX convention and common linters expect a final newline. While most tools handle this gracefully, `git diff` will show `\ No newline at end of file` and some text processing tools may concatenate incorrectly. |

---

## Already-fixed findings from prior cycle 13 aggregate (verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C13-1 | FIXED | Discussion moderation "open" filter now uses `isNull(lockedAt)` only (commit `e451e995`). |
| C13-2 | FIXED | CSRF validation added to recruiting validate endpoint (commit `1075728a`). |

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved. Cycle-1 through cycle-13 fixes verified at HEAD.

---

## Areas reviewed this cycle

- **Auth pipeline**: `config.ts` -- JWT sign-in uses DB time, session invalidation, dummy hash, rate-limit clearing, recruiting token path
- **Rate limiting**: `rate-limit.ts`, `api-rate-limit.ts` -- DB-backed, atomic with SELECT FOR UPDATE, exponential backoff, sidecar fast-path
- **CSRF**: `csrf.ts` -- X-Requested-With, Sec-Fetch-Site, origin host comparison; now covers all POST endpoints including recruiting/validate
- **IP extraction**: `ip.ts` -- X-Forwarded-For hop validation, IPv4/IPv6 validation
- **Timing safety**: `timing.ts` -- HMAC-based constant-time comparison
- **Encryption**: `encryption.ts` -- AES-256-GCM, plaintext fallback documented
- **Compiler**: `execute.ts` -- Docker sandboxing, seccomp, concurrency limiting, stdin newline appending
- **Discussions**: `data.ts` -- moderation query with SQL filters, "open" state filter corrected
- **Rate limiter client**: `rate-limiter-client.ts` -- circuit breaker
- **Submissions visibility**: `visibility.ts` -- role-based sanitization
- **Submissions route**: `route.ts` -- atomic rate limit + insert with advisory locks, DB time
- **API handler**: `handler.ts` -- auth, CSRF, rate limiting, Zod validation, Cache-Control
- **Recruiting**: `access.ts`, `validate/route.ts` -- CSRF now enforced
- **Data retention**: `data-retention.ts`, `data-retention-maintenance.ts` -- DB time for cutoffs, legal hold
- **Capabilities cache**: `cache.ts` -- in-memory role cache with TTL
- **Session security**: `session-security.ts` -- token invalidation, clearAuthToken
- **System settings**: `system-settings-config.ts` -- Date.now() usage for cache TTL (acceptable, in-memory cache)
- **Conditional header**: `conditional-header.tsx` -- new component, admin path check, client-side rendering
- **Contest pages**: i18n migration from hardcoded strings to translation keys
- **SQL injection**: All raw queries use parameterized `@param` patterns
- **XSS**: `dangerouslySetInnerHTML` only in `sanitizeHtml` (DOMPurify) and `safeJsonForScript` (both safe)
- **Math.random()**: Only in UI skeleton jitter and polling jitter (acceptable)
- **Console logging**: Only `console.warn/error` in client-side code (acceptable)
- **Empty catches**: All intentional (best-effort operations, `.json().catch()` patterns)
- **CSRF coverage**: All POST endpoints now have CSRF protection (including recruiting/validate as of cycle 13)
- **Browser APIs**: All `window`/`document` usage is in "use client" components (correct)
- **Environment variables**: All env var usage is appropriate and well-documented

---

## Carry-forward DEFERRED items (status verified at HEAD `4cd03c2b`)

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

This cycle performed a comprehensive sweep of the entire `src/` tree (~575 TS/TSX files) focusing on changes since cycle 13 and re-verification of all prior findings. Key techniques:
- Grep sweeps for: `Date.now()`, `Math.random()`, `console.log/warn/debug`, `dangerouslySetInnerHTML`, `parseInt/parseFloat`, `any` type, CSRF coverage gaps, empty catches, `@ts-ignore`, `eslint-disable`, `eval()`, raw SQL
- Full reads of: auth config, rate limiting (both modules), CSRF, IP extraction, timing safety, compiler execute, conditional-header, i18n translations
- Cross-file interaction analysis: verified all POST endpoints have CSRF protection, all browser API usage is in client components
- Verified all prior cycle 13 findings are resolved at HEAD
- Verified i18n keys for recent translation changes are complete in both en.json and ko.json

The codebase continues to be in a mature, well-hardened state after 13 prior cycles of remediation. The only new finding this cycle is a minor missing trailing newline in the new `conditional-header.tsx` component.