# Critic Review — Cycle 1 (2026-05-03)

**Reviewer:** critic (multi-perspective critique)
**Scope:** Full change surface, cross-cutting concerns
**HEAD:** 689cf61d

---

## Findings

### C1-CRIT-1: Inconsistent docker image build path validation is a defense-in-depth gap
**Files:** `src/lib/docker/client.ts:159-169` (local), `:349-354` (remote)
**Severity:** MEDIUM | **Confidence:** HIGH

Already covered by C1-CR-2 but elevated here because the inconsistency is a defense-in-depth concern, not just a code quality issue. The remote path allows building any `docker/Dockerfile.*` (including `Dockerfile.code-similarity`, `Dockerfile.app`), while the local path restricts to `docker/Dockerfile.judge-*`. An attacker with admin API access could request a build of the code-similarity image through the worker, potentially exfiltrating the `CODE_SIMILARITY_AUTH_TOKEN` embedded in the build context. While the worker should not honor such requests, the ACL is inconsistent.

**Fix:** Align both validation paths to `docker/Dockerfile.judge-` prefix.

### C1-CRIT-2: `docker/client.ts` RUNNER_AUTH_TOKEN fallback undermines per-worker token isolation
**File:** `src/lib/docker/client.ts:12`
**Severity:** MEDIUM | **Confidence:** HIGH

Duplicate of C1-SEC-4 but elevated because the fallback chain `RUNNER_AUTH_TOKEN || JUDGE_AUTH_TOKEN` means a single compromised `JUDGE_AUTH_TOKEN` grants both judge submission access (via the judge routes) AND Docker API access (via the docker client). This violates the principle of least privilege. The prior commit `909fcbf5` removed the shared fallback for the judge routes; the docker client should follow suit.

**Fix:** Remove `JUDGE_AUTH_TOKEN` fallback from `docker/client.ts`.

### C1-CRIT-3: Production deployment lag — multiple routes 404 on algo.xylolabs.com
**Severity:** MEDIUM | **Confidence:** HIGH (confirmed by v2 review live testing)

Not a code issue but a deployment gap. Routes that exist in source (`/signin`, `/privacy`, `/groups`) return 404 in production. The prior review v2 confirmed this with live screenshots. The latest commit `689cf61d` adds the privacy page; deploying HEAD would fix this.

**Fix:** Deploy current HEAD to production.

---

## Architectural Observations

- The codebase has a healthy separation between `createApiHandler` (218 routes) and raw handlers (24 routes). The raw handlers are in specific categories: SSE streaming, judge internal, and a few legacy endpoints. This is acceptable but should be tracked for migration.
- The recruiting flow is well-isolated: recruiting candidates are scoped to their invitation's assignment and problems via `getRecruitingAccessContext`, which uses dual caching (React cache + AsyncLocalStorage).
- The encryption module's plaintext fallback is properly gated and logged. The deferred removal is documented with clear exit criteria.
