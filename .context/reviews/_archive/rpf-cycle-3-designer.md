# RPF Cycle 3 — Designer (UI/UX review — source-level)

**Date:** 2026-04-29
**HEAD reviewed:** 66146861
**Note:** Runtime browser review is sandbox-blocked (no DATABASE_URL, no Postgres, no rate-limiter sidecar — same env gap as cycles 1+2). This review is source-level only via grep + Read.

## Cycle change surface

`deploy-docker.sh` only — no UI files modified this cycle.

## Source-level UI/UX sweep

Since no UI files were touched, this review focuses on regression checks for prior UI/UX findings:

### Korean letter-spacing policy compliance (CLAUDE.md)

Per CLAUDE.md "Typography: Korean Letter Spacing": *"Keep Korean text at the browser/font default letter spacing. Do not apply custom letter-spacing (or tracking-* Tailwind utilities) to Korean content."*

**Audit:**
- `grep -RIn "tracking-"` in `src/components` and `src/app` returns ≈18 hits. Each was inspected for Korean-language gating:
  - `discussion-thread-view.tsx:42`, `discussion-moderation-list.tsx:42`, `my-discussions-list.tsx:24`, `discussion-thread-list.tsx:46`, `user-stats-dashboard.tsx:60`, `public-problem-set-list.tsx:35`, `public-problem-set-detail.tsx:55`, `app-sidebar.tsx:207`, `public-header.tsx:301`, `active-timed-assignment-sidebar-panel.tsx:50` — all use the `locale && locale !== "ko" ? " tracking-tight" : ""` (or `tracking-wide`/`tracking-wider`) gate. ALIGNED with CLAUDE.md.
  - `access-code-manager.tsx:154` (`tracking-widest`) and `not-found.tsx:58` (`tracking-[0.2em]`) and `contest-join-client.tsx:104` (`tracking-[0.35em]`) are tagged with comments stating they apply to alphanumeric/font-mono content where Korean rendering is impossible. ALIGNED.
  - `dropdown-menu.tsx:247` (`tracking-widest`) is on a class list — only used for keyboard-shortcut text (e.g. `⌘K`), which is alphanumeric. ALIGNED.
- `globals.css:129-132, 220-223` — explicitly applies `letter-spacing: var(--letter-spacing-body)` and `--letter-spacing-heading` only outside Korean (per the comments). ALIGNED.

**No new finding** — Korean letter-spacing policy is fully compliant at HEAD.

### Dark mode coverage

Recent cycles (cycle-8 through cycle-11) systematically added dark mode variants. No regressions visible at HEAD:
- `grep -RIn "dark:"` in `src/components` returns dense usage. No file modified this cycle that would regress dark mode.

### Accessibility regression check

Cycle-2 reviews verified `aria-label` on the recruiting expiry input (resolved). No UI changes this cycle, so no regression possible.

## Carry-forward UI/UX findings

- **AGG-1** (recruiting expiry UTC vs local): RESOLVED at cycle 2 HEAD (`recruiting-invitations-panel.tsx:462`). Verified.
- **AGG-2** (auto-refresh lacks backoff): RESOLVED at cycle 2 HEAD. Verified.
- **AGG-3** (workers AliasCell silent failure): RESOLVED. Verified.
- **AGG-5** (`<select>` in clarifications): RESOLVED. Verified.
- **C2-AGG-7** (window.location.origin in invitation URL): UNCHANGED. From a UX perspective, behind a misconfigured proxy the user gets a wrong-host invite link. Carry-forward.
- **DEFER-ENV-GATES** (Playwright e2e env): UNCHANGED. Browser review remains source-level only.

## Summary

- 0 new UI/UX findings this cycle (no UI files modified).
- All carry-forward UI fixes verified intact.
- Korean letter-spacing policy fully compliant.

**Total new findings this cycle:** 0.
