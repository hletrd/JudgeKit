# Aggregate Review — RPF Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, critic, architect, debugger, designer, tracer, verifier, document-specialist, test-engineer (11 lanes; per-agent files in `.context/reviews/2026-05-03-cycle7/`).

**Cycle change surface:** 5 commits since cycle 6 close-out (`93d2a211..d2a85df8`): recruit results rate limiting, expired-but-redeemed re-entry, submissions offset query, sha256Hex docs, touch-friendly targets.

---

## Total deduplicated NEW findings (still applicable at HEAD `d2a85df8`)

**1 HIGH, 3 MEDIUM, 5 LOW.**

### AGG-1: Recruit start page missing rate limiting — token enumeration risk (HIGH)

**Confidence:** High | **Cross-agent:** SR-1, CR-1, CT-1, ARCH-1, DB-3, TR-1 (6 lanes)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:71`

The recruit start page performs a DB lookup of the invitation by token without any rate limiting. The results page (`results/page.tsx:66-71`) and the API endpoint (`/api/v1/recruiting/validate/route.ts:10`) both have rate limiting. The start page reveals the most information (assignment title, organization, contact email, problem count, language list) for valid tokens.

**Fix:** Add `checkServerActionRateLimit` keyed on client IP, matching the results page pattern. Return the "invalidToken" card when rate-limited.

---

### AGG-2: Submission detail page missing problem visibility check (MEDIUM)

**Confidence:** High | **Cross-agent:** SR-2, CR-3, CT-3, ARCH-2, TE-2, TR-2 (6 lanes)

**File:** `src/app/(public)/submissions/[id]/page.tsx:55-76`

Any authenticated user can access any submission by ID, including submissions for private problems. While source code and compile output are hidden from non-owners, the page reveals problem title, language, score, status, and execution metrics. The list page properly filters guests to public-problem submissions, but the detail page has no equivalent guard.

**Fix:** For non-owners, add a visibility check: if `problem.visibility !== 'public'`, return `notFound()`.

---

### AGG-3: Brute-force lockout counter not reset on success (MEDIUM)

**Confidence:** High | **Cross-agent:** SR-3, CR-4, CT-4, ARCH-3, DB-1, TE-3 (6 lanes)

**File:** `src/lib/assignments/recruiting-invitations.ts:483-489`

The `_sys.failedRedeemAttempts` counter is incremented on failed password attempts but never reset on successful authentication. A candidate who accumulates 5 total failures across sessions (even with successful logins in between) is permanently locked out with no admin recovery path.

**Fix:** Reset `_sys.failedRedeemAttempts` to 0 after successful password verification in the re-entry path (after line 489). Also consider resetting after the initial redeem success.

---

### AGG-4: generateMetadata shows "Expired" for expired-but-redeemed tokens (MEDIUM)

**Confidence:** High | **Cross-agent:** CR-6, SR-4, CT-2, ARCH-4, DB-2, DES-1, TE-4 (7 lanes — highest cross-agent agreement this cycle)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:38-39`

The page body's `isRedeemed` check (line 105) correctly bypasses the expiry gate for redeemed tokens (C6-3 fix), but `generateMetadata` (line 38) does not apply this same check. The browser tab shows "Expired" while the page body shows the re-entry form.

**Fix:** Add `isRedeemed` check in `generateMetadata` before the expiry check, consistent with the page body.

---

### AGG-5: Dynamic import of `next/headers` in RSC is unnecessary (LOW)

