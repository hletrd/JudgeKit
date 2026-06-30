# Causal Tracing Review

Date: 2026-06-30
Scope: entire repository, with deep traces through contest join, similarity-check, compiler execute, auth/session, and admin mutation flows
Summary: The cycle-3 remediation commits (b2edee07, 20c9e3c4) correctly reorder compiler validation and harden the X-Real-IP fallback, but a few causal chains still carry residual risk: shared rate-limit buckets when proxy headers are degraded, a one-second token-revocation ambiguity window, and an untested pure-TA path in the new similarity-check guard.
Findings count: 7

## MEDIUM: Shared `unknown` rate-limit bucket when proxy headers are missing or untrusted (confidence: High)
- **File**: `src/lib/security/ip.ts` (lines 99-130) -> `src/lib/security/rate-limit.ts:45-47` -> `src/lib/security/api-rate-limit.ts:160-161`
- **Problem**: In production, `extractClientIp` returns `null` whenever `X-Forwarded-For` is absent or shorter than `TRUSTED_PROXY_HOPS` expects. `getRateLimitKey` then collapses every such request into the single key `api:<endpoint>:unknown`. All clients whose proxy chain is misconfigured (or deliberately stripped) share one bucket.
- **Failure scenario**: An attacker sends many join requests without `X-Forwarded-For`. The IP-based `contest:join` bucket in `createApiHandler` exhausts for key `api:contest:join:unknown`. Any legitimate user behind the same misconfigured proxy now receives 429 before the route-level user-scoped/code-scoped limiters are reached. The new per-user and per-code protections still work for users with valid proxy headers, but the shared bucket becomes a single point of failure for the misconfigured subset.
- **Suggested fix**: For authenticated routes, fall back to a user-derived rate-limit key (or skip the IP tier) when `extractClientIp` returns null, rather than keying every unidentifiable client together. For unauthenticated routes, keep the `unknown` bucket but consider a separate allow/alert path when it exceeds a low threshold.
- **Cross-references**: `src/app/api/v1/contests/join/route.ts:15` (rateLimit: "contest:join"); `src/lib/api/handler.ts:118-120` (consumeApiRateLimit before handler); `src/lib/security/ip.ts:107-112` (production warning for short/missing XFF).

## LOW: One-second token-revocation ambiguity window (confidence: Medium)
- **File**: `src/lib/auth/session-security.ts` (lines 25-35)
- **Problem**: `isTokenInvalidated` compares `authenticatedAtSeconds < invalidatedAtSeconds`. Both timestamps are truncated to whole seconds. A token issued in the same second as a revocation event remains valid because the comparison is strict.
- **Failure scenario**: Admin resets their password or an operator triggers role revocation at 12:00:00.500. A token minted at 12:00:00.100 (before the revocation in wall-clock time but with the same second value) survives the invalidation check. The window is bounded by one second and typically closes on the next request, but it allows a small race for sensitive actions.
- **Suggested fix**: Store and compare revocation timestamps at millisecond (or at least sub-second) precision, or treat `authenticatedAt <= invalidatedAtSeconds` as invalidated when the token was issued before the revocation event in the issuing logic. The latter requires millisecond-precision metadata in the JWT.
- **Cross-references**: `src/lib/auth/session-security.ts:55-70` (`clearAuthToken` sets `authenticatedAt = 0` to force invalidation); `src/lib/api/auth.ts:78` (`getActiveAuthUserById` applies the check).

## MEDIUM: Similarity-check route requires capability before TA role, leaving pure-TA path uncovered (confidence: Medium)
- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` (lines 12-24)
- **Problem**: `canRunSimilarityCheck` first rejects any non-manager who lacks `anti_cheat.run_similarity`, then grants access to group TAs or assigned instructors. The built-in `assistant` role carries the capability, so the path works today. However, a user who is a group `ta` but whose system/custom role does not include `anti_cheat.run_similarity` is denied, even though `isGroupTA` is checked later. The route test covers the assigned-assistant case but not the pure-group-TA case.
- **Failure scenario**: A custom role named "ta" or a future capability edit removes `anti_cheat.run_similarity`. Staff who are explicitly added as group TAs can no longer run similarity scans, while the UI may still show the affordance based on group membership. Conversely, if the intent is that the capability is mandatory, the TA check should be removed or documented as dead code.
- **Suggested fix**: Add a route test for a pure group TA (no `anti_cheat.run_similarity`) and either (a) confirm the denial is policy and document it, or (b) move `isGroupTA` before the capability check if group TA status alone should grant access. Also audit other anti-cheat routes (`participant-timeline`, `anti-cheat` GET) for the same pattern.
- **Cross-references**: `src/lib/capabilities/defaults.ts:15-34` (assistant capabilities include `anti_cheat.run_similarity`); `src/lib/assignments/contests.ts:237-251` (`canMonitorContest` scopes `anti_cheat.view_events` to assigned groups); `tests/unit/api/similarity-check.route.test.ts:170-192`.

## MEDIUM: Contest join user-scoped limiter is reached before code-scoped limiter, giving multi-account attackers N user budgets (confidence: Medium)
- **File**: `src/app/api/v1/contests/join/route.ts` (lines 28-42)
- **Problem**: On a failed redemption, the route first consumes the per-user bucket (`contest:join:invalid`), then the per-code bucket (`contest:join:invalid-code:<hash>`). If the user bucket blocks, the code bucket is never incremented. An attacker with M accounts gets M independent user budgets before the shared code bucket becomes the binding constraint.
- **Failure scenario**: Distributed attackers use many accounts (or the signup flow, if open) to brute-force a single contest access code. Each account exhausts its own `contest:join:invalid` budget; the shared `contest:join:invalid-code` bucket is only incremented when a user budget allows. If the per-user budget is generous relative to the per-code budget, the code bucket may still block, but the defense relies entirely on the per-code limit being tight.
- **Suggested fix**: Consider consuming the code-scoped bucket unconditionally (or before the user-scoped bucket) so that distributed attempts against the same code converge immediately on the shared limit. Ensure the per-code budget is stricter than the per-user budget to make it the binding constraint.
- **Cross-references**: `src/lib/security/api-rate-limit.ts:198-222` (`consumeUserApiRateLimit`); `tests/unit/api/contests.route.test.ts:315-325`.

## LOW: Compiler `validateShellCommandStrict` rejects env-var prefixed commands despite documentation (confidence: Medium)
- **File**: `src/lib/compiler/execute.ts` (lines 184-251)
- **Problem**: The trust-boundary comment at lines 764-767 states that compile commands may include "env var prefixes" and `&&` chains. However, `validateShellCommandStrict` splits each chained segment by whitespace and checks the first token against `ALLOWED_COMMAND_PREFIXES`. A segment such as `FOO=bar gcc ...` has first token `FOO=bar`, which is not a known prefix and is rejected.
- **Failure scenario**: An admin sets a language config compile command with an environment prefix (e.g., `VMODULES=/tmp v build`). Local fallback rejects it as "Invalid compile command" even though the comment says such commands are supported. The Rust runner may still accept it (it has its own validator), creating inconsistent behavior between runner and fallback modes.
- **Suggested fix**: Either update the comment to remove the env-var-prefix claim, or enhance `isValidCommandPrefix` / segment parsing to strip leading `KEY=VALUE` assignments before checking the command prefix.
- **Cross-references**: `judge-worker-rs/src/runner.rs#validate_shell_command` (mentioned as lock-step partner); `src/lib/compiler/execute.ts:775` (compile command passed to `sh -c`).

