# Aggregate Review — Cycle 1/3 RPF (menu-IA focus)

**Date:** 2026-05-06
**HEAD:** main / a90a5643
**Reviewers:** designer (focused on user's stated complaint)
**User focus this cycle:** menu hierarchy for admin and ease of use; many features hard to access; menu hierarchy confusing.

> Per orchestrator scope, this cycle focuses heavily on the user's stated
> menu/IA complaint. Other findings are inherited from
> `_aggregate-cycle-30.md` and predecessors which remain authoritative
> for non-IA work.

---

## NEW FINDINGS THIS CYCLE (15 — designer / UX)

Source: `.context/reviews/cycle-1/designer.md`

| ID | Severity | Confidence | Title |
|---|---|---|---|
| D1 | HIGH | HIGH | Header dropdown duplicates the primary nav and confuses hierarchy |
| D2 | HIGH | HIGH | Admin landing exposes raw URL paths as primary copy |
| D3 | HIGH | HIGH | Admin pages have no top-level header — only a SidebarTrigger (ConditionalHeader strips chrome) |
| D4 | HIGH | HIGH | Admin "Quick Actions" dashboard chips are a flat unranked wall of 11 |
| D5 | HIGH | MED-HIGH | Capability gaps drift across header dropdown / sidebar / admin landing |
| D6 | MEDIUM | MEDIUM | Top nav has no entry to /problem-sets, /groups, /profile, /dashboard |
| D7 | MEDIUM | MEDIUM | Breadcrumb home always points to `/dashboard`; logo points to `/` |
| D8 | MEDIUM | MEDIUM | Sidebar-only-for-admin creates inconsistent layout shifts |
| D9 | MEDIUM | MEDIUM | Admin "Quick Actions" card renders even when empty |
| D10 | MEDIUM | MEDIUM | No "Open Admin Console" CTA on `/dashboard` for admins |
| D11 | LOW | HIGH | DROPDOWN_ICONS keyed on literal href incl. query string |
| D12 | LOW | HIGH | `nav.problems` and `nav.practice` keys both point at `/practice` |
| D13 | LOW | MEDIUM | Admin sidebar group ordering is arbitrary |
| D14 | LOW | MEDIUM | No reliable mobile sidebar trigger for admins |
| D15 | LOW | LOW | Admin landing path-strings break Korean text rhythm |

---

## RE-VALIDATED FROM PRIOR AGGREGATES (still open at HEAD a90a5643)

These are inherited from `_aggregate-cycle-29.md` /
`_aggregate-cycle-30.md`. They are explicitly deferred this cycle in
favor of the user's IA focus, with exit criteria recorded in
`.context/plans/cycle-1/`.

| ID | Severity | Status |
|---|---|---|
| AGG-1 .. AGG-19 (cycle 29) | HIGH→LOW | open / inherited |

---

## CROSS-AGENT AGREEMENT

Single-agent specialist run this cycle (per user-narrowed scope).
Cross-agent agreement was assessed against historical multi-perspective
aggregates under `reviews/2026-05-03-multi-perspective*` and
`_aggregate-cycle-23.md`; D1, D5, D6 reinforce IA concerns flagged
there.

---

## QUALITY GATES (snapshot at HEAD)

- `tsc --noEmit`: clean (exit 0)
- `eslint .`: clean (exit 0)
- vitest unit/component/security + `next build`: deferred to PROMPT 3 implementation pass.

---

## AGENT FAILURES

None — single-agent run completed successfully.
