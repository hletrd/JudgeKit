# Aggregate Review — Cycle 4 (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, critic, architect, debugger, verifier, tracer, test-engineer, document-specialist, designer (11 lanes; per-agent files in `.context/reviews/2026-05-03-cycle4/<agent>.md`).

---

## Total deduplicated NEW findings (applicable at HEAD `11d9b33a`)

**1 HIGH, 3 MEDIUM, 7 LOW NEW.**

---

## Deduplicated Findings (merged across agents, preserving highest severity)

### F1 (HIGH, HIGH confidence) — `updateRecruitingInvitation` skips `_sys.` namespace validation on metadata — brute-force lockout bypassable
**Cross-agent agreement:** C4-CR-1, C4-SEC-1, C4-CRIT-1, C4-DBG-1, C4-VER-1, C4-TR-1, C4-ARCH-1, C4-TE-1 (8 lanes)

`createRecruitingInvitation` and `bulkCreateRecruitingInvitations` call `findInternalKeyViolation()` to reject metadata keys starting with `_sys.`, but `updateRecruitingInvitation` writes `data.metadata` directly without this check. The PATCH route's Zod schema (`z.record(z.string(), z.string())`) also does not enforce the constraint. An attacker with `recruiting.manage_invitations` can set `_sys.failedRedeemAttempts: "0"` to reset the brute-force counter or `_sys.accountPasswordResetRequired: "true"` to force a password reset.

**Fix:** Add `findInternalKeyViolation()` check in `updateRecruitingInvitation` before line 268. Consider adding a `refine()` to `updateRecruitingInvitationSchema` as well. Add a test verifying the update path rejects `_sys.` keys.

---

### F2 (MEDIUM, HIGH confidence) — Two files use inline `createHash("sha256")` instead of shared `hashToken` module
**Cross-agent agreement:** C4-CR-2, C4-SEC-3 (partial), C4-DBG-2, C4-VER-2, C4-TR-2, C4-CRIT-3 (6 lanes)

`src/app/api/v1/recruiting/validate/route.ts:2,21` and `src/lib/auth/recruiting-token.ts:1,33` use inline `createHash("sha256")` instead of the shared `hashToken` from `src/lib/security/token-hash.ts` (extracted in cycle 3). If the hash algorithm changes, these two call sites will silently diverge from the stored `tokenHash`, breaking the validate endpoint and audit-log correlation.

**Fix:** Replace inline `createHash("sha256")...` with `import { hashToken } from "@/lib/security/token-hash"` in both files. In `recruiting-token.ts:33`, use `hashToken(token).slice(0, 8)` for the fingerprint.

---

### F3 (MEDIUM, HIGH confidence) — Recruiting start page `mailto:` link missing `rel="nofollow"`
**Cross-agent agreement:** C4-SEC-2, C4-CRIT-2, C4-VER-3, C4-UX-1 (4 lanes)

`src/app/(auth)/recruit/[token]/page.tsx:231` has a `mailto:${assignment.contactEmail}` anchor without `rel="nofollow"`. Cycle 2 fixed the recruiter contact email, cycle 3 fixed the privacy page email, but the recruit start page was missed. This is the third instance of the same pattern — suggesting a systematic check is needed.

**Fix:** Add `rel="nofollow"` to the anchor tag at line 231. Also do a comprehensive search for any remaining `mailto:` links missing `rel="nofollow"`.

---

### F4 (MEDIUM, MEDIUM confidence) — No test for `_sys.` namespace validation on any recruiting path
**Cross-agent agreement:** C4-TE-1, C4-TE-2 (2 lanes)

Neither `createRecruitingInvitation`/`bulkCreateRecruitingInvitations` (existing guard) nor `updateRecruitingInvitation` (missing guard) have tests verifying that `_sys.` keys are rejected. The `incrementFailedRedeemAttempt` atomic counter also lacks concurrent integration tests (carry-forward from C3-F4).

**Fix:** Add unit/integration tests for: (a) `_sys.` key rejection on create/update paths, (b) concurrent `incrementFailedRedeemAttempt` counter correctness.

---

### F5 (LOW, HIGH confidence) — `sql.raw(FAILED_REDEEM_ATTEMPTS_KEY)` should document its safety
**Cross-agent agreement:** C4-SEC-3, C4-DOC-1 (2 lanes)

`sql.raw()` is inherently dangerous and a future developer could inadvertently pass user input through it. Adding a brief comment documenting why this usage is safe would prevent false-positive security reviews.

**Fix:** Add a comment: `// sql.raw is safe here: FAILED_REDEEM_ATTEMPTS_KEY is a module-level constant, not user input.`

---

### F6 (LOW, MEDIUM confidence) — `recruiting-request-cache.ts` single-user-per-request limitation undocumented
**Cross-agent agreement:** C4-CR-4 (1 lane)

