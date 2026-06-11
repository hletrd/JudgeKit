# Cycle 11 Architect Reviewer Report

**Reviewer:** architect
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Architectural/design risks, coupling, layering

## Inventory of Files Reviewed

- `src/lib/auth/config.ts` — NextAuth config with AUTH_PREFERENCE_FIELDS / AUTH_USER_COLUMNS
- `src/lib/auth/session-security.ts` — Token clearing (AUTH_TOKEN_FIELDS)
- `src/lib/api/handler.ts` — API handler factory
- `src/lib/api/auth.ts` — API auth with minimal user object
- `src/lib/db/selects.ts` — Query column selects
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE route (475 lines)
- `src/app/api/v1/submissions/route.ts` — Submissions CRUD
- `src/app/api/v1/playground/run/route.ts` — Playground execution
- `src/lib/compiler/execute.ts` — Code execution engine
- `src/lib/db/export.ts` — Export engine
- `src/lib/db/import.ts` — Import engine
- `src/proxy.ts` — Edge middleware (auth cache, CSP, HSTS)
- `src/components/layout/public-header.tsx` — Top navigation
- `src/components/layout/app-sidebar.tsx` — Dashboard sidebar

## Findings

### CR11-AR1 — [MEDIUM] Auth field constants are split across two files with no compile-time link — AUTH_PREFERENCE_FIELDS (config.ts) vs AUTH_TOKEN_FIELDS (session-security.ts)

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR2, security-reviewer CR11-SR2
- **File:** `src/lib/auth/config.ts:58-69`, `src/lib/auth/session-security.ts:42-63`
- **Evidence:** The cycle 10 remediation introduced `AUTH_PREFERENCE_FIELDS` in config.ts and `AUTH_TOKEN_FIELDS` in session-security.ts. These arrays must stay in sync: every preference field must appear in both. But they are in separate files with no import relationship. `AUTH_TOKEN_FIELDS` includes token-specific fields (`sub`, `authenticatedAt`, `uaHash`) that are not in `AUTH_PREFERENCE_FIELDS`, so a simple equality check is not possible — but the preference field subset must overlap.
- **Architectural risk:** The two-constant pattern reduces the number of places to update from 6 to 4 (for the centralized parts) but adds a new sync requirement between the two constants. The improvement is real but incomplete.
- **Suggested fix:** Import `AUTH_PREFERENCE_FIELDS` into session-security.ts and build `AUTH_TOKEN_FIELDS` from it: `const AUTH_TOKEN_FIELDS = ['sub', ...AUTH_PREFERENCE_FIELDS, 'authenticatedAt', 'uaHash'] as const`. This ensures that adding a field to `AUTH_PREFERENCE_FIELDS` automatically includes it in `AUTH_TOKEN_FIELDS`.

### CR11-AR2 — [MEDIUM] SSE route file is still 475 lines — connection tracking and polling should be extracted

- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-10 architect CR10-AR2, perf-reviewer CR10-PR2
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Evidence:** The SSE route file contains: (1) Connection tracking data structures and functions (lines 22-94), (2) Shared polling manager (lines 105-182), (3) Route handler with two nearly-identical terminal-result-fetch blocks (lines 277-424), (4) Helper functions (lines 439-475). The two terminal-result-fetch blocks are nearly identical (lines 346-366 and 389-410).
- **Architectural risk:** The duplicated terminal-result-fetch code means a bug fix in one path must be applied in the other. The file size makes it difficult to reason about the SSE lifecycle.
- **Suggested fix:** Extract connection tracking into `src/lib/realtime/sse-connection-tracker.ts`, polling into `src/lib/realtime/sse-poll-manager.ts`, and deduplicate the terminal-result-fetch logic into a shared helper function.

### CR11-AR3 — [MEDIUM] `authorize()` and `jwt` callback still construct AuthUserRecord inline — the AUTH_PREFERENCE_FIELDS constant is not used for token construction

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR1
- **File:** `src/lib/auth/config.ts:317-336, 408-430, 462-480`
- **Evidence:** The `AUTH_PREFERENCE_FIELDS` and `AUTH_USER_COLUMNS` constants were added for the DB query and token clearing. But the `authorize()` function (line 317-336), `jwt` callback `if (user)` branch (line 408-430), and `jwt` callback `freshUser` branch (line 462-480) still construct `AuthUserRecord` objects with hardcoded field lists. These are the remaining 3 places that must be manually updated when a new preference field is added.
- **Architectural risk:** The constant-based approach was intended to reduce the surface of manual updates, but the highest-risk sites (token construction from DB data) still require manual updates.
- **Suggested fix:** Refactor `authorize()` to pass the DB user object directly to `mapUserToAuthFields` instead of constructing an intermediate inline object. For the `jwt` callback `if (user)` branch, the same approach applies. For the `freshUser` branch, the DB query already uses `AUTH_USER_COLUMNS`, so the result already has all fields — pass it directly to `mapUserToAuthFields`.

### CR11-AR4 — [LOW] Workspace-to-public migration Phase 3 still not started — architectural debt accumulating

- **Confidence:** HIGH
- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Cross-agent agreement:** cycle-10 critic CR10-CT3
- **Evidence:** Phase 1 and 2 of the migration are complete. Phase 3 (Dashboard layout refinement) has not started. The dual navigation paradigm (PublicHeader + AppSidebar) means two separate code paths for navigation. The `PublicHeader` now uses capability-based filtering (fixed this cycle) but the two navigation components still render independently.
- **Suggested fix:** Continue Phase 3. The first concrete step is making the top navbar visible on dashboard pages.

## Previously Found Issues (Still Open)

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D4: Test coverage gaps for workspace-to-public migration (MEDIUM)
- D8: PublicHeader click-outside-to-close (LOW)
- D12: `rateLimits` table used for SSE connections and heartbeats (LOW)