**Confidence:** High | **Cross-agent:** CR-5, SR-5 (2 lanes)

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:63-64`

The dynamic `await import("next/headers")` can be replaced with a static import. RSCs support static imports from `next/headers`.

**Fix:** Replace `const { headers } = await import("next/headers")` with `import { headers } from "next/headers"` at the top of the file.

---

### AGG-6: `checkServerActionRateLimit` JSDoc says "keyed on userId" but is used with IP (LOW)

**Confidence:** Medium | **Cross-agent:** DS-2 (1 lane)

**File:** `src/lib/security/api-rate-limit.ts:240-243`

The JSDoc says the function is "Keyed on userId + actionName" but the recruit results page passes `clientIp` as the first argument. The parameter name `userId` is misleading.

**Fix:** Update JSDoc to clarify the first parameter is a generic rate-limit key. Consider renaming `userId` to `key`.

---

### AGG-7: No test for submission visibility on detail page (LOW)

**Confidence:** Medium | **Cross-agent:** TE-2 (1 lane, but widely agreed upon in review discussion)

**File:** Test coverage gap

No test verifies that non-owners cannot access private-problem submission metadata via the detail page.

**Fix:** Add component or integration test verifying non-owners get 404 for private-problem submissions.

---

### AGG-8: No test for brute-force counter reset on success (LOW)

**Confidence:** High | **Cross-agent:** TE-3 (1 lane)

**File:** Test coverage gap

No test specifies or verifies the expected behavior for the brute-force counter on successful authentication.

**Fix:** Add test verifying counter resets to 0 after successful re-entry.

---

### AGG-9: No test for generateMetadata consistency with page body (LOW)

**Confidence:** Medium | **Cross-agent:** TE-4 (1 lane)

**File:** Test coverage gap

No test verifies that `generateMetadata` returns the correct title for expired-but-redeemed tokens.

**Fix:** Add test verifying "Claimed" title (not "Expired") for expired-but-redeemed tokens.

---

## Carry-forward DEFERRED items (status verified at HEAD `d2a85df8`)

| ID | Severity | File+line (corrected for HEAD) | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| F3 | MEDIUM | `src/lib/assignments/recruiting-invitations.ts` (PII fields) | DEFERRED | Schema migration cycle |
| F5 | MEDIUM | `src/lib/auth/config.ts` (JWT callback DB query) | DEFERRED | Auth caching design; **fix must live OUTSIDE `src/lib/auth/config.ts`** per CLAUDE.md |
| F6 | LOW | Deploy scripts | DEFERRED | Operator action |
| F8 | LOW | API route rate limiting | DEFERRED | Gradual hardening; partially addressed by AGG-1 this cycle |
| F10 | LOW | File validation test coverage | DEFERRED | Ongoing |
| C6-7 | LOW | Compiler stdin newline appending | DEFERRED | Compiler refactor cycle |
| C6-8 | LOW | Misleading public route group for auth submission detail | DEFERRED | Route reorganization cycle |
| C6-9 | LOW | CSRF origin rejection impact on non-browser clients | DEFERRED | API client survey |
| C6-10 | LOW | Privacy page hardcoded retention periods | DEFERRED | Dynamic lookup from system settings |
| C3-AGG-2 | LOW | `deploy-docker.sh:204-214` SSH credential-validation footgun | DEFERRED | Deploy script hardening cycle |
| C3-AGG-3 | LOW | `deploy-docker.sh:165-178` ControlSocket cleanup ordering | DEFERRED | Deploy script hardening cycle |
| C3-AGG-5 | LOW | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | Deploy script consolidation |
| C3-AGG-6 | LOW | `deploy-docker.sh:151` peer-user awareness | DEFERRED | Multi-tenant deploy cycle |
| C2-AGG-5 | LOW | Polling components | DEFERRED | Telemetry signal or 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites | DEFERRED | Observability cycle |
| C5-SR-1 | LOW | `scripts/deploy-worker.sh:101-107` sed delimiter | DEFERRED | Deploy script hardening cycle |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew | DEFERRED | Auth-perf cycle; **fix must live OUTSIDE `src/lib/auth/config.ts`** |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB query per request | DEFERRED | Auth-perf cycle; **fix must live OUTSIDE `src/lib/auth/config.ts`** |
| AGG-2 (C6) | MEDIUM | `src/lib/security/api-rate-limit.ts` rate-limit consolidation | DEFERRED | Rate-limit-time cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw API route handlers | DEFERRED | API-handler refactor cycle |
| PERF-3 | MEDIUM | Anti-cheat route gap query | DEFERRED | Anti-cheat dashboard perf cycle |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI |
| 24 pre-existing test failures | LOW | Various | DEFERRED | Investigation cycle |

No HIGH or MEDIUM security/correctness/data-loss findings deferred this cycle.

---

## Cross-agent agreement summary (cycle 7)

- **AGG-1 (recruit start page rate limiting)**: 6-lane consensus (SR, CR, CT, ARCH, DB, TR)
- **AGG-2 (submission detail visibility)**: 6-lane consensus (SR, CR, CT, ARCH, TE, TR)
- **AGG-3 (brute-force counter reset)**: 6-lane consensus (SR, CR, CT, ARCH, DB, TE)
- **AGG-4 (generateMetadata divergence)**: 7-lane consensus — highest agreement (CR, SR, CT, ARCH, DB, DES, TE)
- **AGG-5 (dynamic import)**: 2-lane agreement (CR, SR)
- All prior cycle fixes verified at HEAD by verifier lane

## Agent failures

None. All 10 reviewer perspectives produced artifacts in `.context/reviews/2026-05-03-cycle7/`.

---

## Implementation queue for PROMPT 3

**Implementing this cycle:**
1. **AGG-1** — Add rate limiting to recruit start page (HIGH, security)
2. **AGG-2** — Add visibility check to submission detail page (MEDIUM, security)
3. **AGG-3** — Reset brute-force counter on success (MEDIUM, correctness)
4. **AGG-4** — Fix generateMetadata for expired-but-redeemed tokens (MEDIUM, UX/correctness)
5. **AGG-5** — Replace dynamic import with static import (LOW, code quality)
6. **AGG-6** — Fix checkServerActionRateLimit JSDoc (LOW, documentation)

**Deferrable (test-only, carried in plan):**
- AGG-7, AGG-8, AGG-9 — Test coverage gaps (LOW)
