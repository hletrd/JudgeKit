# Security Review -- RPF Cycle 4 (2026-05-04)

**Reviewer:** security-reviewer
**HEAD reviewed:** `ec8939ca`
**Scope:** OWASP top-10, secrets, auth, input handling, escape paths. Focus on changes since `4cd03c2b`.

---

## Prior cycle status

- **C1-SR-1 (password.ts policy mismatch):** RESOLVED.
- **C1-SR-2 (chmod 0o770):** CARRY -- still deferred.
- **C3-SR-1 (token-hash.ts lacks algorithm prefix):** CARRY -- still deferred.

---

## Findings

No new security findings this cycle. The i18n changes since `4cd03c2b` (loading.tsx async conversion, CodeTimelinePanel translation) have no security surface -- they are purely display-layer changes with no auth, input, or data-flow implications.

---

## No-issue confirmations

- CSRF validation remains correct on all POST endpoints.
- AES-256-GCM encryption, parameterized queries, `sanitizeHtml`, judge auth all remain correct.
- No new `eval()` calls, hardcoded secrets, or SQL injection vectors.
- `getTranslations()` is server-side i18n and does not introduce client-side data exposure.
