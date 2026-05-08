# RPF New Cycle 1 -- Security Review (2026-05-04)

**Reviewer:** security-reviewer
**HEAD reviewed:** `d617f2d7` (main)
**Scope:** OWASP top-10, secrets handling, auth/authz, input validation, CSRF, XSS, injection. Full codebase scan.
**Prior aggregate:** `_aggregate.md` (cycle 5 RPF, 0 new findings at HEAD `f65d0559`).

---

## Changes since prior reviewed HEAD

Zero source or test changes. Documentation-only commits.

---

## Findings

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## Security scan results

### Authentication & Authorization
- **Auth pipeline** (`config.ts`): JWT sign-in uses DB time via `getDbNowMs()`. Dummy hash for timing-safe comparison on non-existent users. Rate limiting with exponential backoff. Session invalidation via `tokenInvalidatedAt`. Proper error handling throughout.
- **Password policy**: Minimum 8 chars only, per AGENTS.md mandate. No complexity requirements.
- **Token comparison** (`timing.ts`): HMAC-based constant-time comparison using ephemeral key. No length side-channel.
- **Recruiting tokens**: Single-factor auth path does NOT clear IP rate limit on success (prevents token brute-force).

### CSRF Protection
- Full coverage verified. All 9 mutating POST endpoint categories either use CSRF protection or are correctly exempted:
  - `auth/[...nextauth]` -- NextAuth handles its own CSRF
  - `internal/cleanup` -- CRON_SECRET Bearer token (server-to-server)
  - `judge/*` (5 endpoints) -- IP allowlist + API key auth (machine-to-machine)
- `createApiHandler` defaults CSRF to `true` for mutation methods. API key auth skips CSRF (no cookies).
- Origin validation, Sec-Fetch-Site check, X-Requested-With header requirement all in place.

### Encryption
- `encryption.ts`: AES-256-GCM with 96-bit IV and 128-bit auth tag. Key from `NODE_ENCRYPTION_KEY` env var. Plaintext fallback documented as known tradeoff (C7-AGG-7, deferred with exit criteria).

### IP Extraction
- `ip.ts`: X-Forwarded-For hop validation with configurable `TRUSTED_PROXY_HOPS`. IPv4/IPv6 validation. X-Real-IP only used as fallback when XFF absent.

### Rate Limiting
- All rate limiting uses DB server time (`getDbNowMs()`). Atomic check+increment with `SELECT FOR UPDATE`. Exponential backoff for login limits. Sidecar fast-path for API limits.

### Docker Sandboxing
- `execute.ts`: `--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534:65534`, seccomp profile, PID limits, memory limits. Shell command validation with denylist.
- Docker image validation (`isAllowedJudgeDockerImage`) prevents injection of non-judge images.
- Dockerfile path validation prevents building non-judge images via admin API.

### CSP & Security Headers
- `proxy.ts`: Strict CSP with nonce-based script-src. `unsafe-inline` only for styles (documented tradeoff). HSTS in production with HTTPS. X-Content-Type-Options, Referrer-Policy, Frame-Ancestors all set.

### Input Validation
- All API routes use Zod schemas for body validation. `createApiHandler` enforces schema validation.
- No `eval()`, no `new Function()`, no `innerHTML` in source.

### Secrets & Credentials
- `.env.production` chmod 0600 in deploy script. No secrets in source code. Encryption key validated at startup.
- API keys stored with encryption. Chat widget decrypts only selected provider key (least privilege).

## Cross-agent agreement

Consistent with all prior RPF cycle reviews: zero new findings.
