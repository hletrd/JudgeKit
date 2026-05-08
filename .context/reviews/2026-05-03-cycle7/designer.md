# Designer Review — Cycle 7 (Source-Level)

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-DES-1: Browser tab title inconsistent with page content for expired-but-redeemed tokens (LOW, High confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:38-39`

When a candidate visits an expired-but-redeemed recruiting link, the browser tab shows "Expired" but the page body shows the re-entry form. This creates a confusing UX where the tab-level signal contradicts the in-page content.

**Fix:** Apply the `isRedeemed` check in `generateMetadata` before the expiry check, consistent with the page body.

---

### C7-DES-2: Privacy page has hardcoded retention periods (carry-forward from C6-10) (LOW, High confidence)

**File:** `src/app/(public)/privacy/page.tsx:38-44`

The retention periods on the privacy page are hardcoded strings ("90", "30", "180", "365") that must be kept in sync with the system settings in `src/lib/data-retention.ts`. If an operator changes a retention period via the admin settings, the privacy page will be out of date until a developer updates the hardcoded values.

This was flagged in cycle 6 (C6-10) and deferred. The comment at line 34-37 acknowledges the drift risk but no programmatic sync exists.

**Verdict:** Carry forward. The comment documents the risk, but a dynamic lookup from system settings would be more robust.

---

### C7-DES-3: Recruit start page organization logo uses `<img>` without width/height (LOW, Low confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:224-228`

The organization logo `<img>` tag only sets `className="... h-12 w-auto"` but no explicit `width`/`height` attributes. This can cause CLS (Cumulative Layout Shift) when the image loads, especially on slow connections. The `eslint-disable-next-line @next/next/no-img-element` comment is present because Next.js prefers `<Image>`, but even with `<img>`, explicit dimensions prevent layout shifts.

**Verdict:** Low priority. The `h-12` class provides a height constraint, so the shift is bounded. Defer.
