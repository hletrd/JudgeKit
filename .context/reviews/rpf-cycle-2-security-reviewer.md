# Security Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** security-reviewer
**HEAD reviewed:** `767b1fee`
**Scope:** OWASP top-10, secrets, auth, input handling, escape paths

---

## Recent changes security audit

### Recruiting validate endpoint (uncommitted changes)
- **File:** `src/app/api/v1/recruiting/validate/route.ts`
- **Status:** CLEAN — Rate limiting before DB access. CSRF validation present. Token hashed before lookup. SQL NOW() for expiry validation avoids clock skew. Uniform `invalid()` response prevents information leakage. Only returns `{ valid: true/false }` — no assignment details or invitation metadata leaked.

### ConditionalHeader (commit `767b1fee`)
- **File:** `src/components/layout/conditional-header.tsx`
- **Status:** CLEAN — Client-side component using `usePathname()`. No sensitive data exposure. No auth boundary changes.

### i18n fixes (commit `95cbcf6a`)
- **Status:** CLEAN — String externalization only. No security impact.

### Discussions refactor (commit `82e1ea9e`)
- **Status:** CLEAN — SQL filter push-down. No new attack surface. Filters use Drizzle ORM parameterized queries.

---

## Findings

### C2-SR-1: [LOW] `compiler/execute.ts` workspace chmod 0o770

- **File:** `src/lib/compiler/execute.ts:660`
- **Confidence:** LOW (carry-forward from C1-SR-2)
- **Description:** `chmod(workspaceDir, 0o770)` gives group read-write on ephemeral judge workspaces.
- **Status:** Carry-forward. No regression.

---

## No-issue confirmations

- AES-256-GCM encryption with proper IV length (12 bytes), auth tag (16 bytes), and `enc:` prefix invariant. Correct.
- CSRF validation checks origin, sec-fetch-site, and X-Requested-With. Correct.
- `sanitizeHtml` uses DOMPurify with narrow allow-list and URI regex. Correct.
- Judge auth uses timing-safe comparison. Worker auth hashes token before comparing. Correct.
- `rawQueryAll`/`rawQueryOne` use parameterized queries. No SQL injection. Correct.
- `dangerouslySetInnerHTML` used in only 2 places, both properly sanitized. Correct.
- No `eval()` calls in source code. Correct.
- No hardcoded secrets in tracked files. Correct.
- Password validation now minimum-length-only per AGENTS.md. RESOLVED.
- `NODE_ENCRYPTION_KEY` required regardless of NODE_ENV. Correct.
