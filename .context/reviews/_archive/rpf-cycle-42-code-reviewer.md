# RPF Cycle 42 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Code quality, logic, SOLID, maintainability

## Findings

### CR-1: `problemPoints` array length not validated against `problemIds` in quick-create schema [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:17-21`

**Description:** The `quickCreateSchema` accepts `problemIds` (1-50 items) and an optional `problemPoints` array, but does not validate that the lengths match. If `problemPoints` is provided with fewer elements than `problemIds`, extra problems silently default to 100 points (via `body.problemPoints?.[i] ?? 100`). If more elements are provided, the extras are silently ignored. This is a minor data integrity concern — an instructor might intend custom points for all problems but accidentally provide fewer entries.

**Concrete failure scenario:** An instructor creates a contest with 5 problems and provides `problemPoints: [10, 20, 30]`. Problems 4 and 5 get 100 points each instead of the intended values. The instructor does not notice because no error is returned.

**Fix:** Add a Zod `refine` to validate array lengths match:
```typescript
quickCreateSchema.refine(
  (data) => !data.problemPoints || data.problemPoints.length === data.problemIds.length,
  { message: "problemPoints length must match problemIds length", path: ["problemPoints"] }
);
```

**Confidence:** Medium

---

### CR-2: Access-code route handlers lack capability-based auth gating at the `createApiHandler` level [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts:8-45`

**Description:** The GET, POST, and DELETE handlers for access-code management use `createApiHandler({ handler: ... })` without specifying `auth: { capabilities: [...] }`. They rely solely on the inner `canManageContest()` check. While functionally correct (any authenticated user hits the handler, which then checks authorization), this is inconsistent with the pattern used in recruiting-invitations routes which use `auth: { capabilities: ["recruiting.manage_invitations"] }`. The inconsistency is a maintainability concern — a future developer might add a handler without the inner check, assuming the framework enforces it.

**Concrete failure scenario:** A developer adds a new method to the access-code route without the inner `canManageContest` check, assuming the framework already gates access. Any authenticated student could then manage access codes.

**Fix:** Add `auth: { capabilities: ["contests.manage"] }` (or appropriate capability) to the `createApiHandler` config for each method.

**Confidence:** Low (functionally safe today, but inconsistent pattern)

---

### CR-3: Redundant non-null assertion on `invitation.userId` in `resetRecruitingInvitationAccountPassword` [LOW/LOW]

**File:** `src/lib/assignments/recruiting-invitations.ts:253`

**Description:** The function checks `!invitation.userId` at line 230 and throws if null. The `!` assertion at line 253 is therefore redundant but could mask a future regression if the guard is accidentally removed.

**Fix:** Replace `invitation.userId!` with `invitation.userId` — TypeScript can narrow the type after the guard check.

**Confidence:** Low (cosmetic, no runtime impact)

---

## Sweep: Files Reviewed

- All API route files under `src/app/api/v1/`
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/assignments/recruiting-constants.ts` (verified MAX_EXPIRY_MS)
- `src/lib/realtime/realtime-coordination.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/lib/api/handler.ts`
- `src/components/exam/anti-cheat-monitor.tsx`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `src/lib/plugins/chat-widget/chat-widget.tsx`
- `src/app/api/v1/contests/quick-create/route.ts`
- `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`
- `src/app/api/v1/code-snapshots/route.ts`
- `src/app/api/v1/compiler/run/route.ts`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts`
- `src/app/api/v1/contests/join/route.ts`
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`
- `src/components/seo/json-ld.tsx`
- `src/lib/security/sanitize-html.ts`
