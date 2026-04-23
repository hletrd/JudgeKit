# User-Injected TODO — Status Tracking

This file is read by the RPF loop's orchestrator at the start of each cycle.
Only **pending** items should live here; completed items are left as a short
"done" record or moved to a history section so they are not re-queued next
cycle.

---

## Pending

(none at the moment — see history below)

---

## History (already implemented)

### Move "Languages" into a submenu / sub-navigation

- **Source:** user request during cycle 1
- **Status:** DONE in prior cycles.
- **Commits:**
  - `85ca2aab refactor(nav): 🏷️ move Languages from top-level nav to footer link`
  - `c7e8ca82 refactor(nav): 🏷️ remove Languages from top-level nav, already in footer`
- **Verification:** `src/lib/navigation/public-nav.ts:25-34` no longer lists Languages in the top-level nav (inline comment explicitly redirects to PublicFooter). `src/components/layout/public-footer.tsx:23-29` appends a FooterLink for `/languages` unconditionally. Re-verified in RPF cycle 55 (loop cycle 3/100, 2026-04-23).

### Comprehensive UI/UX review with playwright + agent-browser

- **Source:** user request during cycle 2 (injected mid-loop)
- **Status:** Artifact delivered for RPF cycle 55 / loop cycle 3/100 on 2026-04-23 at `./.context/reviews/designer-runtime-cycle-3.md`.
- **Key outcome:** runtime attempt was sandbox-blocked because `src/instrumentation.ts` register hook requires a live Postgres and the sandbox has no Docker. A source-level fallback review ran instead; the only actionable finding was to add a `SKIP_INSTRUMENTATION_SYNC` env short-circuit so the dev server can boot for runtime review in future sandboxes.
- **Follow-up commit:** cycle 55 adds `SKIP_INSTRUMENTATION_SYNC=1` short-circuit to `src/lib/judge/sync-language-configs.ts` + regression tests.
- **Re-queue conditions:** Future runtime reviews (once the next sandbox or staging environment makes a live Postgres available) can re-run the designer runtime lane; at that point a new pending entry can be added here by the user or the loop orchestrator, but it is NOT auto-queued for every cycle.
