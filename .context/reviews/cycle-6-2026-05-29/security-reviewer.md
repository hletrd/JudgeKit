# Cycle 6 — Security review (OWASP, auth/authz, secrets)

**HEAD:** d1217b5a · Baseline green.

## Findings

### N6-C6 (security angle) — degraded-health alarm fatigue degrades incident response — **LOW (security relevance)**
A permanently-`degraded` admin-health page (caused by un-reaped crashed workers, see debugger.md) erodes the operational signal: operators learn to ignore "degraded", so a *real* degradation (audit-write failures, `pending>0 && online==0`) is more likely to be missed. The reaper restores `degraded` to meaning "something is actually wrong right now". Availability/observability hygiene, not a direct exploit.

### Auth boundary — UNCHANGED, no regressions
- `register` requires shared `JUDGE_AUTH_TOKEN` + IP allowlist (`register/route.ts:26-32`).
- `heartbeat`/`deregister`/`poll`/`claim` require per-worker secret hash compare via `isJudgeAuthorizedForWorker` + IP allowlist; plaintext fallback is gone (`auth.ts:79-96`). `safeTokenCompare` is used throughout (timing-safe). No new secret-handling issues. The `stale -> offline` reaper introduces NO new auth surface (it runs inside the already-authenticated heartbeat handler, after the caller's own secret is validated). It mutates OTHER workers' rows by time predicate only — same trust posture as the existing status-flip/active_tasks-reset sweeps.

### F3 (re-assess, carried deferred) — worker result trust — **LOW, MEDIUM**
Score-inflation by a compromised trusted worker remains gated by the per-worker-secret + claimToken + IP-allowlist boundary. Trust model unchanged this cycle. **Remains correctly deferred.**

### register dead field (DOC-C5-2, carried) — `STALE_CLAIM_TIMEOUT_MS = 300_000` hardcoded in `register/route.ts:22,75` — **LOW, HIGH (non-impacting)**
Verified the Rust worker (`api.rs`, `types.rs`) only deserializes `staleClaimTimeoutMs` and never reads it for logic. Dead field; authoritative reclaim is server-side via `getConfiguredSettings()`. **Remains correctly deferred.**

## Final sweep
No secrets in logs (register logs only workerId/hostname/concurrency/version). IP allowlist checked first on every judge route. No SQLi (claim/scoring use parameterized `@param` placeholders; column-name interpolation is contract-gated + validated `scoring.ts:101-112`). No new findings.