The `recruitingContextStore` holds exactly one user's context. `setCachedRecruitingContext` silently overwrites any existing context. This is acceptable for the current single-user-per-request pattern but should be documented.

**Fix:** Add a JSDoc note on `setCachedRecruitingContext` explaining the single-user constraint.

---

### F7 (LOW, MEDIUM confidence) — Public submissions page runs unbounded `selectDistinct` for language filter
**Cross-agent agreement:** C4-PERF-1 (1 lane)

`src/app/(public)/submissions/page.tsx:140-146` runs `SELECT DISTINCT language FROM submissions` with no limit on every page load. As the submissions table grows, this becomes progressively slower.

**Fix:** Query `languageConfigs` (or the cached config) instead of `submissions` for language filter options.

---

### F8 (LOW, LOW confidence) — `getPeriodStart` uses app-server time instead of DB time
**Cross-agent agreement:** C4-PERF-2 (1 lane)

`src/app/(public)/submissions/page.tsx:65-86` creates `Date` objects using `new Date()` while the main query uses `getDbNow()`. Clock skew between app and DB servers could cause period-boundary inconsistencies.

**Fix:** Low priority. Derive period start from the DB time value already fetched.

---

### F9 (LOW, MEDIUM confidence) — Public submissions feed may expose `compileOutput` to guests
**Cross-agent agreement:** C4-UX-2 (1 lane)

The public submission feed selects `compileOutput` from submissions. Compiler errors may contain source code fragments that guests should not see.

**Fix:** Verify that `SubmissionStatusBadge` does not render `compileOutput` for guest viewers, or exclude the field for guests.

---

### F10 (LOW, LOW confidence) — Public submissions page exposes user names to guests
**Cross-agent agreement:** C4-SEC-4 (1 lane)

The public feed joins `users` and returns `users.name`. This may conflict with privacy expectations in some educational settings. Appears intentional given the "Student" column in the table.

**Fix:** Design/policy question. If names should not be public, add guest-specific filtering. Low priority.

---

### F11 (LOW, LOW confidence) — Two rate-limit modules share a table but have different semantics
**Cross-agent agreement:** C4-ARCH-2 (1 lane)

Known documented divergence (C7-AGG-9). No action needed this cycle.

---

## Carry-forward DEFERRED items (status verified at HEAD `11d9b33a`)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| F2 (C1/C2) | MEDIUM | `recruiting-invitations.ts` candidateName/Email | DEFERRED | Dedicated encryption-migration cycle OR compliance requirement |
| F5 (C1/C2) | MEDIUM | `auth/config.ts:399` JWT DB query | DEFERRED | Auth-perf cycle |
| C1-F7 | LOW | Client console.error (24 sites) | DEFERRED | Telemetry/observability cycle |
| C1-F8 | LOW | SSE cleanup timer | DEFERRED | Next SSE feature work |
| C1-F9 | LOW | SSE poll timer interval | DEFERRED | Next SSE feature work |
| C2-F9 | LOW | Inconsistent `updatedAt` handling | DEFERRED | DB schema maintenance cycle |
| C2-F10 | LOW | File route bypasses `createApiHandler` | DEFERRED | Next file-route modification |
| C2-F11 | LOW | API key role escalation | DEFERRED | API key feature review cycle |
| C2-F12 | LOW | Recruiting metadata unvalidated JSONB | DEFERRED | Recruiting feature expansion cycle |
| C2-F13/F11 | LOW | `DATABASE_PATH` derivation | DEFERRED | Infrastructure config audit cycle |
| C2-F14/F15 | LOW | Missing tests for redeem/audit | DEFERRED | Integration test suite setup |
| C2-F17 | LOW | Score decimal places | DEFERRED | Next scoring display change |
| AGG-2 | LOW | Date.now caching | DEFERRED | Rate-limit module touched 2 more times |
| C3-AGG-5 | LOW | deploy-docker.sh size | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 | LOW | deploy-docker.sh multi-tenant | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | Practice page perf | DEFERRED | p99 > 1.5s OR > 5k problems |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew | DEFERRED | Auth-perf cycle |

---

## Plan-vs-implementation reconciliation

Cycle 1: 10 findings, 5 implemented, 5 deferred.
Cycle 2: 18 findings, 7 implemented, 11+carry-forward deferred.
Cycle 3: 12 findings (1 HIGH, 3 MEDIUM, 8 LOW), all implementable ones fixed.
This cycle: 11 new findings (1 HIGH, 3 MEDIUM, 7 LOW) plus carries forward all prior deferred items.

Note on F1: This is HIGH severity and directly undermines the cycle 2-3 brute-force lockout fix. It must NOT be deferred — it must be implemented this cycle.
