# Cycle 3 Architecture Review

**Date:** 2026-04-19
**Base commit:** f637c590
**Reviewer:** architect

## Findings

### F1 — Three separate route groups create fragmented auth/layout architecture
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/(workspace)/`, `src/app/(control)/`, `src/app/(dashboard)/`
- **Evidence:** The app has three authenticated route groups (workspace, dashboard, control), each with its own layout, navigation, and auth guard. The workspace group has only two pages (`/workspace` redirect and `/workspace/discussions`). A migration plan exists at `plans/open/2026-04-19-workspace-to-public-migration.md`.
- **Why it matters:** The workspace group exists primarily as a shell for discussions, which could be a tab in the community page. The control group exists for discussion moderation. Maintaining three separate authenticated layouts creates code duplication and inconsistent UX.
- **Suggested fix:** Proceed with the existing migration plan. Phase 1 (eliminate workspace) is low-risk and should be prioritized.

### F2 — CSV export pattern is duplicated across admin routes without shared infrastructure
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/audit-logs/route.ts`, `src/app/api/v1/admin/login-logs/route.ts`, `src/app/api/v1/admin/submissions/export/route.ts`
- **Evidence:** Three admin routes implement CSV export independently. The `escapeCsvField` function was extracted to a shared utility in cycle 2, but the submissions export route still has a local copy. No shared CSV export builder exists.
- **Why it matters:** Consistency fixes (like adding row limits) must be applied to each route independently, increasing the chance of missing one (as happened with the submissions export).
- **Suggested fix:** Create a shared CSV export builder utility that handles pagination, escaping, BOM, and content-disposition headers. Migrate all three routes to use it.

### F3 — `parsePositiveInt` utility exists but is not used consistently
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/lib/validators/query-params.ts` vs `src/app/api/v1/admin/chat-logs/route.ts:19`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:148-149`
- **Evidence:** The shared `parsePositiveInt` utility was created in cycle 2 to prevent NaN bugs, but at least two routes still use raw `parseInt` with manual fallbacks.
- **Why it matters:** Inconsistent usage undermines the purpose of having a shared utility and leaves residual NaN vectors.
- **Suggested fix:** Audit all `parseInt(searchParams` patterns and migrate to `parsePositiveInt`.

### F4 — Plugin secrets architecture lacks encryption-at-rest
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:171-189`, `src/lib/plugins/secrets.ts`
- **Evidence:** Already deferred as CRYPTO-01 in cycle 2. Re-confirming: AI provider API keys are stored as plaintext in the `plugin_config` table. The `src/lib/security/encryption.ts` and `src/lib/security/derive-key.ts` modules already exist for field-level encryption.
- **Why it matters:** DB backup compromise exposes AI provider API keys. The encryption infrastructure already exists in the codebase.
- **Suggested fix:** Encrypt API key fields before storage, decrypt on read. Use `PLUGIN_CONFIG_ENCRYPTION_KEY` env var already referenced in `derive-key.ts`.

## Summary

Found 4 issues: 3 MEDIUM (route group fragmentation, CSV export duplication, plugin secrets), 1 LOW (inconsistent parsePositiveInt usage). The route group migration is already planned. The CSV export infrastructure gap caused the unbounded export bug.
