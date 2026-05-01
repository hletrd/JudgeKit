# Security Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** security-reviewer
**HEAD reviewed:** `894320ff`
**Scope:** OWASP top-10, secrets, auth, input handling, escape paths

---

## Findings

### C1-SR-1: [MEDIUM] `password.ts` adds similarity and dictionary checks that contradict documented policy

- **File:** `src/lib/security/password.ts:13-68`
- **Confidence:** HIGH
- **Description:** The `COMMON_PASSWORDS` set (20 entries) and the username/email similarity checks implement a password policy that goes beyond the documented "8 character minimum only" rule in AGENTS.md. From a security perspective, these checks are *more* secure than the documented policy — the issue is policy-code mismatch, not a security weakness. A security auditor reading AGENTS.md would believe only length is checked, but the code enforces additional constraints.
- **Fix:** Either update AGENTS.md to document the actual policy, or remove the extra checks per the current documented policy.

### C1-SR-2: [LOW] `compiler/execute.ts` workspace chmod 0o770 may allow group read-write on shared hosts

- **File:** `src/lib/compiler/execute.ts:660`
- **Confidence:** LOW
- **Description:** `chmod(workspaceDir, 0o770)` gives full read/write/execute to the group. On a shared host where the Docker group matches other users, this could allow unauthorized access to judge workspaces. The workspace is ephemeral and created in a temp directory, making exploitation difficult.
- **Fix:** Consider using 0o700 (owner-only) since the container runs as user 65534 which maps to the file's group, or document that 0o770 is intentional for Docker-in-Docker scenarios.

---

## No-issue confirmations

- AES-256-GCM encryption with proper IV length (12 bytes), auth tag (16 bytes), and `enc:` prefix invariant. Plaintext fallback properly gated with production-safe defaults. Correct.
- CSRF validation checks origin, sec-fetch-site, and X-Requested-With. API key auth bypasses CSRF check (correct). Correct.
- `sanitizeHtml` uses DOMPurify with narrow allow-list and URI regex restricting to `https?`, `mailto:`, and root-relative paths. Correct.
- `sanitizeMarkdown` strips control characters but does not escape angle brackets (correct). Correct.
- Judge auth uses timing-safe comparison. Worker auth hashes the provided token before comparing. Correct.
- `rawQueryAll`/`rawQueryOne` use parameterized queries with `namedToPositional` conversion — no SQL injection. Correct.
- `dangerouslySetInnerHTML` used in only 2 places, both properly sanitized. Correct.
- No `eval()` calls found in source code. Correct.
- No hardcoded secrets or credentials found in tracked files. Correct.
