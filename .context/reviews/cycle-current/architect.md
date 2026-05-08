# Architecture Review — Cycle 1/100

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewer:** architect (consolidated single-pass)

---

## Findings

### A1 — MEDIUM — Dual rate-limit implementations share table but diverge in behavior

- **Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/api-rate-limit.ts`
- **Description:** Both modules write to the same `rateLimits` PostgreSQL table but implement different semantics: login rate limiting uses exponential backoff with `consecutiveBlocks`, while API rate limiting uses fixed windows with `blockedUntil = now + windowMs`. The `checkServerActionRateLimit` function in `api-rate-limit.ts` adds yet another variant. The comments acknowledge this ("C7-AGG-9: rate-limit consolidation cycle") but no consolidation has occurred.
- **Confidence:** HIGH
- **Suggested fix:** Unify the three rate-limit paths into a single parameterized function that handles all use cases (login backoff, API fixed window, server action fixed window).

### A2 — MEDIUM — Recruiting access uses dual cache with complex fallback chain

- **File:** `src/lib/recruiting/access.ts:34-108`
- **Description:** The recruiting access context uses both React `cache()` and AsyncLocalStorage with a manual fallback chain. This is necessary because API routes don't participate in React rendering, but the complexity is high. The `loadRecruitingAccessContext` function has side effects (modifying AsyncLocalStorage) which is unusual for a "load" function.
- **Confidence:** MEDIUM
- **Suggested fix:** Consider a unified request-scoped storage that works for both RSC and API routes. Next.js AsyncLocalStorage context is now available in both environments.

### A3 — LOW — Compiler execution has three execution paths with overlapping concerns

- **File:** `src/lib/compiler/execute.ts`
- **Description:** The `executeCompilerRun` function has three paths: (1) Rust runner sidecar, (2) local Docker fallback, (3) error return. The logic for choosing between them is spread across module-level env parsing, boolean flags (`SHOULD_ALLOW_LOCAL_FALLBACK`, `ENABLE_LOCAL_FALLBACK`, `LEGACY_DISABLE_LOCAL_FALLBACK`), and runtime checks. This is hard to reason about.
- **Confidence:** MEDIUM
- **Suggested fix:** Extract a strategy pattern or factory that encapsulates the execution mode selection.

### A4 — LOW — Admin nav data is centralized but still duplicated in other places

- **File:** `src/lib/navigation/admin-nav.ts`
- **Description:** The `ADMIN_NAV_GROUPS` constant is a good single-source-of-truth for the admin landing page. However, the header dropdown navigation and sidebar navigation (now removed) previously duplicated this data. After the IA cleanup cycles, verify that no other nav source duplicates admin links.
- **Confidence:** HIGH
- **Suggested fix:** Already addressed in prior cycles. Verify completeness.

### A5 — LOW — `proxy.ts` mixes multiple responsibilities

- **File:** `src/proxy.ts`
- **Description:** The proxy middleware handles: auth refresh, UA mismatch audit, route protection, locale resolution, CSP generation, HSTS, cache control, and cookie management. At 374 lines, this is a large module with many responsibilities. The Next.js 16 proxyClient feature is experimental.
- **Confidence:** LOW
- **Suggested fix:** Consider splitting into focused middlewares: auth-middleware, locale-middleware, security-headers-middleware. The experimental `proxyClientMaxBodySize` in next.config.ts suggests this is still evolving.

---

## Architecture Verdict

The architecture is sound with clear layer boundaries (DB, API handlers, auth, judge). The main concern is the rate-limit divergence (A1) which increases maintenance burden and risk of inconsistent behavior.
