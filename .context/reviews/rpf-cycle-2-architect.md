# Architect Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** architect
**HEAD reviewed:** `767b1fee`

---

## Architectural observations

### ConditionalHeader pattern
The new `ConditionalHeader` component in `src/components/layout/conditional-header.tsx` cleanly introduces a route-based UI branching pattern for the dashboard layout. It's a thin client component that delegates to `PublicHeader` for non-admin paths and renders a minimal admin header otherwise. This is architecturally sound — the decision boundary is at the layout level, not scattered across individual pages.

### i18n externalization
The contest and community pages now properly use translation keys instead of hardcoded strings. This follows the existing `next-intl` pattern consistently.

### Discussions refactor
`src/lib/discussions/data.ts` now pushes moderation filters to SQL. The shared `compareThreadsByPinnedVoteScoreDate` comparator eliminates duplication across 4 thread-listing functions. Good DRY improvement.

---

## Findings

### C2-AR-1: [LOW] `rateLimits` table overloaded for SSE connection tracking

- **File:** `src/lib/realtime/realtime-coordination.ts:75-137`
- **Confidence:** MEDIUM (carry-forward from C1-AR-1)
- **Description:** The `rateLimits` table is used both for rate limiting and SSE connection slot tracking. The `blockedUntil` column is repurposed as an "expires at" timestamp for SSE slots.
- **Status:** Carry-forward under ARCH-CARRY-2.

### C2-AR-2: [LOW] `import.ts` uses `any` types

- **File:** `src/lib/db/import.ts:19-24`
- **Confidence:** MEDIUM (carry-forward from C1-AR-2 / C1-CR-2)
- **Description:** `TABLE_MAP: Record<string, any>` bypasses type safety.
- **Status:** Carry-forward.

---

## No-issue confirmations

- API handler standardization: 134/218 routes use `createApiHandler`. ARCH-CARRY-1 carry-forward.
- Layering: `lib/` -> `db/`, `auth/`, `security/`, `compiler/`, `judge/`. No reverse coupling. Correct.
- Route group hierarchy: `(auth)`, `(public)`, `(dashboard)` is clean. No architectural drift.
