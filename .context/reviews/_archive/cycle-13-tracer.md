# Cycle 13 Tracer Report

**Date:** 2026-04-19
**Base commit:** e8340da5
**Reviewer angle:** Causal tracing of suspicious flows, competing hypotheses

---

## Flow 1 — Navigation item inconsistency between layouts

**Hypothesis:** Public and dashboard layouts render different navigation labels for the same items.

**Trace:**
1. User visits `/practice` (public layout). `PublicHeader` items are built with `tShell("nav.practice")` → `publicShell.nav.practice` i18n key.
2. User logs in and visits `/dashboard/problems`. `PublicHeader` items are built with `t("practice")` → `common.practice` i18n key.
3. If `publicShell.nav.practice` and `common.practice` resolve to different strings, the same nav item shows different labels.

**Verdict:** Likely — depends on i18n configuration. This is a real inconsistency risk that should be verified against the locale files.

**Confidence:** MEDIUM

---

## Flow 2 — New preference field silently dropped from JWT token

**Hypothesis:** Adding a new preference field to `AUTH_PREFERENCE_FIELDS` without updating `syncTokenWithUser` causes the JWT to miss it.

**Trace:**
1. Developer adds `preferredFontSize` to `AUTH_PREFERENCE_FIELDS` and `AuthUserRecord`.
2. `mapUserToAuthFields` is updated to include `preferredFontSize: user.preferredFontSize ?? null`.
3. `AUTH_USER_COLUMNS` is automatically derived from `AUTH_CORE_FIELDS + AUTH_PREFERENCE_FIELDS`, so the DB query includes the new column.
4. `createSuccessfulLoginResponse` spreads `mapUserToAuthFields(user)`, so the login response includes it.
5. `syncTokenWithUser` is called in the JWT callback — but it manually assigns each field. Developer forgot to add `token.preferredFontSize = fields.preferredFontSize`.
6. JWT token is missing `preferredFontSize`. `mapTokenToSession` also doesn't have it.
7. Session object falls back to `null` (the TypeScript default). User's font size preference is ignored.

**Verdict:** Confirmed — this is a real latent bug. The same pattern caused the `shareAcceptedSolutions` bug in cycle 10.

**Confidence:** HIGH

---

## Flow 3 — `getDropdownItems` fallback shows wrong items for custom roles

**Hypothesis:** A custom role with `problems.create` capability but a non-standard name won't see "Problems" in the dropdown.

**Trace:**
1. Custom role "grader" is created with capabilities: `["problems.create", "submissions.view_all"]`.
2. User with role "grader" logs in.
3. Dashboard layout passes `capabilities: [...resolveCapabilities("grader")]` to `PublicHeader`.
4. `getDropdownItems("grader", ["problems.create", "submissions.view_all"])` is called.
5. `capsSet` is not null (capabilities were provided), so capability-based filtering is used.
6. `capsSet.has("problems.create")` → true. "Problems" item IS shown.
7. If capabilities were NOT provided (fallback path): `role === "instructor" || role === "admin" || role === "super_admin"` → false. "Problems" item would NOT be shown.

**Verdict:** The current code path always provides capabilities when a user is logged in, so the fallback is not triggered in practice. However, the fallback code exists and would produce incorrect results if called.

**Confidence:** MEDIUM — the fallback is dead code in current usage but could be activated by a future refactor.
