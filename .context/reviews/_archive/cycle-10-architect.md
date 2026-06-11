# Cycle 10 Architect Reviewer Report

**Reviewer:** architect
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Architectural/design risks, coupling, layering

## Inventory of Files Reviewed

- `src/lib/auth/config.ts` — NextAuth config with field mapping
- `src/lib/auth/session-security.ts` — Token clearing (must sync with field mapping)
- `src/lib/api/handler.ts` — API handler factory
- `src/lib/api/auth.ts` — API auth with minimal user object
- `src/lib/db/selects.ts` — Query column selects
- `src/lib/realtime/realtime-coordination.ts` — SSE coordination
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE route (411 lines)
- `src/app/api/v1/submissions/route.ts` — Submissions CRUD
- `src/app/api/v1/playground/run/route.ts` — Playground execution
- `src/lib/compiler/execute.ts` — Code execution engine
- `src/lib/db/export.ts` — Export engine
- `src/lib/db/import.ts` — Import engine
- `src/proxy.ts` — Edge middleware (auth cache, CSP, HSTS)
- `src/components/layout/public-header.tsx` — Top navigation
- `src/components/layout/app-sidebar.tsx` — Dashboard sidebar

## Findings

### CR10-AR1 — [MEDIUM] Auth field mapping refactoring is incomplete — 4 separate field lists remain despite `mapUserToAuthFields`

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR10-CR1
- **File:** `src/lib/auth/config.ts`, `src/lib/auth/session-security.ts`
- **Evidence:** The `mapUserToAuthFields` extraction (commit 71df1c30) centralized the user-to-fields mapping, but four other locations still maintain independent field lists:
  1. `authorize()` inline object (line 280-296) — constructs `AuthUserRecord` from DB user
  2. `jwt` callback `if (user)` branch (line 368-386) — constructs `AuthUserRecord` from NextAuth user
  3. `jwt` callback `freshUser` branch (line 438-456) — constructs `AuthUserRecord` from DB query
  4. `clearAuthToken` (session-security.ts line 37-60) — deletes 17 token fields by name
  
  Additionally, the DB query `columns` list (line 407-427) must also include all preference columns. This is 6 places that must be updated for each new field.
- **Architectural risk:** The DRY violation was partially fixed but the root cause (no single source of truth for auth-relevant field names) remains. The refactoring created a false sense of completeness.
- **Suggested fix:** (1) Define a constant `AUTH_USER_FIELDS` array listing all preference field names. (2) Use it to derive the DB query `columns` list. (3) Use `mapUserToAuthFields` in all `AuthUserRecord` construction sites. (4) Iterate `AUTH_USER_FIELDS` in `clearAuthToken`.

### CR10-AR2 — [MEDIUM] SSE route file is still 475 lines after the re-auth fix — connection tracking and polling should be extracted

- **Confidence:** HIGH
- **Cross-agent agreement:** cycle-9 architect CR9-AR2
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Evidence:** The SSE route file grew from 411 to 475 lines after the re-auth fix. It contains:
  1. Connection tracking data structures and functions (lines 22-94)
  2. Shared polling manager (lines 105-182)
  3. Route handler with two nearly-identical terminal-result-fetch blocks (lines 277-424)
  4. Helper functions (lines 439-475)
  
  The two terminal-result-fetch blocks (one after re-auth, one for non-re-auth path) are nearly identical (lines 346-366 and 389-410), differing only in whether they're inside an async IIFE.
- **Architectural risk:** The duplicated terminal-result-fetch code means a bug fix in one path must be applied in the other. The file size makes it difficult to reason about the SSE lifecycle.
- **Suggested fix:** Extract connection tracking into `src/lib/realtime/sse-connection-tracker.ts`, polling into `src/lib/realtime/sse-poll-manager.ts`, and deduplicate the terminal-result-fetch logic into a shared helper function.

### CR10-AR3 — [LOW] `rateLimits` table used for two semantically different purposes — still present

- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-9 architect CR9-AR3, perf-reviewer CR9-PR5
- **File:** `src/lib/realtime/realtime-coordination.ts:92-131`
- **Evidence:** The `rateLimits` table stores both actual rate-limit records and SSE connection slot records (keyed with `realtime:sse:user:` prefix) and heartbeat records (keyed with `realtime:heartbeat:` prefix). The `acquireSharedSseConnectionSlot` function inserts rows with `attempts`, `windowStartedAt`, `blockedUntil`, etc., but these fields have different semantics for SSE connections vs rate limits vs heartbeats.
- **Suggested fix:** Consider a dedicated `realtimeConnections` table with columns appropriate for connection tracking. This would make the LIKE queries unnecessary.

### CR10-AR4 — [LOW] Workspace-to-public migration still stalled at Phase 2 — architectural debt accumulating

- **Confidence:** HIGH
- **File:** `src/components/layout/public-header.tsx`, `src/components/layout/app-sidebar.tsx`
- **Cross-agent agreement:** cycle-9 critic CR9-CT3
- **Evidence:** Phase 1 and 2 of the migration are complete, but Phase 3 (Dashboard layout refinement) has not started. The dual navigation paradigm (PublicHeader + AppSidebar) means two separate code paths for navigation. The `PublicHeader` uses hardcoded role checks (`role === "instructor" || role === "admin"`) while `AppSidebar` uses capability-based filtering. These could diverge.
- **Suggested fix:** Continue Phase 3. At minimum, make the top navbar visible on dashboard pages as a first step.

## Previously Found Issues (Still Open)

- D1: SSE submission events route capability check incomplete (MEDIUM)
- D4: Test coverage gaps for workspace-to-public migration Phase 2 (MEDIUM)
- D8: PublicHeader click-outside-to-close (LOW)
