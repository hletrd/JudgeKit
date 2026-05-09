# Cycle 18 Security Reviewer Findings (Updated)

**Date:** 2026-05-09
**Reviewer:** OWASP top 10, secrets, unsafe patterns, auth/authz
**Base commit:** 75d82a17
**Previous review:** cycle-18-security-reviewer.md (2026-04-19, commit 7c1b65cc)

---

## Previous Finding Status

| ID | Previous Finding | Status |
|----|-----------------|--------|
| F1 | Admin routes discard `needsRehash` | **STILL OPEN** — unchanged since April |
| F2 | `getRecruitingAccessContext` timing side channel | **PARTIALLY ADDRESSED** — `withRecruitingContextCache` added in `api/handler.ts:109` |
| F3 | Internal cleanup endpoint lacks rate limiting | **STILL OPEN** — `/api/internal/cleanup` still has no rate limit or IP restriction |

---

## New Findings

### N1: Plaintext Fallback in Plugin Secret Decryption — encryption bypass

- **File**: `src/lib/plugins/secrets.ts:54`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: `decryptPluginSecret()` returns the raw value unchanged if it lacks the `enc:v1:` prefix. Unlike `decrypt()` in `encryption.ts` which throws in production when `allowPlaintextFallback` is false, the plugin function has NO production safeguard. An attacker who can write to the `plugins.config` JSONB column bypasses AES-GCM authenticity entirely.
- **Exploit scenario**: Attacker with compromised admin credentials or DB write access replaces an encrypted API key with plaintext. The chat-widget plugin loads and uses the attacker-controlled value without detecting tampering.
- **Fix**: Add production-safe fallback matching `encryption.ts`: reject non-encrypted values in production, warn-log, only allow explicit fallback during migration.

### N2: Unhandled Promise Rejection in Auto Code Review Trigger

- **File**: `src/app/api/v1/judge/poll/route.ts:206`
- **Severity**: LOW
- **Confidence**: HIGH
- **Description**: `void triggerAutoCodeReview(submissionId)` fires without await or catch. If the function throws (DB timeout, AI provider error), the unhandled rejection may crash the process depending on Node.js `--unhandled-rejections` policy.
- **Fix**: `void triggerAutoCodeReview(submissionId).catch(err => logger.warn({ err, submissionId }, "[auto-review] failed"))`

### N3: Path Traversal Defense Gaps in File Storage

- **File**: `src/lib/files/storage.ts:18-27`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `resolveStoredPath()` only checks for `/`, `\`, and `..`. It does not reject null bytes, control characters, or names starting with `.` (hidden files). While current callers use `nanoid()`-generated names, future reuse could be vulnerable.
- **Fix**: Restrict stored names to `[a-zA-Z0-9._-]+`, reject leading `.`, and null bytes.

### N4: WeakMap Request Deduplication is Fragile Across Middleware Boundaries

- **File**: `src/lib/security/api-rate-limit.ts:61-71`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `consumedRequestKeys` is a `WeakMap<NextRequest, Set<string>>`. The code comment correctly notes that "Next.js creates a new request object per middleware/route boundary", so deduplication typically only works within a single handler. If middleware and route handler both call `consumeApiRateLimit`, the same request consumes two tokens.
- **Fix**: Use `AsyncLocalStorage`-based request context for reliable per-request deduplication, or document the limitation.

### N5: Prune Route Uses Unvalidated Docker Repository in Path Construction

- **File**: `src/app/api/v1/admin/docker/images/prune/route.ts:21`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: `join("docker", \`Dockerfile.${img.repository}\`)` constructs a path from Docker image repository names without validation. While `listDockerImages` filters with `reference=judge-*`, the repository string is not validated through `isAllowedJudgeDockerImage` before path use. Repository names with `/` create unexpected subdirectories.
- **Fix**: Validate `img.repository` with `isAllowedJudgeDockerImage` or reject path separators before constructing the dockerfile path.

---

## Verified Safe (Re-confirmed)

- **VS1**: SQL injection prevention — all raw queries use parameterized placeholders via `namedToPositional`.
- **VS2**: Auth/CSRF — `createApiHandler` correctly gates all mutation endpoints.
- **VS3**: DOMPurify — `sanitizeHtml` maintains strict allowlists and URI restrictions.
- **VS4**: Judge worker auth — per-worker secret tokens enforced, shared token fallback restricted to registration.
- **VS5**: Docker sandboxing — seccomp, capability drop, no-new-privileges, read-only rootfs all present.
- **VS6**: `db/cleanup.ts` now uses canonical `DATA_RETENTION_DAYS` and respects `DATA_RETENTION_LEGAL_HOLD` (fixed since April).
