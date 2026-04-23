# RPF Cycle 4 (Loop Cycle 4/100) — Architect

**Date:** 2026-04-23
**Base commit:** d4b7a731
**HEAD commit:** d4b7a731
**Scope:** Architectural/design risks, coupling, layering, abstractions across the entire repo.

## Production-code delta since last review

Only `src/lib/judge/sync-language-configs.ts` changed. Architectural impact: near-zero. The new short-circuit is an opt-out gate for a specific cold-path function. It does not change the control-flow of `src/instrumentation.ts` (register hook still runs; `syncLanguageConfigsOnStartup` still returns). No new coupling introduced; no new layering concerns.

## Re-sweep findings (this cycle)

**Zero new findings.**

Re-verified architectural boundaries:

- `src/app/**` <-> `src/lib/**` layering: respected. API routes delegate business logic to `src/lib` modules.
- `src/components/**` <-> `src/hooks/**`: hooks encapsulate reactive state correctly.
- `src/lib/judge/**` <-> `src/lib/db/**`: judge-side writes to `languageConfigs` go through drizzle-orm with consistent `getDbNowUncached` for timestamp.
- Navigation abstractions (`src/lib/navigation/public-nav.ts`, `src/components/layout/public-footer.tsx`): Languages correctly in footer, no duplicate placement.
- Rate-limit module: single source of truth in `src/lib/security/rate-limit.ts`.
- CSRF module: single source of truth in `src/lib/security/csrf.ts`.
- `createApiHandler` adoption: still the standard for new routes (22 legacy raw routes deferred — ARCH-2).

## Carry-over deferred items (unchanged)

- ARCH-2: Manual routes duplicate `createApiHandler` boilerplate — MEDIUM/MEDIUM, deferred.
- ARCH-3: Stale-while-revalidate cache pattern duplication — LOW/LOW, deferred.

No new architectural finding surfaced.

## Recommendation

No action this cycle. Consider scheduling a "deferred-list pruning" cycle to decide whether 30+ cycle LOW/LOW items should be closed as "won't fix" rather than kept indefinitely deferred.
