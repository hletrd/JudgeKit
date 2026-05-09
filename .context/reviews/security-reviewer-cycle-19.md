# Security Review — Cycle 19/100

**Reviewer:** security-reviewer (manual — no agents registered)
**Date:** 2026-05-09
**Base commit:** 75d82a17
**Current HEAD:** def9d906

---

## Scope

Security-focused review of changed files:
- Auth pipeline (`public-signup.ts`, `api/handler.ts`)
- Secret handling (`plugins/secrets.ts`)
- File storage (`files/storage.ts`)
- Docker API (`docker/client.ts`, `admin/docker/images/prune/route.ts`)
- Rate limiting (`security/rate-limit.ts`, `security/api-rate-limit.ts`, `security/rate-limit-core.ts`)
- hCaptcha (`security/hcaptcha.ts`)
- Chat widget (`api/v1/plugins/chat-widget/chat/route.ts`)
- SSE events (`api/v1/submissions/[id]/events/route.ts`)
- Compiler sandbox (`compiler/execute.ts`)

---

## Findings

### No new MEDIUM or HIGH security findings identified.

### Verification of Prior Fixes

| Finding | Status | Evidence |
|---------|--------|----------|
| C18-1 Plugin secret plaintext fallback | FIXED | Production guard throws in production; tests cover all paths |
| C18-5 Path traversal | FIXED | Allowlist regex rejects leading dots, path separators, control chars |
| C18-6 Prune route path construction | FIXED | `isAllowedJudgeDockerImage` validates repository before `join()` |
| B2 Admin routes `needsRehash` | FIXED | `verifyAndRehashPassword` transparently handles rehashing |
| B4 Internal cleanup rate limiting | FIXED | `consumeApiRateLimit` called at `src/app/api/internal/cleanup/route.ts:44` |

### Minor Observations (LOW)

1. **`src/hooks/use-keyboard-shortcuts.ts` — shortcut bypass potential**
   - A focused CodeMirror editor (`.cm-content`) blocks shortcuts, but other rich text editors or custom focus traps without the `.cm-content` class would not be caught.
   - Confidence: LOW. No such editors are currently in use.

2. **`src/lib/docker/client.ts` — `isValidImageReference` allows colon in registry tag**
   - Regex `/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]+$/` allows `:` which could allow registry-prefixed images like `registry.example.com:5000/image`. This is intentional for legitimate registry prefixes but widens the surface slightly.
   - Confidence: LOW. The `validateDockerfilePath` function further restricts build paths.

---

## Verdict

Security posture remains strong. All previously identified issues are resolved and verified. No new vulnerabilities found.
