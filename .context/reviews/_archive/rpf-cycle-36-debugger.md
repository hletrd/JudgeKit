# Debugger Review — RPF Cycle 36

**Date:** 2026-04-23
**Reviewer:** debugger
**Base commit:** 601ff71a

## Inventory of Files Reviewed

- All recruiting invitation routes
- SSE events route
- Chat widget
- Compiler execute
- Data retention maintenance
- Rate limiter

## Findings

### DBG-1: PATCH invitation route NaN bypass — latent bug from incomplete fix [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:114`

**Description:** Same root cause as AGG-2 from cycle 35. The PATCH route constructs `new Date(\`${body.expiryDate}T23:59:59Z\`)` without the NaN guard. All downstream comparisons with NaN return false, bypassing both "in past" and "too far" validation. The invitation is then stored with an invalid expiry.

The failure mode: `expiresAtUpdate` is `Invalid Date` (a Date object where `getTime()` returns `NaN`). The check `expiresAtUpdate <= dbNow` becomes `NaN <= Date` which is `false`. The check `(NaN - dbNowMs) > MAX_EXPIRY_MS` is `false`. The update proceeds with the invalid date.

**Fix:** Add `Number.isFinite(expiresAtUpdate.getTime())` guard, returning 400 if invalid.

**Confidence:** High

---

### DBG-2: Chat widget textarea lacks aria-label — carry-over [LOW/LOW — carry-over]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:363`

**Description:** The textarea has `placeholder` but no `aria-label`. Carry-over from prior cycles.

**Fix:** Add `aria-label={t("placeholder")}` to the textarea.

**Confidence:** High
