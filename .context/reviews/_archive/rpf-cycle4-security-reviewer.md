# Security Review — RPF Cycle 4 (Loop 4/100)

**Date:** 2026-04-24
**Reviewer:** security-reviewer
**Base commit:** a717b371

## Inventory of Reviewed Files

- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/rate-limiter-client.ts` (full)
- `src/lib/security/csrf.ts` (full)
- `src/lib/security/password.ts` (full)
- `src/lib/security/env.ts` (full)
- `src/lib/security/derive-key.ts` (full)
- `src/lib/security/ip.ts` (referenced)
- `src/lib/auth/index.ts` (full)
- `src/lib/auth/secure-cookie.ts` (referenced)
- `src/lib/auth/config.ts` (referenced)
- `src/proxy.ts` (full — auth cache, CSRF, CSP)
- `src/app/api/v1/judge/claim/route.ts` (full — worker auth, IP allowlist)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full — SSE auth re-check)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full — anti-cheat event logging)
- `src/lib/plugins/chat-widget/tools.ts` (full — tool access control)
- `src/lib/files/storage.ts` (full — path traversal protection)
- `src/lib/db/queries.ts` (full — named parameter conversion)
- `src/lib/data-retention.ts` (full — legal hold)
- `src/lib/anti-cheat/review-model.ts` (full)

## Findings

### SEC-1: Judge claim route clock-skew — NOW FIXED [RESOLVED]

**File:** `src/app/api/v1/judge/claim/route.ts:126`

**Status:** The `Date.now()` clock-skew finding from cycle 48 has been fixed. Line 126 now correctly uses `getDbNowUncached()` for claim creation time, ensuring DB-consistent timestamps for stale claim detection.

---

### SEC-2: Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache [LOW/LOW — carry-over]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92`

**Description:** Known carry-over. The in-process LRU cache for heartbeat deduplication uses `Date.now()` which is fine for in-memory operations (no cross-process clock skew concern). The shared coordination path correctly uses `getDbNowUncached()` via `shouldRecordSharedHeartbeat`.

**Status:** Carry-over.

---

### SEC-3: Anti-cheat copies user text content [LOW/LOW — carry-over]

**File:** `src/components/exam/anti-cheat-monitor.tsx:206-209`

**Description:** Known carry-over. The anti-cheat monitor captures up to 80 characters of `textContent` on paste/copy events. A privacy notice is displayed to users.

**Status:** Carry-over.

---

### SEC-4: Docker build error leaks paths [LOW/LOW — carry-over]

**Description:** Known carry-over. Docker client error messages may contain internal filesystem paths. Only visible to admin-level users.

**Status:** Carry-over.

---

### Security Observations (Positive)

1. **CSRF protection** (`src/lib/security/csrf.ts`) is well-implemented: `X-Requested-With` header check, `Sec-Fetch-Site` validation, Origin verification against configured host, and proper fallback handling.

2. **Path traversal protection** in `src/lib/files/storage.ts` correctly rejects filenames containing `/`, `\`, or `..` before constructing paths.

3. **SQL injection protection** in `src/lib/db/queries.ts` uses named-to-positional parameter conversion with strict validation (`/^[a-zA-Z_]\w*$/`) and missing parameter checks.

4. **CSP headers** in `src/proxy.ts` are comprehensive: nonce-based script-src, frame-ancestors 'none', object-src 'none', proper HSTS.

5. **Password validation** (`src/lib/security/password.ts`) checks length, common passwords, username similarity, and email local part matching.

6. **Auth cache** in `src/proxy.ts` uses a FIFO cache with TTL and max-size, and importantly does NOT cache negative results (user not found / inactive), preventing cache-based auth bypass.

7. **Worker authentication** in judge claim route uses constant-time comparison (`safeTokenCompare`) and validates both shared token and per-worker secret.

## New Findings

**No new security findings this cycle.** The codebase has not changed since cycle 3. All prior security findings remain valid and tracked as deferred items. The judge claim route clock-skew finding (SEC-1 equivalent) is now confirmed fixed.
