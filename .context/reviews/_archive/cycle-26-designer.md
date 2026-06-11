# Cycle 26 Designer Review (UI/UX)

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## DES-1: Access code input `tracking-[0.35em]` not locale-conditional — minor consistency issue [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:102`
**Description:** The access code `<Input>` uses `tracking-[0.35em]` unconditionally. While access codes are alphanumeric (font-mono), the rest of the codebase consistently makes tracking locale-conditional. This is a minor inconsistency in the established pattern.
**Concrete failure scenario:** No real user impact since access codes are always alphanumeric, but it breaks the pattern consistency that future developers rely on.
**Fix:** Add a comment `/* access codes are alphanumeric — tracking safe */` or make it locale-conditional for uniformity.

## DES-2: `tracking-widest` on access-code display in `access-code-manager.tsx` — safe but undocumented [LOW/LOW]

**Files:** `src/components/contest/access-code-manager.tsx:122`
**Description:** The `<code>` element displaying the access code uses `tracking-widest`. This is safe for monospace/alphanumeric content, but like DES-1, it's not locale-conditional.
**Fix:** Add documentation comment. No code change needed.

## DES-3: Korean letter-spacing remediation is comprehensive [VERIFIED GOOD]

**Description:** The tracking-tight remediation from cycles 24-25 has been applied to all heading components. The pattern `${locale !== "ko" ? " tracking-tight" : ""}` is consistently used across all heading elements. Label tracking (tracking-wide, tracking-[0.2em]) is also properly locale-conditional everywhere except the two access-code components noted above (which are safe since they render alphanumeric codes).

## DES-4: Public nav after "Languages" move is well-structured [VERIFIED GOOD]

**Description:** After moving "Languages" from the top-level nav to the footer, the navigation has 6 items: Practice, Playground, Contests, Rankings, Submissions, Community. This is a clean, focused navigation that prioritizes primary actions.
