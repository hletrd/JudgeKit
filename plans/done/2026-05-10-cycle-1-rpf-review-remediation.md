# Cycle 1 RPF Review Remediation Plan

**Date:** 2026-05-10
**Based on:**
- `.context/reviews/_perspective-aggregate-2026-05-10.md` (192 findings from 6 perspectives)
- `.context/reviews/_aggregate.md` (30 new findings from this cycle's deep review)
**Scope:** Prioritize CRITICAL and HIGH severity, especially student-facing issues, anti-cheat false positives, and security findings.

---

## Implementation Lane 1: Student-Facing CRITICALs (Timer + Anti-cheat)

### 1.1 Fix SSE parse failure to trigger fetch fallback
**Severity:** CRITICAL (new finding)
**File:** `src/hooks/use-submission-polling.ts:143-149`
**Description:** When JSON.parse fails on SSE message, polling stops with no fallback.
**Fix:** Call `startFetchPolling()` in the parse-failure catch block.
**Estimated effort:** 15 min
**Status:** completed

### 1.2 Add grace period before tab-switch warning fires
**Severity:** CRITICAL (student perspective #3)
**File:** `src/components/exam/anti-cheat-monitor.tsx:208-215`
**Description:** Every visibilitychange to hidden immediately fires reportEvent("tab_switch") with no grace period.
**Fix:** Add 3-second debounce before reporting tab_switch. Clear the debounce timer on visibilitychange to visible.
**Estimated effort:** 30 min
**Status:** completed

### 1.3 Fix code snapshot POST silent failure
**Severity:** CRITICAL (student perspective #6)
**File:** `src/components/problem/problem-submission-form.tsx:128-132`
**Description:** Code snapshot POST errors are silently swallowed with `.catch(() => {})`.
**Fix:** Add retry with exponential backoff (max 3 attempts). Show subtle connectivity indicator.
**Estimated effort:** 45 min
**Status:** completed

### 1.4 Re-sync exam timer with server on tab refocus
**Severity:** CRITICAL (student perspective #1)
**File:** `src/components/exam/countdown-timer.tsx:83-96,183-186`
**Description:** Timer fetches server time once at mount but never re-syncs on visibilitychange.
**Fix:** Re-fetch `/api/v1/time` on every `visibilityState === 'visible'` event, recalculate offset.
**Estimated effort:** 30 min
**Status:** completed

### 1.5 Fix timer threshold toast spam on tab refocus
**Severity:** HIGH (student perspective #2)
**File:** `src/components/exam/countdown-timer.tsx:120-161`
**Description:** When tab regains focus, all crossed thresholds fire toasts staggered 2s apart.
**Fix:** On tab refocus, only show the most urgent crossed threshold. Suppress if tab was hidden >30s.
**Estimated effort:** 30 min
**Status:** completed

---

## Implementation Lane 2: Security Findings

### 2.1 Add `tokenInvalidatedAt` check to API key authentication
**Severity:** HIGH (security-researcher H1)
**File:** `src/lib/api/api-key-auth.ts:66-131`
**Description:** API keys remain valid after user session revocation.
**Fix:** Add check: if `user.tokenInvalidatedAt > apiKey.createdAt`, reject the API key.
**Estimated effort:** 20 min
**Status:** completed

### 2.2 Fix `$VAR` bypass in shell command validation
**Severity:** HIGH (security-researcher H2)
**File:** `src/lib/compiler/execute.ts:170-175`
**Description:** `validateShellCommand` regex misses unbraced variable expansion `$VAR`.
**Fix:** Add `$[A-Za-z_]` to the dangerous pattern regex.
**Estimated effort:** 15 min
**Status:** completed

### 2.3 Sanitize file `originalName` before Content-Disposition header
**Severity:** HIGH (security-researcher H5)
**File:** `src/app/api/v1/files/[id]/route.ts:107-125`
**Description:** Uploaded file's `originalName` is used directly in Content-Disposition header.
**Fix:** Strictly validate `originalName` on upload (reject control chars, newlines). Use the already-sanitized name from `contentDispositionAttachment`.
**Estimated effort:** 20 min
**Status:** completed

### 2.4 Harden test seed endpoint
**Severity:** HIGH (security-researcher H6)
**File:** `src/app/api/v1/test/seed/route.ts`
**Description:** Can create instructor users; no rate limiting.
**Fix:** Remove `instructor` from allowed roles. Add rate limiting.
**Estimated effort:** 20 min
**Status:** completed

---

## Implementation Lane 3: Code Quality + Logic

### 3.1 Fix Zod validation to return all errors
**Severity:** MEDIUM
**File:** `src/lib/api/handler.ts:163-166`
**Description:** Only first Zod error is returned.
**Fix:** Return `parsed.error.issues` array.
**Estimated effort:** 15 min
**Status:** completed

### 3.2 Fix file extension extraction for dotfiles
**Severity:** MEDIUM
**File:** `src/app/api/v1/files/[id]/route.ts:108`
**Description:** `.gitignore` returns empty extension; `tar.gz` returns `gz`.
**Fix:** Use `lastIndexOf('.')` based extraction.
**Estimated effort:** 10 min
**Status:** completed

### 3.3 Fix infinite polling retry without error classification
**Severity:** MEDIUM
**File:** `src/hooks/use-submission-polling.ts:267`
**Description:** Polling continues forever on 404/403.
**Fix:** Stop polling on 404/403. Only retry on 5xx and network errors.
**Estimated effort:** 20 min
**Status:** completed

### 3.4 Add try/catch around judge claim schema parse
**Severity:** MEDIUM
**File:** `src/app/api/v1/judge/claim/route.ts:261-263`
**Description:** Raw SQL parse can throw unhandled ZodError.
**Fix:** Wrap parse in try/catch, return specific error message.
**Estimated effort:** 15 min
**Status:** completed

---

## Implementation Lane 4: Test Coverage

### 4.1 Add unit tests for scoring logic
**Severity:** MEDIUM (HIGH impact)
**File:** `src/lib/judge/verdict.ts`
**Description:** No unit tests for scoring computation.
**Fix:** Create `tests/unit/judge/verdict.test.ts` with parameterized tests for all score scenarios.
**Estimated effort:** 45 min
**Status:** completed

---

## Deferred Findings (recorded, not scheduled)

The following findings are explicitly deferred per the deferred-fix rules:

### Deferred: Anti-cheat completely bypassable via direct API calls
**Severity:** CRITICAL (security-researcher C1)
**File:** `src/components/exam/anti-cheat-monitor.tsx`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
**Reason for deferral:** Requires architectural redesign (browser fingerprinting, challenge-response, server-side behavioral analysis). Not a code-level fix. The security-researcher review recommends this as a medium-term project.
**Exit criterion:** Design and implement server-side anti-cheat verification system.

### Deferred: Judge worker result fabrication (no HMAC)
**Severity:** CRITICAL (security-researcher C2)
**File:** `src/app/api/v1/judge/poll/route.ts`
**Reason for deferral:** Requires coordinated changes to both app server AND Rust worker binary. The worker path is baked into deployed binaries. Needs a migration plan across both components.
**Exit criterion:** Design HMAC protocol, implement in both TypeScript and Rust, coordinate deploy.

### Deferred: LLM Chat Widget data exfiltration
**Severity:** HIGH (security-researcher H3)
**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts`
**Reason for deferral:** The LLM feature is opt-in per assignment. The fix requires legal review (data processing agreements) and potentially an on-premise LLM option. Not a simple code change.
**Exit criterion:** Legal review complete; add explicit warnings; consider local LLM option.

### Deferred: IP spoofing via X-Forwarded-For
**Severity:** HIGH (security-researcher H4)
**File:** `src/lib/security/ip.ts:39-74`
**Reason for deferral:** Requires deployment documentation update and operator action (set correct `TRUSTED_PROXY_HOPS`). Code fix is to add validation, but the primary issue is configuration.
**Exit criterion:** Document exact proxy chain; add IP range validation; test in staging.

### Deferred: Docker build context exposes full repository
**Severity:** HIGH (security-researcher H7)
**File:** `src/lib/docker/client.ts:245-246`
**Reason for deferral:** Already tracked in prior cycle plans. Requires `.dockerignore` hardening and build process changes. Low immediate risk since builds happen on remote server.
**Exit criterion:** `.dockerignore` excludes `.git/`, `.env*`, and secrets; verify with `docker build --no-cache`.

### Deferred: Source code exposure to workers without encryption
**Severity:** HIGH (security-researcher H8)
**File:** `src/app/api/v1/judge/claim/route.ts:150-260`
**Reason for deferral:** Requires architectural change (one-time decryption tokens, TLS pinning). Not a simple code fix.
**Exit criterion:** Design end-to-end encryption for worker communication.

### Deferred: No custom validator/checker support
**Severity:** CRITICAL (instructor perspective #1)
**File:** `src/app/(public)/problems/create/create-problem-form.tsx`
**Reason for deferral:** Feature request requiring UI design, backend storage, and judge worker updates. Not a bug fix.
**Exit criterion:** Design spec for custom checker upload; implement UI + backend + worker support.

### Deferred: No per-student deadline extensions
**Severity:** CRITICAL (instructor perspective #2)
**File:** Assignment settings
**Reason for deferral:** Feature request requiring DB schema changes, UI updates, and scoring logic changes.
**Exit criterion:** Design and implement per-student override system.

### Deferred: No deploy rollback mechanism
**Severity:** CRITICAL (admin perspective #1)
**File:** `deploy-docker.sh`
**Reason for deferral:** Infrastructure feature requiring Docker image tagging strategy and blue/green deploy setup. Not a code bug.
**Exit criterion:** Implement tagged image retention; add rollback script.

### Deferred: No PITR / WAL archiving
**Severity:** CRITICAL (admin perspective #2)
**File:** Database infrastructure
**Reason for deferral:** Infrastructure feature requiring PostgreSQL configuration changes and storage provisioning.
**Exit criterion:** Configure WAL archiving; test point-in-time recovery.

### Deferred: All remaining LOW findings
**Severity:** LOW
**Files:** Various
**Reason for deferral:** Low user impact, cosmetic, or edge-case issues. Will be picked up in future cycles or as part of larger refactoring.
**Exit criterion:** Addressed in subsequent RPF cycles or as part of feature work.

---

## Archive Notes

- Prior cycle plans (cycles 25-48) remain in `plans/archive/` and `plans/closed/`.
- This plan supersedes any overlapping open items from earlier cycles.
- After implementation, archive this plan and create a new one for the next cycle.
