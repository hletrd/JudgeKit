# RPF Cycle 16 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 58da97b7
**Review artifacts:** rpf-16-code-reviewer.md, rpf-16-security-reviewer.md, rpf-16-perf-reviewer.md, rpf-16-architect.md, rpf-16-critic.md, rpf-16-debugger.md, rpf-16-verifier.md, rpf-16-test-engineer.md, rpf-16-tracer.md, rpf-16-designer.md, rpf-16-document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: Bulk recruiting invitations route missing `expiryDateInPast` validation [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), critic (CRI-1), debugger (DBG-1), verifier (VER-1), test-engineer (TE-1), tracer (TR-1)
**Files:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
**Description:** The bulk invitations route computes `expiresAt` from `expiryDate` and checks the upper bound (`expiryDateTooFar`) but does NOT check whether the date is in the past. The single-create route (line 78-79) and the PATCH route (line 115-116) both reject past dates with `expiryDateInPast`. The bulk route omits this check. A past-date invitation is created in "pending" status but is immediately expired (since `isExpired` compares `expiresAt <= dbNow`), creating a confusing state.
**Concrete failure scenario:** Admin bulk-creates 5 invitations with `expiryDate: "2020-01-01"`. All 5 are created (200) but are immediately expired. They appear in the "Expired" filter and cannot be redeemed.
**Fix:** Add `if (expiresAt <= dbNow) throw new Error("expiryDateInPast");` after computing `expiresAt` from `expiryDate` in the bulk route, before the `expiryDateTooFar` check.
**Cross-agent signal:** 7 of 11 agents flagged this.

### AGG-2: Unhandled `navigator.clipboard.writeText()` in multiple client components [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2, CR-3, CR-4), security-reviewer (SEC-2), architect (ARCH-1), critic (CRI-2), debugger (DBG-2, DBG-3), verifier (VER-2)
**Files:**
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:168-171` — not awaited, not in try/catch
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:90-96` — not in try/catch
- `src/components/contest/recruiting-invitations-panel.tsx:308-312` — inline onClick, not in try/catch

**Description:** Several clipboard operations lack try/catch, while other components in the same codebase correctly wrap them. The rpf-15 M1 fix added try/catch to `handleCopyLink` in the recruiting invitations panel but missed other call sites. The workers-client function is not even async, so the clipboard promise floats unhandled and the success toast fires before the clipboard resolves.
**Concrete failure scenario:** User on HTTP (non-HTTPS) context clicks "Copy". The clipboard API throws, causing an unhandled promise rejection. The success toast fires anyway, misleading the user.
**Fix:** Wrap all `navigator.clipboard.writeText()` calls in try/catch with error toasts. Consider extracting a shared `useClipboard` hook for consistency.
**Cross-agent signal:** 8 of 11 agents flagged this (partially or fully).

### AGG-3: Copy-feedback `setTimeout` not tracked/cleaned up on unmount in multiple components [LOW/LOW]

**Flagged by:** code-reviewer (CR-3, CR-5), critic (CRI-3)
**Files:**
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:95` — untracked setTimeout
- `src/components/contest/access-code-manager.tsx:48` — untracked setTimeout
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:60` — untracked setTimeout (shaking animation)

**Description:** The rpf-15 M2 fix added timer tracking with a ref in the recruiting invitations panel, but the same pattern issue exists in other components. Untracked `setTimeout` calls that set state can fire after unmount. While React 18+ no longer warns for this, it is a code quality inconsistency.
**Fix:** Track timers with refs and clean up in useEffect returns, or use a shared `useClipboard` hook that handles this.
**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-4: Public problem detail "Rankings" button uses hardcoded English label [LOW/MEDIUM]

**Flagged by:** designer (DES-1)
**File:** `src/app/(public)/practice/problems/[id]/page.tsx:400`
**Description:** The "Rankings" button in the problem statistics card uses a hardcoded English string instead of an i18n key. All other labels on the page use translation functions. This will display "Rankings" in English even in Korean locale.
**Fix:** Replace `Rankings` with an i18n key like `t("practice.viewRankings")` or `tCommon("rankings")`.
**Cross-agent signal:** 1 of 11 agents (designer).

