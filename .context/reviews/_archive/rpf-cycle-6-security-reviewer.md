# RPF Cycle 6 — security-reviewer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8`
**Diff vs cycle-5 base:** 0 lines.

## Methodology

Re-validated cycle-5 C5-SR-1 finding at HEAD. Re-checked auth/JWT carry-forwards, env-handling, secret-handling, file-permission policy, and deploy-script command injection vectors. Audited the stale prior cycle-6 SEC findings.

## Stale prior cycle-6 SEC findings audit

- Stale aggregate AGG-1 (security-reviewer SEC-1 cross-referenced `recruiting-invitations-panel.tsx` `handleCreate` swallowing errors) — RESOLVED. catch block at line 238-239 toasts the error.

## Carry-forward security items — status at HEAD

### C5-SR-1 — sed delimiter collision in `scripts/deploy-worker.sh` (LOW, DEFERRED)

- **Path:** `scripts/deploy-worker.sh`.
- **Verification at HEAD:** sed substitution still uses `|` delimiter for `APP_URL` interpolation. Exact lines 101-107.
- **Threat model:** the value substituted is `APP_URL` from the operator's local `.env.production`. Trust boundary: operator-controlled. A `|` literal in `APP_URL` would break the substitution; a `\n` or terminator-aware injection requires the operator to be hostile to themselves.
- **Severity:** LOW (operator-supplied trusted input).
- **Exit criterion (unchanged):** untrusted-source `APP_URL` OR an operator-reported sed-pattern collision.
- **Status:** DEFERRED. Eligible for cycle-6 draw-down (small, additive escape change).

### D1 — JWT clock-skew tolerance (MEDIUM, DEFERRED)

- `src/lib/auth/config.ts` (418 lines, must NOT be touched per repo rule "Preserve Production config.ts").
- Any clock-skew remediation has to live outside `src/lib/auth/config.ts` (e.g., upstream of `next-auth` callbacks, or in a wrapper).
- **Severity:** MEDIUM unchanged.
- **Status:** DEFERRED.

### D2 — JWT DB query per request (MEDIUM, DEFERRED)

- Same file constraint. Refactor cannot edit `src/lib/auth/config.ts`.
- **Status:** DEFERRED.

## Cycle-5 implementations — security-relevant verification at HEAD

| Item | Verification |
|---|---|
| `chmod 0600` on remote `.env.production` | Intact: `deploy-docker.sh:277, 283`. ✓ |
| `chmod 700` after `mktemp -d` clarification comment | Intact (cycle-4 commit `f5ac57ff`). ✓ |
| No JUDGE_AUTH_TOKEN logging | Confirmed via `grep -rn 'console.log.*JUDGE' src/`. ✓ |
| `lint:bash` syntax check exposes shell parse errors at PR time | `package.json:10`. ✓ |
| `DEPLOY_INSTANCE` log prefix doesn't leak secrets | Pure label, no env var interpolation beyond the label itself. ✓ |

## Spot-check audits

### Secrets-in-files

- `.env.production` is created via deploy script in `/tmp` and `chmod 0600`'d immediately. ✓
- `scripts/deploy-worker.sh:63` reads `JUDGE_AUTH_TOKEN` from `.env.production` and passes via env to remote `docker run`. Token never logged. ✓
- No `console.log(process.env.JUDGE_AUTH_TOKEN)` or similar in `src/`. ✓

### Destructive-action policy compliance

- `docker system prune --volumes` only mentioned in `CLAUDE.md` and `docs/deployment.md` as forbidden — no execution path in any deploy script. ✓
- No `--no-verify`, `--no-gpg-sign`, force-push, or `git reset --hard origin/main` in any active script. ✓

### Auth/Authz

- `src/lib/auth/config.ts` — frozen by repo policy. No diff this cycle. ✓
- API handlers using `createApiHandler` (84 of 104) get standard auth+rate-limit wrapping. The 20 raw-handler endpoints (ARCH-CARRY-1) include health/metrics/judge-sidecar endpoints, which generally use a different (judge-token-based) auth path; no security regression observed.

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no new security-class issues.

## Recommendation

Pick **C5-SR-1** for cycle-6 draw-down — small, safe, security-improving (defense-in-depth for future untrusted-input changes), well-understood exit criterion.

Confidence: H.
