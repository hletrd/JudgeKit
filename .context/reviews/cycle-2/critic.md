# Cycle 2/3 — Critic

**HEAD:** main / 2198a39b

## What the user actually said
> "fix menu hierarchy for admin and ease of use. Cycle 1 already shipped: deduped avatar dropdown vs top nav, replaced 11-chip admin dashboard wall with CTA + curated shortcuts, fixed breadcrumb home target, dropped orphan i18n keys, removed raw URL leakage from admin landing."

The user is **not asking for cosmetic polish**. The complaint is that admin discoverability is broken. Cycle 1 closed a few visible warts but did not address the underlying cause: the cycle-29-era migration left admin pages with NO persistent secondary navigation.

## Where cycle 1 fell short
1. **`AppSidebar` was reviewed as if live.** Cycle-1 designer.md treated it as the canonical admin sidebar but the component is never mounted. This means cycle 1's plan assumed admins had a sidebar to scope D5/D8/D13/D14 against — they do not.
2. **`ConditionalHeader` D3/B2 was deferred for "investigation".** Investigation reveals the component is unreachable. Should have been deleted in cycle 1; defer cost = ~10 min.
3. **A9 (single source of truth for admin nav) deferred.** This is the root-cause fix. The other A-tasks (A1-A8) were band-aids on the symptom.
4. **B1 (cap-aware top nav for `/groups` and `/problem-sets`) deferred.** Directly leaves the user's "many features hard to access" complaint unsolved.

## What cycle 2 must do (priority order)
1. **Restore admin secondary navigation.** Either re-mount `AppSidebar` in `(dashboard)/layout.tsx` OR add a compact horizontal section nav. Today admins must roundtrip through `/dashboard/admin` between every section. Pick ONE and ship it.
2. **Delete dead code (`AppSidebar` if not re-mounted, `ConditionalHeader` always).** Eliminates drift sources.
3. **Single-source admin nav data** so any future admin route addition is one edit.
4. **Cap-aware top nav** for Groups and Problem Sets.
5. **Fix Korean tracking-wide rule violation** on admin landing (project rule).
6. **Fix the two stale unit test contracts** (custom-role-pages, platform-mode-ui) — they're hiding regressions.

## What cycle 2 should NOT do
- Deeper refactor of `lecture-mode-toggle`, `LocaleSwitcher`, etc. — out of stated scope.
- New features. Strictly cleanup + IA.
- Touch `src/lib/auth/config.ts` (project rule).

## Risk register
- **Risk:** Re-mounting AppSidebar may collide with the cycle-1 cosmetic work (top nav now expects to occupy full width). Mitigation: use the lighter horizontal-tabs option instead.
- **Risk:** Deleting `AppSidebar` removes the only home for `ActiveTimedAssignmentSidebarPanel`. Mitigation: re-host the panel in chrome (server component slot above main content) when active timed assignments exist for the user.
- **Risk:** Unit test rewrite may mask regressions if tests are deleted instead of re-asserted. Mitigation: rewrite tests against the new contract; do NOT skip/delete them.

## Confidence
HIGH that the priority list above closes the user's stated complaint without scope creep.