### AGG-5: Mobile menu dropdown items lack icons (inconsistent with desktop dropdown) [LOW/LOW]

**Flagged by:** designer (DES-3)
**File:** `src/components/layout/public-header.tsx:305-314`
**Description:** The mobile menu renders dropdown items without the `DROPDOWN_ICONS` that are shown in the desktop dropdown. This creates an inconsistent experience between desktop and mobile.
**Fix:** Add `{DROPDOWN_ICONS[item.href]}` to the mobile panel's dropdown items.
**Cross-agent signal:** 1 of 11 agents (designer).

### AGG-6: Public problem detail page issues 6-7 sequential DB queries [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1)
**File:** `src/app/(public)/practice/problems/[id]/page.tsx:111-213`
**Description:** The component executes multiple independent DB queries sequentially after the initial problem query. Several (language configs, stats, similar problems, discussion threads) could be parallelized in a `Promise.all`.
**Fix:** Wrap independent DB queries in a `Promise.all` after the problem query resolves.
**Cross-agent signal:** 1 of 11 agents (perf-specific).

### AGG-7: `streamBackupWithFiles` memory buffering architecture (carry from rpf-13, rpf-14, rpf-15) [MEDIUM/HIGH]

**Flagged by:** perf-reviewer (PERF-2)
**File:** `src/lib/db/export-with-files.ts:120-131`
**Description:** Carry-over from rpf-13/14/15. The backup-with-files path collects the entire database export JSON into memory before creating the ZIP. Short-term mitigation (warning log for large exports) not yet implemented.
**Fix:** Short-term: add warning log. Long-term: migrate to streaming ZIP library.
**Cross-agent signal:** 1 of 11 agents (perf-specific). Previously flagged in rpf-13, rpf-14, and rpf-15.

### AGG-8: Workspace-to-public migration plan status descriptions stale [LOW/MEDIUM]

**Flagged by:** document-specialist (DOC-1)
**File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
**Description:** The plan header and Phase 4 section don't reflect cycle 15 progress (edit button on public problem detail). Phase 3 remaining work section lists items that have been partially addressed.
**Fix:** Update the plan header and Phase 4 status to reflect latest progress.
**Cross-agent signal:** 1 of 11 agents.

### AGG-9: `DROPDOWN_ICONS` / `DROPDOWN_ITEM_DEFINITIONS` documentation is one-directional [LOW/LOW]

**Flagged by:** document-specialist (DOC-2)
**Files:** `src/components/layout/public-header.tsx:58-67`, `src/lib/navigation/public-nav.ts:57`
**Description:** The `DROPDOWN_ICONS` constant references `DROPDOWN_ITEM_DEFINITIONS` but the reverse reference is missing. When adding a new dropdown item, a developer might update one side but not the other.
**Fix:** Add a JSDoc note to `DROPDOWN_ITEM_DEFINITIONS` referencing `DROPDOWN_ICONS`.
**Cross-agent signal:** 1 of 11 agents.

## Verified Safe / No Regression Found

- All rpf-15 remediation items correctly implemented — verified.
- Prior fixes intact (clock-skew, capability-based nav, Korean letter-spacing) — verified.
- Auth flow robust (Argon2id, timing-safe dummy hash, rate limiting) — verified.
- HTML sanitization uses DOMPurify with strict allowlist — verified.
- No `innerHTML` assignments, `as any` casts, or `@ts-ignore` — verified.
- Only 2 eslint-disable directives, both with justification comments — verified.
- All `new Date()` in `schema.pg.ts` are INSERT-only `$defaultFn` — verified.
- Navigation centralized via shared `public-nav.ts` — verified.
- `(control)` and `(workspace)` route groups fully removed — verified.

## Agent Failures

None. All 11 review perspectives completed successfully.
