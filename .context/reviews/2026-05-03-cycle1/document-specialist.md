# Document Specialist Review — Cycle 1 (2026-05-03)

**Reviewer:** document-specialist
**Scope:** Doc/code mismatches against authoritative sources
**HEAD:** 689cf61d

---

## Findings

### C1-DS-1: `docker/client.ts` remote path validation comment references wrong prefix
**File:** `src/lib/docker/client.ts:349`
**Severity:** LOW | **Confidence:** HIGH

The remote `buildDockerImage()` path checks `dockerfilePath.startsWith("docker/Dockerfile.")` but does not have a comment explaining why it uses a less restrictive prefix than the local path (which uses `"docker/Dockerfile.judge-"`). The local path has a detailed comment explaining the `judge-` infix restriction, but the remote path has no corresponding documentation.

**Fix:** Add a comment to the remote path explaining the validation choice, or align the validation to match the local path.

### C1-DS-2: Privacy page exists but production is not updated
**File:** `src/app/(public)/privacy/page.tsx`
**Severity:** LOW | **Confidence:** HIGH

The privacy page was added in commit `689cf61d` and is linked from the footer. However, production is not yet deployed with this code. The v2 review confirmed `/privacy` returns 404 on `algo.xylolabs.com`. This is a deployment gap, not a code issue.

**Fix:** Deploy HEAD to production.

---

## Verified Documentation

- `SECURITY.md` exists and accurately describes the security model
- `CLAUDE.md` project rules are respected in the codebase (Korean letter-spacing, auth/config.ts preservation, server architecture)
- The encryption module JSDoc (added in prior cycle) accurately describes the plaintext fallback risk profile
