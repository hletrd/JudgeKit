# Cycle 15 — Security Reviewer Perspective

**Date:** 2026-05-11
**HEAD reviewed:** `af634e63`
**Reviewer:** security-reviewer (single-agent comprehensive review)
**Prior aggregate:** `_aggregate-cycle-14.md`

---

## Methodology

- Re-verified all CSRF-covered POST endpoints (9 mutating endpoints).
- Re-verified auth pipeline: JWT sign-in with DB time, session invalidation, dummy hash,
  rate-limit clearing, recruiting token path.
- Re-verified rate limiting: DB-backed atomic with SELECT FOR UPDATE, exponential backoff.
- Re-verified IP extraction: X-Forwarded-For hop validation, IPv4/IPv6 validation.
- Re-verified timing safety: HMAC-based constant-time comparison.
- Re-verified encryption: AES-256-GCM with plaintext fallback documented.
- Re-verified compiler sandboxing: Docker with seccomp, concurrency limiting, proper cleanup.
- Re-verified file upload: magic-byte verification, ZIP bomb protection, MIME validation.
- Re-verified backup/restore: integrity manifest with SHA-256, path traversal prevention.
- Grep sweeps for: `dangerouslySetInnerHTML`, `eval()`, raw SQL, `Math.random()` in security
  contexts, missing input validation, hardcoded secrets, weak crypto.

---

## Findings

**0 new findings.**

### Areas reviewed with no issues found

1. **Auth pipeline** — JWT uses DB time for `iat`/`exp`. Fallback to `Math.trunc(Date.now()/1000)`
   is documented and only fires when DB is unreachable. Session invalidation and token
   clearing are properly implemented. No new issues.

2. **CSRF coverage** — All 9 mutating POST endpoints verified:
   - `auth/[...nextauth]` — NextAuth handles its own CSRF.
   - `internal/cleanup` — CRON_SECRET Bearer token (server-to-server).
   - `judge/*` (5 endpoints) — IP allowlist + API key auth (machine-to-machine).
   - Browser-initiated admin endpoints — CSRF protected via `csrfForbidden()`.
   No gaps identified.

3. **File upload (`src/app/api/v1/files/route.ts`)** — Magic-byte verification prevents
   disguised executables. ZIP decompressed size is validated. Image processing uses sharp
   with dimension limits. Stored names are nanoid-generated (unguessable). No new issues.

4. **Backup/restore (`src/lib/db/export-with-files.ts`, `src/app/api/v1/admin/restore/route.ts`)** —
   Integrity manifest uses SHA-256 checksums. Path traversal is prevented via `path.normalize()`
   and segment checks (`includes("/")`, `includes("\\")`, `startsWith("..")`). Legacy JSON
   path no longer consults `file.type` (fixed in prior cycle). No new issues.

5. **Compiler sandboxing (`src/lib/compiler/execute.ts`)** — Docker containers run with
   seccomp profiles, CPU/memory limits, and timeout enforcement. Child process cleanup uses
   `.catch()` for best-effort termination. No new issues.

6. **Rate limiting (`src/lib/security/rate-limit.ts`)** — In-memory cache with TTL eviction.
   DB-backed rate limiter uses `SELECT FOR UPDATE` for atomicity. Circuit breaker pattern
   in client. No new issues.

---

## Conclusion

No new security issues found in cycle 15. All prior security hardening remains intact.
