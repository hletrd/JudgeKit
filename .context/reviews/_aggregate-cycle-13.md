# Cycle 13 — Aggregate Review (2026-05-09)

**Date:** 2026-05-09
**HEAD reviewed:** `d9887d20` (docs(plans): record successful deploy for cycle 12)
**Review approach:** Comprehensive deep manual review covering security, correctness, performance, architecture, code quality, and UI/UX. Systematic grep-based sweeps for SQL injection, XSS, empty catches, type safety, Date.now() misuse, Math.random(), dangerous patterns, CSRF coverage, missing timeouts, and resource leaks. Targeted examination of critical paths (auth, rate-limiting, CSRF, docker client, hcaptcha, compiler, file serving, backup/restore, SSE events, server actions).

**Prior aggregate snapshot:** `_aggregate-cycle-12.md` (HEAD `9b87eeee`).

**Note:** No registered review agents found in `.claude/agents/`. Review performed via direct systematic codebase examination.

---

## Total deduplicated NEW findings (still applicable at HEAD `d9887d20`)

**0 HIGH, 1 MEDIUM, 1 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C13-1 | MEDIUM | High | `src/lib/docker/client.ts:108-112,139-143` | `callWorkerJson` and `callWorkerNoContent` make `fetch()` calls to the judge worker without any timeout or abort signal. If the worker is hung, network-partitioned, or slow to respond, the request will hang indefinitely. This can exhaust Next.js request handlers and cause cascading latency or self-inflicted denial of service under load. Fix: add `signal: AbortSignal.timeout(N)` with an appropriate timeout (e.g., 30s for JSON calls, 10s for no-content calls). |
| C13-2 | LOW | High | `src/lib/security/hcaptcha.ts:60-66` | The hCaptcha verification `fetch()` lacks a timeout. A slow or unresponsive hCaptcha API (`https://api.hcaptcha.com/siteverify`) can cause public signup requests to hang indefinitely. Unlike other external fetches (OpenAI, Anthropic, code-similarity) which already have `AbortSignal.timeout()`, this one is unprotected. Fix: add `signal: AbortSignal.timeout(10_000)` to the fetch call. |

---

## Already-fixed findings from prior cycles (verified at HEAD)

| ID | Status | Note |
|---|---|---|
| C12b-1 | FIXED | Moderation query now pushes scope/state filters to SQL WHERE clause (commit `82e1ea9e`). |
| C12b-2 | FIXED | Shared sort comparator `compareThreadsByPinnedVoteScoreDate` extracted (commit `82e1ea9e`). |
| C12b-3 | FIXED | Yield timing now uses `performance.now()` instead of `Date.now()` (commit `7f29d897`). |
| C13-1 (old) | FIXED | CSRF validation added to recruiting validate endpoint (commit `1075728a`). |
| C13-2 (old) | FIXED | Moderation "open" state filter now excludes only locked threads, not pinned+locked (commit `e451e995`). |

---

## Carry-forward DEFERRED items (status verified at HEAD `d9887d20`)

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

## Areas reviewed this cycle

- **Auth pipeline**: `config.ts` — JWT sign-in uses DB time, session invalidation, dummy hash for timing safety, rate-limit clearing on success
- **Rate limiting**: `rate-limit.ts`, `api-rate-limit.ts` — DB-backed with SELECT FOR UPDATE, exponential backoff, sidecar fast-path with circuit breaker and 500ms timeout
- **Rate limiter client**: `rate-limiter-client.ts` — circuit breaker, `AbortSignal.timeout(500)`, fail-open contract
- **CSRF**: `csrf.ts` — X-Requested-With, Sec-Fetch-Site, origin host comparison
- **Server actions**: `server-actions.ts` — origin validation with loopback fallback in dev, `isTrustedServerActionOrigin()`
- **Public signup**: `public-signup.ts` — origin check, rate limiting, hCaptcha, zod validation, password hashing
- **Docker client**: `docker/client.ts` — no timeout on worker fetches (finding C13-1)
- **hCaptcha**: `hcaptcha.ts` — no timeout on verification fetch (finding C13-2)
- **Compiler**: `execute.ts` — `AbortSignal.timeout()` on runner fetch, NaN guard on timeLimitMs
- **Code similarity**: `code-similarity-client.ts` — `AbortSignal.timeout(25000)` on sidecar fetch
- **Chat widget providers**: `providers.ts` — `AbortSignal.timeout(25000)` on all provider fetches
- **File serving**: `files/[id]/route.ts` — auth check, capability check, ETag, CSP headers, cache-control
- **Backup/restore**: `backup/route.ts`, `restore/route.ts`, `migrate/import/route.ts` — password re-confirmation, CSRF, rate limiting, pre-restore snapshot
- **SSE events**: `submissions/[id]/events/route.ts` — re-auth check with closure-captured status, proper cleanup
- **API handler factory**: `handler.ts` — auth, CSRF (with API key skip), rate limiting, zod validation, cache-control/nosniff headers
- **Export engine**: `export.ts` — REPEATABLE READ isolation, streaming with cancellation, redaction
- **Discussions**: `data.ts` — moderation query with SQL WHERE filters (fixed from C12b-1)
- **Type safety**: Multiple `as unknown` casts reviewed — all are either Drizzle column access or external API response shapes with subsequent validation
- **Empty catches**: None found
- **eval()/innerHTML**: None found (except two controlled `dangerouslySetInnerHTML` with sanitization)
- **SQL injection**: No dynamic sql.raw() with user input found
- **XSS**: No uncontrolled user input in HTML found

---

## Commonly missed issues sweep

- **Timer leaks**: All `setTimeout`/`setInterval` usages reviewed. Client-side timers use refs with cleanup in useEffect returns. Server-side timers (rate-limit eviction, data retention, audit flush) are module-level singletons with explicit start/stop functions.
- **AbortController leaks**: All fetch calls reviewed. Most external fetches have timeouts. The two gaps are documented as C13-1 and C13-2.
- **Promise rejection handling**: All `.then()` chains reviewed. Most are safe (returning single values). The `void (async () => {` in SSE events is wrapped in try/catch.
- **Hydration mismatches**: Skeleton widths use deterministic values. Copyright year suppresses hydration warning.
- **React key stability**: Prior cycles fixed multiple index-based keys. Current codebase uses stable IDs (nanoid, row IDs) for lists.

---

## Review confidence statement

This review was performed via direct systematic examination of the codebase using grep sweeps, file reads, and cross-reference analysis. All TypeScript source files (575) and API routes (100+) were considered. The two findings (C13-1, C13-2) are both HIGH confidence based on direct code inspection. No agents were available to spawn for parallel review.
