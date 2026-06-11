# RPF Cycle 9 Designer / UI/UX Review

**Date:** 2026-04-20
**Base commit:** c30662f0

## Findings

### DES-1: `globals.css` `html` letter-spacing applied to Korean text — CLAUDE.md violation [HIGH/HIGH]

**Files:** `src/app/globals.css:129`, `src/app/globals.css:213`
**Description:** The `html` element has `letter-spacing: -0.01em` applied globally (line 129), and `.problem-description :is(h1, h2, h3, h4)` has `letter-spacing: -0.02em` (line 213). These CSS rules apply to ALL text including Korean content, directly violating CLAUDE.md: "Keep Korean text at the browser/font default letter spacing." The Tailwind components correctly use locale-conditional patterns (e.g., `${locale !== "ko" ? " tracking-tight" : ""}`), but these CSS rules bypass that logic entirely.
**Fix:** Use `:lang()` CSS selectors to conditionally apply letter-spacing only for non-Korean content.

### DES-2: `recruiting-invitations-panel.tsx` date formatting ignores next-intl locale [LOW/MEDIUM]

**Files:** `src/components/contest/recruiting-invitations-panel.tsx:252`
**Description:** `toLocaleDateString(undefined, {...})` uses the browser's default locale instead of the configured next-intl locale.
**Fix:** Use next-intl date formatter or pass the current locale to `toLocaleDateString()`.

### DES-3: `recruiting-invitations-panel.tsx` expiry check uses browser time [LOW/LOW]

**Files:** `src/components/contest/contract/recruiting-invitations-panel.tsx:246`
**Description:** `new Date(inv.expiresAt) < new Date()` compares expiry using browser local time. For a client-side component this is acceptable (just for display), but could show a different status than the server-side check.
**Fix:** Low priority — the server-side check is authoritative.

## Verified Safe

- All Tailwind heading components correctly use locale-conditional tracking.
- Access code manager correctly scopes `tracking-widest` to font-mono alphanumeric text.
- Sidebar labels correctly skip tracking for Korean.
- Dark/light mode support is present via `next-themes`.
- `prefers-reduced-motion` is respected in globals.css.
