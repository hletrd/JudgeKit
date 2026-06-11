# RPF Cycle 42 — Critic Reviewer

**Date:** 2026-04-23
**Base commit:** 8912b987
**Reviewer angle:** Multi-perspective critique of the whole change surface

## Findings

### CRI-1: Quick-create `problemPoints` array length mismatch allows unintended scoring [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/quick-create/route.ts:17-21,89`

**Description:** From a product perspective, the quick-create endpoint silently defaults unmatched problems to 100 points. This is dangerous for competitive programming contests where point values are carefully calibrated. The UI likely shows per-problem point inputs, so a mismatch between `problemIds` and `problemPoints` lengths is almost certainly a bug in the calling code rather than intentional. The endpoint should reject such mismatches rather than silently filling defaults.

**Concrete failure scenario:** The frontend has a race condition where `problemPoints` is updated after `problemIds` (e.g., adding a problem to the list). The request is sent with a stale `problemPoints` array. The contest is created with incorrect scoring, and the instructor only notices after students have already submitted.

**Fix:** Add `.refine()` to the Zod schema enforcing `problemPoints.length === problemIds.length`.

**Confidence:** Medium

---

### CRI-2: Access-code routes lack capability-based auth — inconsistent with recruiting pattern [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`

**Description:** The recruiting-invitations routes use `auth: { capabilities: ["recruiting.manage_invitations"] }` for defense-in-depth, while the access-code routes rely solely on inner `canManageContest()` checks. This inconsistency is a code smell that could lead to future vulnerabilities if a developer follows the access-code pattern for a new route and omits the inner check.

**Fix:** Align access-code routes with the recruiting pattern by adding capability-based auth at the framework level.

**Confidence:** Medium

---

### CRI-3: Redundant non-null assertion in `resetRecruitingInvitationAccountPassword` [LOW/LOW]

**File:** `src/lib/assignments/recruiting-invitations.ts:253`

**Description:** The `invitation.userId!` assertion is redundant because line 230 already guards against null. While harmless, it sets a pattern where developers might use `!` assertions as a shortcut instead of proper type narrowing, increasing the risk of future null pointer errors.

**Fix:** Replace `invitation.userId!` with `invitation.userId` — TypeScript can narrow after the guard.

**Confidence:** Low

---

## Sweep: Files Reviewed

All critical API routes, domain logic, and frontend components as listed in other reviewer reports.
