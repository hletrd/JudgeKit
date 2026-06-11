# Cycle 4 — Security Reviewer Findings

> Generated: 2026-05-14
> Reviewer: single-pass comprehensive review (no registered subagents available)
> Scope: Auth surfaces, API routes, deploy scripts, sandbox configs
> Base commit: bc7e5998

---

## Summary

No new CRITICAL, HIGH, or MEDIUM findings. All prior security findings from the cycle-4 inner loop have been verified as fixed.

## Verified Fixes

| ID | Severity | File | Finding | Status |
|----|----------|------|---------|--------|
| F1 | MEDIUM | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | CSV formula injection via inconsistent `escapeCsvCell` | FIXED — uses shared `escapeCsvField` with tab prefix |
| F2 | MEDIUM | `scripts/deploy-worker.sh` | Overwrites remote `.env` without exclusion | FIXED — `ensure_env_var` preserves remote-only keys via Python merge |
| F4 | LOW | `src/app/api/v1/tags/route.ts` | Manual auth without `createApiHandler` | FIXED — now uses `createApiHandler` with rate limit |
| F5 | LOW | `src/proxy.ts` | Dead `/workspace/:path*` matcher entry | FIXED — removed from matcher |
| L4 | LOW | `src/app/api/v1/auth/verify-email/route.ts` | Raw internal errors forwarded to client | FIXED — returns sanitized `verifyFailed` |

## Security Posture Assessment

### Authentication (`src/lib/auth/config.ts`)
- Timing-safe dummy Argon2id hash prevents user enumeration via response-time analysis
- Recruiting token path does NOT clear rate limits on success (correct — prevents token brute-force escalation)
- JWT refresh callback queries fresh user state and invalidates for deactivated accounts
- `tokenInvalidatedAt` comparison uses DB server time (`getDbNowMs()`) avoiding clock skew

### Rate Limiting (`src/lib/security/api-rate-limit.ts`)
- Sidecar fast-path correctly fails-open (returns null on unreachable sidecar, falls back to DB)
- All timestamp comparisons use DB server time
- `>=` comparison for `blockedUntil` verified correct in both `atomicConsumeRateLimit` and `checkServerActionRateLimit`

### Compiler Sandbox (`src/lib/compiler/execute.ts`)
- Docker image whitelist enforced via `isAllowedJudgeDockerImage`
- Shell command denylist: backtick, command substitution, pipes, I/O redirects, eval, source
- Command prefix whitelist for defense-in-depth
- Container flags: `--network=none`, `--cap-drop=ALL`, `--read-only`, `--security-opt=no-new-privileges`, `--user 65534:65534`
- Seccomp profile applied when available
- Workspace cleanup in `finally` block

### File Upload (`src/lib/files/validation.ts`)
- Magic-byte verification for PDF and ZIP
- Null-byte sampling across start/middle/end for text type validation
- ZIP bomb protection: per-entry size cap (50MB), total decompressed cap, entry count cap (10,000)

## Deferred Security Items (Stable, No New Instances)

- **DEFER-52**: Docker client string accumulation in `src/lib/docker/client.ts` — tracked in existing plans.

## Conclusion

Security posture remains strong. No new vulnerabilities or weaknesses identified this cycle.
