# Critic Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** critic
**Base commit:** c176d8f5

## CRI-1: Bulk invitation `MAX_EXPIRY_MS` guard missing for `expiryDays` path [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1)

**Description:** The bulk invitation route checks `MAX_EXPIRY_MS` only when `expiryDate` is set, not when `expiryDays` is used. The single-create route checks both paths. This is a defense-in-depth inconsistency. The Zod schema's `max(3650)` makes this safe today, but the missing guard is an architectural gap.

**Confidence:** Medium

---

## CRI-2: "Un-revoke" invitation feature is broken — state machine allows it but library rejects it [MEDIUM/MEDIUM]

**Description:** The PATCH route's state machine allows `revoked -> pending` transitions, but `updateRecruitingInvitation` hardcodes `WHERE status = 'pending'`, which rejects the update with a misleading error. Either the "un-revoke" feature is intentional (in which case the library function is buggy) or it's unintentional (in which case the route's state machine should not list "pending" as an allowed target from "revoked").

**Concrete failure scenario:** An instructor revokes an invitation by mistake and tries to un-revoke it. The UI appears to allow this (no client-side guard), but the server returns an opaque error.

**Confidence:** Medium

---

## CRI-3: Exam session route fetches assignment twice when exam mode is "none" [LOW/MEDIUM]

**Description:** The exam session POST route does not check `examMode` before calling `startExamSession`, causing an extra DB query for non-exam assignments. This is a minor efficiency concern, not a bug.

**Confidence:** Low

---

## CRI-4: API key dialog auto-dismiss has no visual countdown [LOW/LOW]

**Description:** The 5-minute auto-dismiss timer added in cycle 38 (AGG-4) clears the raw key from state but provides no visible countdown to the admin. They may not realize the key will disappear. This was noted as "optional" in the original plan.

**Confidence:** Low (UX polish, not a bug)

---

## Overall Assessment

The codebase is in good shape after 38 cycles of remediation. New findings are primarily defense-in-depth gaps and architectural inconsistencies rather than critical bugs. The most actionable item is the missing `MAX_EXPIRY_MS` guard in the bulk route (CRI-1/CR-1/SEC-1).
