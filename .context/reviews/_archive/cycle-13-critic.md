# Cycle 13 Critic Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Multi-perspective critique of the whole change surface

---

## CR13-CT1 — [MEDIUM] Navigation item duplication across layouts is the most pressing maintainability risk

- **Files:** `src/app/(public)/layout.tsx`, `src/app/(dashboard)/layout.tsx`
- **Confidence:** HIGH
- **Evidence:** This is the same finding as CR13-CR1 and CR13-AR1. The duplication is not just about DRY — it's about the two layouts using different i18n namespaces for the same conceptual items. Public layout uses `tShell("nav.practice")` while dashboard layout uses `t("practice")`. If the i18n keys diverge, one layout could show different text than the other for the same navigation item. This is a latent inconsistency bug.
- **Suggested fix:** Unify the i18n namespace for navigation items across layouts, or extract a shared helper that resolves the correct translation key.

## CR13-CT2 — [MEDIUM] The workspace-to-public migration is 75% complete but the remaining 25% has architectural dependencies

- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Confidence:** HIGH
- **Evidence:** Phase 1 (workspace removal) and Phase 2 (PublicHeader unification) are complete. Phase 3 is in progress — the sidebar trigger and lecture toggle have been merged into PublicHeader, and the double-header is eliminated. However, the remaining Phase 3 items (slim down AppSidebar, move breadcrumb, evaluate control group merge) and all of Phase 4 (route consolidation) are pending. The AppSidebar still has full sidebar navigation that partially duplicates PublicHeader dropdown items. This creates a confusing UX where users see the same links in two places (sidebar + dropdown).
- **Suggested fix:** Prioritize slimming AppSidebar to icon-only mode or contextual sub-navigation to reduce the duplication with PublicHeader.

## CR13-CT3 — [LOW] `recordRateLimitFailureMulti` has slightly different `windowStartedAt` handling

- **File:** `src/lib/security/rate-limit.ts:251-252`
- **Confidence:** MEDIUM
- **Evidence:** Already noted in CR13-CR4. The ternary `entry.windowStartedAt === now ? now : entry.windowStartedAt` is a no-op but adds confusion. Should be normalized.

## CR13-CT4 — [LOW] Rate limit functions still have near-duplicate implementations

- **File:** `src/lib/security/rate-limit.ts:144-269`
- **Confidence:** MEDIUM
- **Evidence:** Already deferred as D24. After the `blockedUntil` normalization in cycle 12, the remaining duplication is cosmetic but still increases maintenance burden.

---

## Final Sweep

- The codebase is in a good state after 12 cycles of review-plan-fix. The major auth module issues (inline field lists, hardcoded mustChangePassword, index signature) have all been fixed.
- The main remaining architectural concern is the navigation duplication across layouts, which is a natural consequence of the incremental migration approach.
- The deferred items (D1-D26) are well-documented with clear exit criteria. None are security-critical or data-loss risks.
