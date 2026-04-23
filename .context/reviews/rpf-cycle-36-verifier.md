# Verifier Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** verifier
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- Recruiting invitation routes (POST, POST bulk, PATCH)
- Stats endpoint
- SSE events route
- Chat widget
- Import/export routes
- Password rehash utility and all call sites

## Findings

### V-1: PATCH invitation route NaN guard missing — incomplete fix from cycle 35 [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:114`

**Description:** Evidence-based verification: searching for `new Date(\`.*expiryDate` across the codebase reveals 3 call sites. Two (POST single, POST bulk) have `Number.isFinite()` guards added in cycle 35. The PATCH route does not. This is a verified gap in the cycle 35 remediation.

The behavior of the PATCH route without the guard: `new Date("2026-01-01T00:00:00Z" + "T23:59:59Z")` produces `Invalid Date`. Then `Invalid Date <= dbNow` evaluates to `false` (NaN comparison), and `(NaN - dbNowMs) > MAX_EXPIRY_MS` evaluates to `false`. Both validations are silently bypassed.

**Fix:** Add the NaN guard identically to the POST routes.

**Confidence:** High

---

### V-2: Password rehash utility adoption incomplete — 4 of 6 sites still inline [MEDIUM/MEDIUM]

**File:** Multiple (see CR-2, ARCH-1, CRI-2)

**Description:** Verification: `verifyAndRehashPassword` is used in 2 files (import/route.ts, restore/route.ts). The remaining 4 call sites with `needsRehash` logic are backup/route.ts, migrate/export/route.ts, auth/config.ts, and recruiting-invitations.ts. The utility includes `logger.info` for rehash events; the inline versions don't log rehashes, creating an audit trail gap.

**Fix:** Replace all inline rehash blocks with the shared utility.

**Confidence:** High

---

### V-3: Stats query optimization verified correct [VERIFIED — no issue]

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:106-111`

**Description:** Verified that the cycle 35 fix (AGG-3) correctly refactored `solved_problems` to reference `user_best` instead of re-scanning `submissions`. The query is equivalent — same JOIN condition, same ROUND/COALESCE logic, same filter.

---

### V-4: Chat widget scrollToBottom ref stabilization verified [VERIFIED — no issue]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-105`

**Description:** Verified that `scrollToBottom` now uses `isStreamingRef.current` instead of the `isStreaming` state variable, and the dependency array is `[]`. The callback is stable and won't be recreated on streaming state changes.
