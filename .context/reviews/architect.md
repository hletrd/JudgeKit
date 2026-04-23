# Architecture Review — RPF Cycle 24

**Date:** 2026-04-22
**Base commit:** dbc0b18f

## ARCH-1: Systemic double `.json()` anti-pattern persists in 4 components [MEDIUM/HIGH]

**Files:**
- `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:181-185`
- `src/components/problem/problem-submission-form.tsx:184-188,247-252`
- `src/components/code/compiler-client.tsx:270-287`

**Description:** Despite the creation of `apiFetchJson` and fixes to contest-join-client and create-problem-form, 3 components still use the double `.json()` pattern (error branch + success branch on same Response). This is a recurring architectural issue — the `apiFetchJson` utility exists but adoption is incomplete. The handler.ts `createApiHandler` on the server side addresses server routes, but client-side adoption is piecemeal.

**Concrete risk:** Each new component that copies the old pattern introduces the same vulnerability. Without a lint rule or enforced convention, this will keep recurring.

**Fix:** Migrate remaining components to `apiFetchJson` or parse-once-before-branch pattern. Consider adding an ESLint rule to detect double `.json()` calls on the same identifier.

---

## Summary

- MEDIUM: 1 (ARCH-1)
- Total new findings: 1
