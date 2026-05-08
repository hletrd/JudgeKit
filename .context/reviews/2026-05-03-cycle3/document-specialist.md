# Document Specialist Review — Cycle 3 (2026-05-03)

**HEAD reviewed:** `ae528d9b`

---

## C3-DOC-1 (LOW, HIGH) — Privacy page data retention periods are hardcoded and may diverge from actual settings

**File:** `src/app/(public)/privacy/page.tsx:35-40`

The retention periods displayed on the privacy page (90, 30, 180, 365 days) are hardcoded. The actual retention periods are configured via system settings (`src/lib/data-retention.ts`, `src/lib/data-retention-maintenance.ts`). If an operator changes a retention period in the admin settings, the privacy page will show stale/incorrect information.

This is a documentation-code mismatch — the "documentation" (privacy page) does not reflect the actual runtime behavior.

**Fix:** Read retention periods from the same config that `startSensitiveDataPruning` uses, or at minimum add a comment in the code noting that these values must be kept in sync with the system settings.

---

## C3-DOC-2 (INFO, MEDIUM) — `ALWAYS_REDACT` excludes `judgeWorkers` secrets without documentation

**File:** `src/lib/db/export.ts:256-262`

`SANITIZED_COLUMNS` includes `judgeWorkers: new Set(["secretTokenHash", "judgeClaimToken"])` but `ALWAYS_REDACT` does not. There is no comment explaining why worker secrets are included in full-fidelity backups but not in the always-redact set. This could confuse future maintainers into thinking it's an oversight.

**Fix:** Add a comment explaining the design decision (e.g., "Worker secrets are retained in full-fidelity backups because restore requires re-registering workers; sanitized exports already redact them").

---

## C3-DOC-3 (INFO, LOW) — `incrementFailedRedeemAttempt` JSDoc mentions "counter persists across retries" but does not mention the race condition

**File:** `src/lib/assignments/recruiting-invitations.ts:29-33`

The JSDoc says the counter "persists across retries and eventually locks the token" but does not document the non-atomic nature of the update or the risk of concurrent bypass. Adding a note would help future maintainers understand the limitation.

**Fix:** Add a `@limitations` section to the JSDoc noting the non-atomic read-modify-write pattern and the planned fix (atomic SQL update).
