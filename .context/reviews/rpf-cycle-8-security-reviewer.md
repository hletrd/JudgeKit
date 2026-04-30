# RPF Cycle 8 — Security Reviewer

**Date:** 2026-04-29
**HEAD reviewed:** `1c991812`
**Change surface:** 0 commits, 0 files, 0 lines.

## Findings

**0 NEW HIGH / 0 NEW MEDIUM / 0 NEW LOW.** Empty change surface.

## Re-validation of security-adjacent carry-forwards

### Stale-AGG-2 plaintext recruiting `token` column — RESOLVED at HEAD (re-confirmed)

- `src/lib/db/schema.pg.ts` recruiting invitations table has only `tokenHash: varchar("token_hash", { length: 64 })` and `uniqueIndex("ri_token_hash_idx").on(table.tokenHash)`. No plaintext `token` column. No `ri_token_idx`.
- DB-leak threat: a captured backup or read-only DB credential cannot redeem invitations.
- Disposition: closed cycle 7. Re-confirmed cycle 8.

### C7-AGG-7 — `src/lib/security/encryption.ts:79-81` decrypt plaintext fallback

- HEAD inspection: `decrypt()` returns the input verbatim if it doesn't have the AES-GCM marker prefix. Documented behavior in the cycle-7 aggregate.
- Severity LOW (preserved). Exit criterion: production tampering incident OR audit cycle.
- Status: DEFERRED. **Risk caveat:** if a malicious DB row has plaintext content where ciphertext is expected, the app will use it. Still LOW because (a) it's a tampering scenario that requires DB write access, and (b) downstream code generally validates the decrypted value against a schema.

### D1, D2 — auth JWT clock-skew + DB-per-request

- Severity MEDIUM (preserved). Files under `src/lib/auth/` but **must NOT touch `src/lib/auth/config.ts`** per CLAUDE.md "Preserve Production config.ts".
- Status: DEFERRED.

### C7-AGG-9 — 3-module rate-limiting duplication

- HEAD: `src/lib/security/in-memory-rate-limit.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/security/rate-limit.ts`. Three separate modules with overlapping responsibilities. Risk: a fix applied in one is silently absent in the others (drift/bypass).
- Severity LOW (preserved). Exit criterion: rate-limit consolidation cycle.
- Status: DEFERRED.

## Sweep — no new security findings

- No new auth/AuthZ/CSRF/SSRF/XSS/SQLi vectors introduced (no diff to review).
- The cycle-7 test commit (`9e928fd1`) is a pure-test addition — no attack surface.
- The cycle-7 doc commits (`33c294b5`, `abebb843`, `1c991812`) introduce no runtime code.

## Recommendations for cycle 8 LOW draw-down

Security-reviewer perspective on candidate picks:

1. **C7-DS-1** (README missing `/api/v1/time` endpoint doc): doc-only; zero security risk; safe pick.
2. **C7-DB-2-upper-bound** (`DEPLOY_SSH_RETRY_MAX` no upper bound): operator-footgun (could cause prolonged retry-storm against SSH server, possibly trigger fail2ban or look like a brute-force attempt); adding a soft cap improves operator hygiene and lowers false-positive risk on remote-side IDS. Mild **security-adjacent** improvement. Recommended.
3. **C7-AGG-7** (encryption.ts plaintext fallback): would benefit from defense-in-depth (reject non-prefixed inputs by default + opt-in legacy mode), but it's a behavior change that touches a security boundary — DEFER for an audit cycle is correct. Skip this cycle.

## Confidence

H on resolved-status verifications; H on no-new-findings; H on cycle-8 pick recommendations.
