# RPF Cycle 42 — Architect Reviewer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Architectural/design risks, coupling, layering

## Findings

### ARCH-1: Access-code routes bypass capability-based auth pattern [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts:8-45`

**Description:** The access-code management routes (GET, POST, DELETE) do not specify `auth: { capabilities: [...] }` in their `createApiHandler` config, relying solely on the handler-internal `canManageContest()` check. This breaks the defense-in-depth pattern where the API handler framework enforces coarse-grained authorization before the handler runs. The recruiting-invitations routes correctly use `auth: { capabilities: ["recruiting.manage_invitations"] }`, creating an inconsistency in the codebase's authorization architecture.

**Concrete failure scenario:** A developer adds a PUT handler to the access-code route and forgets the inner `canManageContest` check, assuming the framework enforces authorization. Any authenticated user can then modify access codes.

**Fix:** Add capability-based auth to the `createApiHandler` config for all three methods.

**Confidence:** Medium

---

### ARCH-2: `problemPoints` length not validated against `problemIds` — schema allows silent data skew [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:12-21`

**Description:** The quick-create schema allows `problemPoints` to have a different length than `problemIds`. This is a schema design issue: the Zod schema should enforce the invariant that these arrays have matching lengths. Currently, the fallback at line 89 (`body.problemPoints?.[i] ?? 100`) masks the mismatch. This creates a coupling between schema validation and business logic that should be enforced at the schema level.

**Fix:** Add a `.refine()` to the schema to enforce length matching.

**Confidence:** Medium

---

## Carry-Over Items (Still Unfixed)

- Prior ARCH-2: Stale-while-revalidate cache pattern duplication (deferred, LOW/LOW)
- Prior AGG-7: Manual routes duplicate createApiHandler boilerplate (deferred, MEDIUM/MEDIUM)

## Sweep: Files Reviewed

- All 84 API route files under `src/app/api/v1/`
- `src/lib/api/handler.ts`
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/assignments/recruiting-constants.ts`
- `src/lib/realtime/realtime-coordination.ts`
- `src/lib/capabilities/` directory
- `src/lib/auth/permissions.ts`
- `src/app/api/v1/contests/quick-create/route.ts`
- `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`
