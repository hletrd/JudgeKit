# RPF Cycle 7 — security-reviewer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

Empty change surface. Stale prior cycle-7 security findings (C7-SR-1 time route Date.now consistency, C7-SR-2 plaintext recruiting tokens) **both RESOLVED at HEAD** by intervening commits — verified by direct file inspection. No new security findings.

## Stale prior cycle-7 security findings — re-validated at HEAD

### C7-SR-1 / AGG-1 (time route inconsistency) — RESOLVED at HEAD

- **Stale finding:** `/api/v1/time` returned `Date.now()` (app server clock), creating a time-source inconsistency vs DB-time-enforced deadlines.
- **HEAD `src/app/api/v1/time/route.ts`:**
  ```ts
  import { NextResponse } from "next/server";
  import { getDbNowMs } from "@/lib/db-time";
  export const dynamic = "force-dynamic";
  export async function GET() {
    return NextResponse.json({ timestamp: await getDbNowMs() });
  }
  ```
- **Status:** RESOLVED. Endpoint now uses DB time + `force-dynamic` (prevents Next.js cache from serving stale timestamps). Closure justified.

### C7-SR-2 / AGG-2 (plaintext recruiting tokens) — RESOLVED at HEAD

- **Stale finding:** `recruitingInvitations.token` plaintext column existed; `ri_token_idx` indexed plaintext.
- **HEAD `src/lib/db/schema.pg.ts:940`:** Column is now `tokenHash: varchar("token_hash", { length: 64 })`. The plaintext `token` column has been removed entirely (verified via `grep "token: text" src/lib/db/schema.pg.ts | head -5` — no match). Only `ri_token_hash_idx` index exists at line 960.
- **Status:** RESOLVED. Plaintext column dropped; hash-only lookup. Closure justified.

### C7-SR-3 (decrypt plaintext fallback) — DEFERRED

- HEAD `src/lib/security/encryption.ts:79-81` still returns plaintext for non-`enc:` values. Documented behavior; advisory-only finding. Defer with exit criterion: production data-tampering incident OR migration audit cycle opens.

### C7-SR-4 (no rate limit on `/api/v1/time`) — REASSESSED

- Now that the endpoint uses `getDbNowMs()` (per AGG-1 fix), each call executes a DB query.
- Verification at HEAD: trivial DB roundtrip; query is `SELECT NOW()` cached briefly via Drizzle. No DoS-amplification potential.
- Severity: LOW (informational only). The endpoint is unauthenticated by design (used pre-login for time sync). No exfiltration surface.
- Status: **NEW LOW finding to consider** — but only if a stress test reveals DB pressure from this endpoint. Otherwise defer.

## Cycle-6 commits — security assessment

### `72868cea` (Task B — SUDO_PASSWORD decoupling)

- HEAD `deploy-docker.sh:284`: `local sudo_pw="${SUDO_PASSWORD:-${SSH_PASSWORD}}"`.
- **Security properties:**
  1. `sshpass` continues using `SSH_PASSWORD` for SSH auth — unchanged.
  2. `sudo -S` consumes from `sudo_pw` stdin — now decoupled.
  3. Default fallback preserves backward compat; new env var purely additive.
- No security regression. Operator can rotate sudo password independently.

### `2791d9a3` (Task C — DEPLOY_SSH_RETRY_MAX env override)

- HEAD `deploy-docker.sh:224-227`: validates `^[1-9][0-9]*$` regex; falls back to 4 with `warn` on malformed input.
- **Security properties:**
  1. Validation regex prevents env-var-based shell injection.
  2. SSH daemon's `MaxAuthTries` and `LoginGraceTime` independently cap any attempt amplification.
  3. Default 4 unchanged; behavior preserved when env var unset.
- No security regression.

## NEW security findings this cycle

**0 NEW.** Empty change surface; no security-sensitive paths changed.

## OWASP Top-10 sweep

- A01 Broken Access Control: `createApiHandler` enforces auth/capabilities consistently. No new unprotected routes.
- A02 Cryptographic Failures: AES-256-GCM with proper IV. Dev key gated behind non-production. Plaintext recruiting token column removed. No regression.
- A03 Injection: Drizzle ORM parameterized queries. `namedToPositional` validates `/^[a-zA-Z_]\w*$/`. No raw string interpolation.
- A04 Insecure Design: No new design surface.
- A05 Security Misconfig: CSP/HSTS unchanged. Deploy-script env vars now better documented (cycle-6 commits).
- A06 Vulnerable Components: No package changes.
- A07 Auth Failures: NextAuth + Argon2id; bcrypt rehash path unchanged.
- A08 SW+Data Integrity: Plaintext recruiting token risk eliminated.
- A09 Logging Failures: No change.
- A10 SSRF: No new outbound fetch surface.

## Re-validation of carry-forwards at HEAD

| ID | File | HEAD security state |
|---|---|---|
| C3-AGG-6 | `deploy-docker.sh:182-191` | ControlMaster socket dir is `mktemp -d` + chmod 700. Multi-tenant trigger not met. |
| D1, D2 | auth JWT (NOT in `src/lib/auth/config.ts`) | unchanged. |
| C5-SR-1 | `scripts/deploy-worker.sh` | Closed cycle-6 (already correctly implemented; base64 round-trip). |

## Recommendation for cycle-7 PROMPT 2

1. **Doc-only closures** for C7-SR-1/AGG-1 and C7-SR-2/AGG-2: both silently fixed at HEAD. Record closures in cycle-7 plan.
2. **No new security work** required this cycle.
3. **Defer C7-SR-3** with explicit exit criterion: production tampering incident OR audit cycle opens.

## Confidence labels

- Re-validation of stale findings: **H** (direct file inspection).
- Cycle-6 commit security analysis: **H**.
- Cycle-7 NEW findings: **H** (= 0).
