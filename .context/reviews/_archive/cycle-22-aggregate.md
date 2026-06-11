# Cycle 22 Aggregate Review (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746
**Review artifacts:** `cycle-22-code-reviewer.md`, `cycle-22-security-reviewer.md`, `cycle-22-perf-reviewer.md`, `cycle-22-architect.md`, `cycle-22-critic.md`, `cycle-22-debugger.md`, `cycle-22-designer.md`, `cycle-22-verifier.md`, `cycle-22-test-engineer.md`, `cycle-22-tracer.md`, `cycle-22-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Chat widget plugin bypasses centralized `apiFetch` CSRF protection [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), architect (ARCH-2), critic (CRI-1), tracer (TR-1), verifier (V-1)
**Files:** `src/lib/plugins/chat-widget/admin-config.tsx:89-92`, `src/lib/plugins/chat-widget/chat-widget.tsx:154`
**Description:** Two client-side `fetch()` calls in the chat widget plugin manually set `X-Requested-With: XMLHttpRequest` instead of using `apiFetch` from `@/lib/api/client`. The cycle-21 H1 fix migrated 11 similar raw fetch calls in admin components to `apiFetch`, but missed these two because the audit was scoped to `src/app/(dashboard)/dashboard/admin/` and did not include `src/lib/plugins/`. Any future CSRF hardening applied to `apiFetch` will not cover these endpoints.
**Concrete failure scenario:** A CSRF protection enhancement is added to `apiFetch` (e.g., a `X-CSRF-Token` header). The two chat widget calls continue to use only `X-Requested-With`, which may not satisfy the updated server-side CSRF validation, resulting in 403 errors. Alternatively, an attacker could craft a CSRF request matching only the old header pattern.
**Fix:** Replace raw `fetch()` with `apiFetch()` in both files, removing the manual `X-Requested-With` header.
**Cross-agent signal:** 6 of 11 agents flagged this independently -- very high signal.

### AGG-2: `access-code-manager.tsx` `fetchCode` silently swallows errors and non-OK responses [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2), debugger (DBG-1)
**Files:** `src/components/contest/access-code-manager.tsx:38-48`
**Description:** The `fetchCode` callback has an empty `catch` block and an `if (res.ok)` check that does nothing on non-OK responses. When the fetch fails (e.g., 403, 500), the component silently shows no access code with no error indication to the user.
**Concrete failure scenario:** A contest admin opens the access code panel after losing access. The API returns 403, but the component silently shows nothing. The admin thinks the feature is broken.
**Fix:** Add error handling: show a toast error on catch and on non-OK responses, matching the pattern in `handleGenerate`.
**Cross-agent signal:** 2 of 11 agents flagged this.

### AGG-3: `formatNumber` deprecated re-export from `datetime.ts` still present [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), architect (ARCH-1), document-specialist (DOC-2)
**Files:** `src/lib/datetime.ts:61`
**Description:** `formatNumber` was moved to `formatting.ts` and re-exported from `datetime.ts` with a `@deprecated` JSDoc tag. The re-export should be removed once all imports are updated. This creates two import paths for the same function and confuses new developers.
**Fix:** Update all imports from `@/lib/datetime` to `@/lib/formatting` for `formatNumber`, then remove the re-export.
**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-4: Practice page Path B progress filter still fetches all matching IDs + submissions into memory [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1)
**Files:** `src/app/(public)/practice/page.tsx:412-449`
**Description:** Carried forward from cycle 18 (AGG-3) and deferred in cycle-21 plan (DEFER-1). When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, then paginates. This is a scale concern, not an immediate bug.
**Fix:** Move the progress filter logic into a SQL CTE or subquery (deferred until problem count exceeds 5,000).
**Cross-agent signal:** 1 of 11 agents flagged this (recurring from prior cycles).

### AGG-5: Workers page polls every 10 seconds regardless of tab visibility [LOW/LOW]

**Flagged by:** perf-reviewer (PERF-2), designer (DES-1)
**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:244`
**Description:** The workers admin page polls every 10 seconds regardless of tab visibility. The `SubmissionListAutoRefresh` component already implements visibility checking as a best practice.
**Fix:** Use `visibilitychange` event to pause/resume polling.
**Cross-agent signal:** 2 of 11 agents flagged this.

### AGG-6: No unit tests for `apiFetch` centralized wrapper [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1)
**Files:** `src/lib/api/client.ts`
**Description:** The `apiFetch` function is a critical security wrapper that adds the CSRF `X-Requested-With` header to all requests. It has no unit tests. Given that 11 call sites were recently migrated to use it, verifying its behavior with tests would prevent regressions.
**Fix:** Add unit tests for `apiFetch`: verifies header is added when not present, preserves existing headers, does not duplicate header if already set.
**Cross-agent signal:** 1 of 11 agents flagged this.

### AGG-7: Cycle-21 M4 (ConfirmAction discriminated union) marked PENDING but appears DONE in code [INFO/HIGH]

**Flagged by:** verifier (V-2), document-specialist (DOC-1)
**Files:** `plans/open/2026-04-20-rpf-cycle-21-review-remediation.md:124`
**Description:** The plan shows M4 status as PENDING, but commit `c89d7432` explicitly includes M4 in its commit message. The code change is present in `language-config-table.tsx`.
**Fix:** Update M4 status to DONE in the plan.
**Cross-agent signal:** 2 of 11 agents flagged this.

## Verified Safe / No Regression Found

- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- HTML sanitization uses DOMPurify with strict tag/attribute allowlists, URI regexp blocking, auto-rel=noopener.
- No `innerHTML` assignments, `as any` casts, `@ts-ignore`, or unsanitized SQL queries.
- Only 2 eslint-disable directives, both with justification comments.
- All `new Date()` in API routes migrated to `getDbNowUncached()` where temporal consistency matters.
- Korean letter-spacing remediation is comprehensive -- all headings and labels properly locale-conditional.
- The workspace-to-public migration is complete: no `/workspace` references, `(control)` group merged.
- Navigation is centralized via shared `public-nav.ts`.
- `SystemTimezoneProvider` is properly wired in root layout and used by all client components that display timestamps.
- All clipboard operations have proper error handling.
- `SubmissionListAutoRefresh` checks `document.visibilityState` before refreshing.
- Public problem detail page parallelizes independent queries with `Promise.all`.

## Agent Failures

None. All 11 review perspectives completed successfully.
