# Verifier Review — Cycle 1 (2026-05-03)

**Reviewer:** verifier
**Scope:** Evidence-based correctness check against stated behavior
**HEAD:** 689cf61d

---

## Findings

### C1-VER-1: Docker build path validation mismatch between local and remote code paths
**File:** `src/lib/docker/client.ts:159` vs `:349`
**Severity:** MEDIUM | **Confidence:** HIGH

Verified by reading both code paths. The local `buildDockerImageLocal()` at line 159 checks `dockerfilePath.startsWith("docker/Dockerfile.judge-")`, while the remote `buildDockerImage()` at line 349 checks `dockerfilePath.startsWith("docker/Dockerfile.")`. The local path is more restrictive. This means the same API call could produce different results depending on whether the worker is configured — a behavioral inconsistency.

**Evidence:** Direct code inspection of both functions confirms the mismatch.

### C1-VER-2: `RUNNER_AUTH_TOKEN` fallback to `JUDGE_AUTH_TOKEN` in docker client
**File:** `src/lib/docker/client.ts:12`
**Severity:** MEDIUM | **Confidence:** HIGH

Verified by code inspection. The fallback chain `RUNNER_AUTH_TOKEN || JUDGE_AUTH_TOKEN || ""` exists at line 12. Meanwhile, `src/lib/compiler/execute.ts:57` has the same fallback but adds production guards (lines 58-66). The docker client has no such production guard — it silently falls back to an empty string if neither token is set, meaning docker API calls would be unauthenticated.

**Evidence:** Direct code comparison between `docker/client.ts:12` and `compiler/execute.ts:57-66`.

### C1-VER-3: Encryption module plaintext fallback is production-safe
**File:** `src/lib/security/encryption.ts:99-117`
**Severity:** N/A (verification — no issue found) | **Confidence:** HIGH

Verified that in production (`NODE_ENV=production`), `decrypt()` throws an error on non-`enc:`-prefixed values unless `allowPlaintextFallback: true` is explicitly passed. The fallback defaults to `false` in production and `true` in development. This is correctly implemented.

**Evidence:** `options?.allowPlaintextFallback ?? (process.env.NODE_ENV !== "production")` at line 99-100.

### C1-VER-4: Recruiting token atomicity is correct
**File:** `src/lib/assignments/recruiting-invitations.ts:495-510`
**Severity:** N/A (verification — no issue found) | **Confidence:** HIGH

Verified that `redeemRecruitingToken` uses an atomic SQL UPDATE with a WHERE clause that checks `status = 'pending'` AND `expires_at > NOW()` inside a transaction. This prevents double-redemption and clock-skew issues. The fallback error message on failed atomic update is `alreadyRedeemed` (not `tokenExpired`), which is the correct choice because the app server and DB server clocks may not be synchronized.

**Evidence:** Transaction and atomic claim logic at lines 317-510.

---

## Verified Carry-Forward Items from Prior Reviews

The following items from `_aggregate-cycle-10.md` were verified as still applicable at HEAD `689cf61d`:
- AGG-2 (Date.now caching in rate limiter): still present, severity unchanged
- C1-AGG-3 (client console.error sites): 24 sites confirmed still present
- C3-AGG-5 (deploy-docker.sh size): still applicable
- ARCH-CARRY-1 (raw API handlers): 24 confirmed (down from 20 of 104 — the total grew)
