# Code Review — Cycle 1 (2026-05-03)

**Reviewer:** code-reviewer
**Scope:** Full codebase, emphasis on code quality, logic, SOLID, maintainability
**HEAD:** 689cf61d

---

## Findings

### C1-CR-1: Gemini URL construction with unvalidated model name — potential SSRF vector
**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:102`
**Severity:** MEDIUM | **Confidence:** HIGH

The Gemini test-connection endpoint constructs a URL by interpolating the `model` parameter directly into the URL path:
```ts
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
```
Although the model is validated against `SAFE_GEMINI_MODEL_PATTERN` (`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`), the period and hyphen characters could theoretically allow path traversal in some URL parsing contexts. While the current regex is reasonably safe (no `/`, `?`, `#`, or `..`), this is a latent SSRF risk if the regex is ever loosened. A URL constructor approach (`new URL(...)`) with explicit pathname building would be more robust.

**Fix:** Use `encodeURIComponent(model)` in the URL template, or construct the URL via `new URL()` to enforce structural safety regardless of regex changes.

### C1-CR-2: `docker/client.ts` dual path validation inconsistency between local and remote build
**File:** `src/lib/docker/client.ts:159-169` vs `src/lib/docker/client.ts:349-354`
**Severity:** LOW | **Confidence:** HIGH

`buildDockerImageLocal()` validates `dockerfilePath.startsWith("docker/Dockerfile.judge-")` (more restrictive), while the remote path `buildDockerImage()` validates `dockerfilePath.startsWith("docker/Dockerfile.")` (less restrictive). The local path explicitly requires the `judge-` infix; the remote path allows any Dockerfile under `docker/`. This means a malicious or buggy admin API call could request a build of `docker/Dockerfile.code-similarity` through the remote worker path but would be rejected locally.

**Fix:** Align both paths to use the same `docker/Dockerfile.judge-` prefix check, or extract the validation to a shared function.

### C1-CR-3: `candidateName` and `candidateEmail` stored as plaintext in database
**File:** `src/lib/assignments/recruiting-invitations.ts:57-58`
**Severity:** MEDIUM | **Confidence:** HIGH

Candidate PII (`candidateName`, `candidateEmail`) is stored unencrypted in the `recruitingInvitations` table. The application has an encryption module (`src/lib/security/encryption.ts`) using AES-256-GCM, but it is not applied to these columns. If the database is compromised, all candidate PII is exposed. The prior review (v2 00-overall-verdict.md) also flagged this.

**Fix:** Apply column-level encryption using the existing `encrypt()`/`decrypt()` utilities from `encryption.ts` for `candidateName` and `candidateEmail` fields, similar to how plugin API keys are handled.

### C1-CR-4: Non-image file uploads lack magic-byte / content-type verification
**File:** `src/app/api/v1/files/route.ts:29-31, 71-74`
**Severity:** MEDIUM | **Confidence:** HIGH

The file upload endpoint trusts the browser-provided `file.type` (MIME type from FormData) for non-image uploads. Images are re-processed by `sharp` which validates content, but PDF, ZIP, and text attachments are stored using the client-declared MIME type without verifying the actual file content. A malicious user could upload an executable with a `.pdf` MIME type.

The `Content-Security-Policy: default-src 'none'` and `X-Content-Type-Options: nosniff` headers on file serving mitigate the browser-side risk, but the stored content itself is unverified.

**Fix:** Add magic-byte validation for non-image uploads (e.g., PDF must start with `%PDF-`, ZIP must start with `PK`). This was also flagged in the prior multi-perspective review as item 17 in the structurally-missing list.

### C1-CR-5: SSE events route uses in-memory Maps for connection tracking — no cross-instance coordination
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:26-29`
**Severity:** LOW | **Confidence:** MEDIUM

`activeConnectionSet`, `connectionInfoMap`, and `userConnectionCounts` are in-memory Maps. In a multi-instance deployment, these would be per-process and not shared, leading to incorrect connection counts and potential over-admission. The code already has a `useSharedCoordination` path for PostgreSQL-backed coordination, but the in-memory fallback still exists.

**Fix:** This is a known architectural concern (documented in the codebase). No immediate fix needed — the PostgreSQL coordination path exists. Deferring until multi-instance is validated.

### C1-CR-6: `console.error` / `console.warn` in client components (24 sites)
**File:** Multiple dashboard components
**Severity:** LOW | **Confidence:** HIGH

24 client-side `console.error` / `console.warn` calls across dashboard components. In production, these are visible to any user with DevTools open and may leak internal error messages or API response structures. The prior review cycle also tracked this as C1-AGG-3.

**Fix:** Replace with a structured client-side logger that can be disabled in production, or strip console calls in the production build via Next.js config.

---

## Code Quality Observations (No Severity — Positive)

- The `createApiHandler` wrapper is well-designed: auth, CSRF, rate limiting, body validation, and error handling in a single factory. 218 of 104 API routes use it.
- Recruiting token flow uses SHA-256 hashed tokens, atomic SQL claims with `NOW()` for clock-skew resistance, and per-request deduplication via `React.cache()` + `AsyncLocalStorage`.
- File upload handling includes ZIP bomb protection with decompressed-size validation and per-entry size caps.
- The encryption module properly separates `enc:`-prefixed values from legacy plaintext and throws in production on unencrypted input.
