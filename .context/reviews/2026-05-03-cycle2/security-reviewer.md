# Security Review — Cycle 2 (2026-05-03)

**Reviewer:** security-reviewer
**HEAD:** `689cf61d`

---

## C2-SEC-1 (HIGH, HIGH confidence) — Recruiting token is single-factor auth without brute-force protection on the redeem path

**File:** `src/lib/auth/config.ts:204-233`, `src/lib/assignments/recruiting-invitations.ts:310-545`

The recruiting token is a 32-byte base64url string (256 bits) that serves as single-factor authentication. The login path has IP-based rate limiting, but the `redeemRecruitingToken` function itself has no rate limiting or lockout. An attacker who obtains a token hash via timing side-channel or DB leak can attempt unlimited redeems without lockout.

More critically, the token is sent as a credential field in the NextAuth `authorize()` callback, meaning it passes through the same login rate limiter as passwords. If the rate limiter is cleared on success (which it is — `clearRateLimitMulti` at line 232), a valid token resets the counter, allowing unlimited subsequent attempts on other tokens.

**Fix:** Add a dedicated per-token rate limit on `redeemRecruitingToken` that is NOT cleared on success. Consider adding a `failedRedeemAttempts` counter on the invitation row that locks the token after N failures.

---

## C2-SEC-2 (MEDIUM, HIGH confidence) — `candidateEmail` and `candidateName` stored and transmitted in plaintext

**File:** `src/lib/assignments/recruiting-invitations.ts:57-58`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`

Carry-forward from C1-F3. Candidate PII is stored unencrypted in `recruitingInvitations`. Additionally, the API response returns full PII to any instructor with recruiting access. The encryption module (`src/lib/security/encryption.ts`) exists but is not applied.

The `decrypt()` function already has `allowPlaintextFallback` for migration. A phased approach is feasible:
1. Start encrypting on INSERT (new rows get `enc:` prefix)
2. Read path uses `decrypt(value, { allowPlaintextFallback: true })` for mixed state
3. Background migration encrypts existing rows

**Fix:** Apply `encrypt()`/`decrypt()` to `candidateName` and `candidateEmail` columns. Use the existing `allowPlaintextFallback` option for backward compatibility during migration.

---

## C2-SEC-3 (MEDIUM, HIGH confidence) — File download endpoint lacks Content-Disposition sanitization for `originalName`

**File:** `src/app/api/v1/files/[id]/route.ts:108-111`

```ts
const ext = file.originalName.includes(".") ? `.${file.originalName.split(".").pop()}` : "";
const disposition = isImage
  ? "inline"
  : contentDispositionAttachment(file.originalName.replace(/\.[^.]+$/, ""), ext);
```

`file.originalName` comes from the upload filename, which is user-controlled. While `contentDispositionAttachment` uses `encodeURIComponent` for the filename, the fallback path for images uses `Content-Disposition: inline` with the raw `Content-Type` header. An uploaded HTML file disguised with an image MIME type could be served inline if the `isImageMimeType` check is somehow bypassed. The `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'` headers mitigate this significantly, but defense-in-depth would be to always use `attachment` disposition for non-image types.

Additionally, `file.originalName.split(".").pop()` could produce unexpected extensions for filenames with multiple dots (e.g., `file.exe.png` -> `.png` but the file could be `file.png.exe` -> `.exe`).

**Fix:** Validate the extracted extension against a whitelist. Ensure non-image files always use `attachment` disposition (which is already the case via `contentDispositionAttachment`).

---

## C2-SEC-4 (MEDIUM, HIGH confidence) — Audit event write failure causes silent data loss

**File:** `src/lib/audit/events.ts:174-175`

When the audit buffer flush fails AND the buffer exceeds `FLUSH_SIZE_THRESHOLD * 2` (100 entries), the failed batch is silently dropped:

```ts
if (_auditBuffer.length + batch.length < FLUSH_SIZE_THRESHOLD * 2) {
  _auditBuffer = [...batch, ..._auditBuffer];
}
// else: silently dropped — no log, no counter increment
```

This means audit events can be silently lost during a DB outage. For compliance-critical systems, this is unacceptable.

**Fix:** Add a `droppedAuditEvents` counter that is incremented when events are dropped. Expose this counter in the admin health endpoint. Consider writing failed events to stderr or a local file as a last resort.

---

## C2-SEC-5 (LOW, HIGH confidence) — `apiKeyEffectiveRole` logic can elevate privileges if creator is promoted after key creation

**File:** `src/lib/api/api-key-auth.ts:114-118`

```ts
const [keyRoleRank, userRoleRank] = await Promise.all([
  getRoleLevel(candidate.role),
  getRoleLevel(user.role),
]);
const effectiveRole = keyRoleRank <= userRoleRank ? candidate.role : user.role;
```

If an admin creates an API key with `role: "student"`, then the admin is later demoted, the key's effective role becomes `user.role` (the demoted role). But if a student creates a key and is later promoted to admin, the key's effective role also becomes admin — even though the key was created with student privileges. This may be intentional, but it's a privilege escalation vector.

**Fix:** Document the intended behavior. If the key role should be an upper bound, use `min(keyRoleRank, userRoleRank)`. If it should be the exact declared role, use `candidate.role` directly.

---

## C2-SEC-6 (LOW, MEDIUM confidence) — Recruiting invitation `metadata` field is an unstructured JSONB column

**File:** `src/lib/db/schema.pg.ts:956`

```ts
metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
```

The `metadata` field stores arbitrary key-value pairs from the recruiter. The `resetRecruitingInvitationAccountPassword` function reads `metadata[ACCOUNT_PASSWORD_RESET_REQUIRED_KEY]` and the recruit page may read other metadata. There is no validation on what keys/values can be stored. A malicious recruiter could inject metadata keys that interfere with application logic.

**Fix:** Add a Zod schema for the metadata field and validate on insert. At minimum, reserve the `accountPasswordResetRequired` key and prevent user-supplied keys from colliding with internal keys.

---

## C2-SEC-7 (LOW, HIGH confidence) — `process.env.DATABASE_PATH` path traversal potential in storage module

**File:** `src/lib/files/storage.ts:5-6`

```ts
return process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH, "..")
  : join(process.cwd(), "data");
```

The `DATABASE_PATH` env var is resolved and then the parent directory is used as the data directory. While env vars are typically operator-controlled, the `resolve(path, "..")` pattern is fragile. If `DATABASE_PATH` is a symlink or ends with `/`, the `..` could resolve to an unexpected directory.

**Fix:** Use a dedicated `DATA_DIR` env var instead of deriving from `DATABASE_PATH`. Add validation that the resolved path is within expected bounds.

---

## Final Sweep

Checked for: SQL injection (all queries use Drizzle ORM or parameterized SQL), XSS (only 2 `dangerouslySetInnerHTML` sites, both sanitized), open redirect (comprehensive validation in `getSafeRedirectUrl`), CSRF (proper X-Requested-With check), timing attacks (safe compare in judge auth), secret logging (no secrets logged). The overall security posture is strong.