## LOW: `redeemAccessCode` unique-violation recovery assumes the conflicting row belongs to the same user (confidence: Medium)
- **File**: `src/lib/assignments/access-codes.ts` (lines 207-221)
- **Problem**: The catch block for Postgres unique-violation `23505` re-fetches the assignment by access code and returns `alreadyEnrolled: true`. The transaction inserted with the caller's `userId`, so the unique constraint can only fire for `(assignmentId, userId)`. The recovery path does not verify this, so a future schema change (e.g., adding a unique index on access code alone) would make the response misleading.
- **Failure scenario**: If a future migration adds a unique constraint on `contest_access_tokens.access_code` (or any other column), concurrent redemptions of the same code could surface `23505` here. The function would tell one user they are already enrolled when the conflict was actually on the code itself. This is defensive only; the current schema does not trigger it.
- **Suggested fix**: In the recovery branch, re-run the `existing` check for the specific `(assignmentId, userId)` pair before returning `alreadyEnrolled`, or at minimum assert that the caught constraint name matches the expected `(assignmentId, userId)` index.
- **Cross-references**: `src/lib/assignments/access-codes.ts` schema for `contestAccessTokens`; `src/app/api/v1/contests/join/route.ts:40-44` (returns `alreadyEnrolled`).

## MEDIUM: API-key auth bypasses the JWT `authenticatedAt` revocation model but relies on creator `tokenInvalidatedAt` (confidence: High)
- **File**: `src/lib/api/api-key-auth.ts` (lines 84-92) and `src/lib/api/auth.ts` (lines 61-83)
- **Problem**: API keys do not carry an `authenticatedAt` timestamp. Instead, they are rejected when `candidate.createdAt < user.tokenInvalidatedAt`. This is the correct model for long-lived keys, but it shifts the trust boundary from "when was this session minted" to "when was this key created."
- **Failure scenario**: An operator revokes all sessions at T1. An API key created at T0 is correctly blocked. However, if the operator later rotates the creator's role downward and then back up, the T0 key remains valid (it was created before revocation). There is no way to invalidate a specific API key via session revocation; operators must disable the key row itself. This is documented behavior but worth tracing explicitly.
- **Suggested fix**: No code change required if this is policy. Add an operational note in `docs/admin-security-operations.md` that session revocation does not invalidate API keys created before the revocation; explicit key disable/delete is required.
- **Cross-references**: `src/lib/api/api-key-auth.ts:113` (effective role capped by creator's current role); `src/lib/auth/session-security.ts` (`isTokenInvalidated`).

## Final sweep

- **Confirmed fixed in current tree**: C3-6 (compiler validation before Rust runner), C3-7 (X-Real-IP only when XFF absent), C3-5 (static-site `autoindex off`).
- **Causal chains not fully covered by tests**: pure group TA running similarity check; rate-limit behavior when `extractClientIp` returns null in production; env-var-prefixed compile commands in local fallback.
- **Skipped areas**: Full Rust-side validator parity check (would require reading `judge-worker-rs/src/runner.rs` in detail), live multi-instance race verification for rate limits, and browser-level CSRF bypass attempts.
- **Manual validation recommended**: Deploy a worker with `TRUSTED_PROXY_HOPS=1` but omit `X-Forwarded-For` and confirm the `unknown` rate-limit bucket does not block legitimate traffic; verify that an assistant who is only a group TA (not assigned instructor) can or cannot run similarity checks per intended policy.
