# Security Review: JudgeKit

**Reviewer:** security-reviewer
**Date:** 2026-05-11
**Scope:** Security findings — Cycle 1 of RPF loop

---

## New Findings Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 1     |
| **Total**| **2** |

---

## MEDIUM

### S1: Deploy Script First-Deploy Missing COMPILER_RUNNER_URL
- **File:** `deploy-docker.sh:453-520`
- **Confidence:** Medium
- **Description:** When deploying to algo.xylolabs.com for the first time (or after wiping the remote `.env.production`), the `COMPILER_RUNNER_URL` environment variable is not reliably injected into the remote `.env.production`. The `ensure_env_literal` helper runs before `.env.production` is transferred and only backfills keys that are completely absent. If the transferred `.env.production` lacks the key (which the repo's `.env.production` does), the app starts without a valid `COMPILER_RUNNER_URL`, causing the judge subsystem to be unreachable.
- **Security impact:** A failed or misconfigured judge worker connection could cause submissions to hang indefinitely, leading to a denial-of-service condition for the core judging functionality. An attacker aware of this window could time a submission to exploit the hung state.
- **Fix:** Ensure `COMPILER_RUNNER_URL` is always present in the remote `.env.production` after transfer, regardless of whether it's a first deploy. Add a post-transfer validation step that backfills the key if missing.

---

## LOW

### S2: verify-email Token Not Validated Before Fetch
- **File:** `src/app/(auth)/verify-email/page.tsx:31`
- **Confidence:** Low
- **Description:** The verify token is sent to the server via a POST request without client-side format validation (e.g., minimum length, allowed characters). While the server validates it, client-side validation could prevent unnecessary network requests.
- **Fix:** Add a minimal client-side length/format check before calling the API.

---

## No Critical or High Security Findings

After thorough review of the recently changed surfaces (SMTP verification flow, API client refactoring, admin workers panel, submission auto-refresh), no new CRITICAL or HIGH severity security issues were identified. Previous security hardening (CSRF, API key revocation, file sanitization, shell validation) remains intact.
