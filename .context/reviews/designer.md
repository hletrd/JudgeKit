# UI/UX Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** designer
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 designer findings are verified:
- DES-1 (icon-only button `aria-label` violations): Resolved — all `size="icon"` buttons now have `aria-label`

## Findings

### DES-1: `recruiting-invitations-panel.tsx` metadata remove button missing `aria-label` [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`

**Description:** The "remove metadata field" button renders a `Trash2` icon with no visible text and no `aria-label`. While this uses `size="sm"` instead of `size="icon"`, it is functionally an icon-only button. Screen readers would announce it as an unlabeled button, making it impossible for visually impaired users to understand its purpose.

This is a regression of the same class of issue fixed across cycles 11-13 for `size="icon"` buttons. The fix scope was limited to `size="icon"` and `size="icon-sm"` buttons, but this `size="sm"` button has the same accessibility problem.

**Fix:** Add `aria-label={t("removeField")}` and add the i18n key to en.json and ko.json.

**Confidence:** HIGH

---

### DES-2: `contest-join-client.tsx` — 1-second artificial delay before navigation — carried from DES-2 (cycle 14) [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:57`

**Description:** Carried from cycle 14. The 1-second delay adds unnecessary perceived latency. 500ms would be sufficient to communicate success.

**Fix:** Reduce the delay to 500ms.

**Confidence:** LOW

---

### DES-3: Workers admin page `JUDGE_BASE_URL` uses `window.location.origin` — carried from DES-3 (cycle 14) [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:148`

**Description:** Carried from cycle 14. The "Add Worker" dialog displays Docker and deploy script commands with `JUDGE_BASE_URL` set to `window.location.origin`. Overlaps with SEC-2/DEFER-24.

**Fix:** Use a server-provided `appUrl` config value instead of `window.location.origin`.

**Confidence:** LOW

---

## Final Sweep

The `size="icon"` button accessibility issue from cycles 11-13 is fully resolved. A minor accessibility regression was found with an icon-only `size="sm"` button in the recruiting invitations metadata section. The 1-second delay and `window.location.origin` issues are carried from prior cycles.
