# Cycle 10 — Comprehensive Code Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `1d5fe1e2` (most recent: test(auth): update change-password test)
**Scope:** Full repository deep review across security, correctness, performance, architecture, UI/UX, documentation, and testing.

---

## C10-1. Privacy page hardcoded retention periods — data-class mismatch risk (MEDIUM, High confidence)

**File:** `src/app/(public)/privacy/page.tsx:39-44`

```tsx
const dataClasses = [
  { key: "auditLogs", retention: "90" },
  { key: "aiChatLogs", retention: "30" },
  { key: "antiCheatEvents", retention: "180" },
  { key: "recruitingInvitations", retention: "365" },
  { key: "submissions", retention: "365" },
] as const;
```

These values are hardcoded strings, not derived from `DATA_RETENTION_DAYS` in `src/lib/data-retention.ts`. If an operator changes a retention period via environment variables (e.g., `AUDIT_EVENT_RETENTION_DAYS=180`), the privacy page will display the wrong period. The code already has a comment on line 35-37 acknowledging this, but no enforcement exists.

**Fix:** Derive retention values from `DATA_RETENTION_DAYS` on the server and pass them to the component, or add a runtime assertion that the hardcoded values match the configured values (failing loudly in dev).

---

## C10-2. Privacy page missing `loginEvents` data class (LOW, High confidence)

**File:** `src/app/(public)/privacy/page.tsx:38-44`

The `DATA_RETENTION_DAYS` object in `src/lib/data-retention.ts` defines six retention categories: `auditEvents`, `chatMessages`, `antiCheatEvents`, `recruitingRecords`, `submissions`, and `loginEvents`. The privacy page only lists five -- `loginEvents` (180-day retention) is missing. This is a data-transparency gap: users are not informed about the retention of their login event history.

**Fix:** Add `loginEvents` to the `dataClasses` array with retention `"180"`.

---

## C10-3. `recruiting-results.ts` `computeRecruitResultsTotals` -- NaN propagation from `mapSubmissionPercentageToAssignmentPoints` (MEDIUM, Medium confidence)

**File:** `src/lib/assignments/recruiting-results.ts:86`

```ts
const adjusted = mapSubmissionPercentageToAssignmentPoints(best.score, points);
```

If `best.score` is NaN or infinity (e.g., from a corrupted submission record), `mapSubmissionPercentageToAssignmentPoints` will propagate NaN through the `totalScore` accumulator. The cycle-3 review added a NaN guard to `mapSubmissionPercentageToAssignmentPoints`, but this function still does not validate that `best.score` is a finite number before passing it.

**Fix:** Add a `Number.isFinite(best.score)` guard before calling `mapSubmissionPercentageToAssignmentPoints`, skipping the entry if the score is not a finite number.

---

## C10-4. `recruiting-invitations.ts` `updateRecruitingInvitation` allows metadata overwrite that removes `_sys.*` keys (LOW, Medium confidence)

**File:** `src/lib/assignments/recruiting-invitations.ts:293-330`

The `updateRecruitingInvitation` function accepts a `metadata` field that replaces the entire metadata object. While `findInternalKeyViolation` prevents `_sys.` prefixed keys from being injected, an admin could indirectly remove existing `_sys.` keys (like the `failedRedeemAttempts` counter or `accountPasswordResetRequired` flag) because the replacement is a full object overwrite, not a merge.

**Scenario:** An admin updates invitation metadata with `{"note": "follow up"}`. This replaces the entire metadata, removing `_sys.accountPasswordResetRequired` and `_sys.failedRedeemAttempts`. The brute-force counter would be reset to zero.

**Fix:** Merge the new metadata with existing metadata rather than replacing it, or preserve `_sys.*` keys during the update.

---

## C10-5. `seo.ts` `buildSocialImageUrl` -- no URL length validation (LOW, Low confidence)

**File:** `src/lib/seo.ts:124-152`

The function builds a `/og?params` URL with query parameters. If all options are provided with maximum-length strings, the URL could exceed browser/server URL length limits (typically 2048-8192 characters). The `summarizeTextForMetadata` function truncates individual values, but the combined URL could still be very long.

**Fix:** Add a total URL length check and truncate or omit optional parameters if the URL exceeds a safe limit.

---

## Items reviewed and confirmed as no-action / known deferred

| Item | Verdict |
|---|---|
| `incrementFailedRedeemAttempt` uses `sql.raw` with module constant | Safe -- constant is not user input |
| `encryption.ts` decrypt plaintext fallback | Known deferred (C7-AGG-7) |
| JWT callback DB query on every refresh | Known deferred (D2/F5) |
| `getDbNowUncached()` vs `getDbNowMs()` in recruiting | Correct for respective column types |
| `createApiHandler` auth enforcement | Well-designed, defaults to true |
| `system-settings-config.ts` cache uses `Date.now()` | Correct -- in-process cache TTL |
| `sanitize-html.ts` IMG src restriction | Intentional security design |
| `RUNNER_AUTH_TOKEN` debug log | No secret exposure |
| `api-key-auth.ts` fire-and-forget `lastUsedAt` | Acceptable for non-critical metadata |
| `realtime-coordination.ts` SSE in rateLimits table | Pragmatic reuse, LOW concern |
| `recruiting/validate` timing side channel | LOW, mitigated by rate limiting |

---

## Summary of NEW actionable findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C10-1 | MEDIUM | High | `src/app/(public)/privacy/page.tsx` | Hardcoded retention periods may diverge from configured values |
| C10-2 | LOW | High | `src/app/(public)/privacy/page.tsx` | Missing `loginEvents` data class on privacy page |
| C10-3 | MEDIUM | Medium | `src/lib/assignments/recruiting-results.ts` | No NaN/finite guard before score computation |
| C10-4 | LOW | Medium | `src/lib/assignments/recruiting-invitations.ts` | Metadata update overwrites `_sys.*` keys |
| C10-5 | LOW | Low | `src/lib/seo.ts` | Social image URL may exceed length limits |

No HIGH severity findings. No security vulnerabilities found beyond known deferred items.
