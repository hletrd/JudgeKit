# Cycle 11 — Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `6cb87686` (docs(reviews): add cycle 10 review, aggregate, and remediation plan)
**Review approach:** Comprehensive single-lane deep review covering security, correctness, performance, architecture, code quality, and UI/UX. Full codebase sweep of 574 source files with targeted deep-read of critical paths (auth, recruiting, compiler, data retention, API routes, proxy, CSRF, encryption, file storage, submissions visibility).

**Prior aggregate snapshot:** Preserved at `_aggregate-cycle-10.md`.

---

## Total deduplicated NEW findings (still applicable at HEAD `6cb87686`)

**0 HIGH, 1 MEDIUM, 2 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C11-1 | MEDIUM | Medium | `src/app/api/v1/admin/migrate/import/route.ts:167-169` | Deprecated JSON import path has unsafe `as unknown as JudgeKitExport` cast — Zod-validated `parsedBody.data.data` is cast through `unknown` to `JudgeKitExport`, bypassing the `validateExport()` structural checks that the multipart path applies. A malformed `data` field could pass Zod's `z.unknown().optional()` but fail `validateExport()`, and the code does call `validateExport()` after — however the intermediate `as unknown as JudgeKitExport` is misleading and could be a future footgun if someone removes the validateExport call. |
| C11-2 | LOW | High | `src/lib/realtime/realtime-coordination.ts:99,107,112` | LIKE patterns use a hardcoded prefix string (`realtime:sse:user:%`) without `escapeLikePattern()`. The prefix is a module-level constant (`SSE_KEY_PREFIX = "realtime:sse:user:"`), so it cannot contain `%` or `_` — but the pattern uses string concatenation (`prefix + "%"`) rather than parameterized LIKE with ESCAPE, diverging from the project's standard pattern (see `recruiting-invitations.ts`, `audit-logs/route.ts`). Inconsistent but not exploitable since the prefix is constant. |
| C11-3 | LOW | Medium | `src/lib/assignments/recruiting-invitations.ts:634-635` | Recruiting token user creation uses `nanoid()` for user ID (21 chars default) but `nanoid(10)` for username. The 10-char username with a limited alphabet provides ~62 bits of entropy, which is adequate for non-secret identifiers — but the discrepancy from the default nanoid length is not documented. If usernames were ever used for security-sensitive lookups (e.g., as a secondary auth factor), 10 chars may not be sufficient. |

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved. Cycle-1 through cycle-10 fixes verified at HEAD.

---

## Carry-forward DEFERRED items (status verified at HEAD `6cb87686`)

All deferred items from cycle-10 aggregate remain applicable:

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
- **Auth pipeline**: config.ts, proxy.ts, api/auth.ts, session-security, CSRF, rate limiting — all well-hardened after prior cycles
- **Recruiting flow**: recruiting-invitations.ts, recruiting-results.ts, recruit page — brute-force lockout, atomic counters, _sys namespace all working correctly
- **Compiler sandbox**: execute.ts — Docker isolation, command validation, seccomp, resource limits all solid
- **Data retention**: data-retention.ts, data-retention-maintenance.ts — legal hold, batched deletes, DB-time cutoffs
- **File storage**: storage.ts, validation.ts — path traversal protection, magic-byte verification, ZIP bomb defense
- **Encryption**: encryption.ts — AES-256-GCM with plaintext fallback documented and deferred
- **API routes**: All ~60+ API route files scanned for auth, CSRF, rate limiting, input validation patterns
- **SQL injection**: All sql.raw() and ILIKE/LIKE patterns reviewed — all using parameterized queries or escaped patterns
- **XSS**: dangerouslySetInnerHTML only in sanitizeHtml (DOMPurify) and safeJsonForScript (both safe)
- **Gates**: tsc --noEmit clean, eslint clean, 2287/2287 tests passing

The codebase is in a mature, well-hardened state after 10 prior cycles of remediation. New findings this cycle are limited to a misleading type cast in a deprecated code path and minor style inconsistencies.
