# Security Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** security-reviewer
**HEAD reviewed:** `4cd03c2b`
**Scope:** OWASP top-10, secrets, auth, input handling, escape paths. Focus on changes since `988435b5`.

---

## Prior cycle status

- **C1-SR-1 (password.ts policy mismatch):** RESOLVED — `password.ts` now only checks minimum length per AGENTS.md policy.
- **C1-SR-2 (chmod 0o770):** CARRY — still deferred.

---

## Findings

### C3-SR-1: [LOW] `token-hash.ts` still lacks algorithm identifier prefix

- **File:** `src/lib/security/token-hash.ts:10-12`
- **Confidence:** LOW
- **Description:** The `hashToken` function returns a bare SHA-256 hex digest without a `sha256:` prefix. If the algorithm ever needs to be rotated (e.g., to SHA-3 or BLAKE3), there's no way to distinguish old hashes from new ones during migration. This is a low-urgency concern since tokens can be regenerated.
- **Fix:** Consider prefixing with `sha256:` for future algorithm rotation. Deferred — low priority, already tracked as AGG1N-8.

---

## No-issue confirmations

- CSRF validation in recruiting validate endpoint (`src/app/api/v1/recruiting/validate/route.ts`) properly uses `validateCsrf()`. The endpoint correctly validates CSRF even though it's a public endpoint, preventing cross-origin form submissions. Correct.
- AES-256-GCM encryption, CSRF validation, `sanitizeHtml`, judge auth, parameterized queries, and `dangerouslySetInnerHTML` usage all remain correct.
- No new `eval()` calls, hardcoded secrets, or SQL injection vectors found.
- The `validateRecruitingTokenSchema` Zod validation properly rejects empty/malformed tokens before hitting the DB.
