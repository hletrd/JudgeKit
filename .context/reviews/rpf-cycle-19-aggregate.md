# RPF Cycle 19 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 77da885d
**Review artifacts:** `rpf-cycle-19-code-reviewer.md`, `rpf-cycle-19-security-reviewer.md`, `rpf-cycle-19-perf-reviewer.md`, `rpf-cycle-19-architect.md`, `rpf-cycle-19-critic.md`, `rpf-cycle-19-debugger.md`, `rpf-cycle-19-test-engineer.md`, `rpf-cycle-19-verifier.md`, `rpf-cycle-19-designer.md`, `rpf-cycle-19-tracer.md`, `rpf-cycle-19-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Duplicate `formatNumber` in dashboard-judge-system-section.tsx — not using shared utility [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), architect (ARCH-1), verifier (V-2), critic (CRI-1 partial)
**Files:** `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:5-7`
**Description:** A local `formatNumber` function exists that is functionally identical to the shared `formatNumber` in `src/lib/datetime.ts` (added in commit 131dc046). The local copy does not import the shared utility, creating a maintenance hazard.
**Concrete failure scenario:** A bug fix or locale-handling improvement applied to the shared `formatNumber` will not propagate to this local copy.
**Fix:** Remove the local `formatNumber` and import from `@/lib/datetime`.

### AGG-2: Clipboard copy `handleCopyKeyPrefix` in api-keys-client silently succeeds on `execCommand` failure [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-4), debugger (DBG-1), tracer (TR-1)
**Files:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:216-228`
**Description:** The `handleCopyKeyPrefix` function has a `document.execCommand("copy")` fallback but does NOT check its return value or show error feedback. If the fallback fails, the user sees a "copied" toast but nothing was actually copied. The `copy-code-button.tsx` was recently fixed (commit 337e306e) to handle this exact case.
**Concrete failure scenario:** On a browser where clipboard access is restricted, both `navigator.clipboard` and `execCommand("copy")` fail silently. The user sees a success toast but nothing was copied.
**Fix:** Check the return value of `execCommand("copy")` and show `toast.error(t("copyFailed"))` if it returns `false`, matching the pattern in `copy-code-button.tsx`.

### AGG-3: Scattered number/byte formatting — no single source of truth, duplicate `formatBytes`/`formatFileSize` [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), architect (ARCH-1), critic (CRI-1)
**Files:** `src/lib/datetime.ts:62-67`, `src/lib/formatting.ts:1-8`, `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:5-7`, `src/app/(dashboard)/dashboard/admin/files/page.tsx:50-54`, `src/app/(dashboard)/dashboard/admin/settings/database-info.tsx:13-18`
**Description:** Number and byte formatting is spread across 5+ files with no single source of truth. `formatNumber` is in `datetime.ts` (wrong module — datetime should not own number formatting), `formatScore` is in `formatting.ts`, and two near-identical byte-formatting functions exist in separate admin pages. The byte-formatting functions use locale-unaware `.toFixed()`.
**Concrete failure scenario:** Adding a non-Latin-numeric locale (Hindi, Arabic) would require updating 5+ separate formatting functions instead of one shared utility.
**Fix:** Consolidate into `src/lib/formatting.ts`:
1. Move `formatNumber` from `datetime.ts` to `formatting.ts` (re-export from `datetime.ts` for backward compat)
2. Add `formatBytes(value, locale?)` using `formatNumber` for locale-aware digit grouping
3. Remove all local copies

### AGG-4: `.toFixed()` used for user-facing numbers in 15+ locations — incomplete i18n adoption [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), critic (CRI-2), document-specialist (DOC-1)
**Files:** `src/app/(public)/users/[id]/page.tsx:82`, `src/app/(public)/_components/public-problem-list.tsx:164`, `src/app/(public)/practice/problems/[id]/page.tsx:174`, `src/app/(public)/languages/page.tsx:90`, and ~11 more
**Description:** The `formatNumber` utility was created to replace locale-unaware number formatting, but 15+ `.toFixed()` calls remain in user-facing components. The JSDoc for `formatNumber` says to prefer it over `.toFixed()` for user-facing display, but this policy is not enforced.
**Concrete failure scenario:** A Hindi locale user sees `1,234.5` (Western formatting) mixed with correctly formatted numbers in other parts of the UI.
**Fix:** Systematically replace `.toFixed()` in public-facing components with locale-aware alternatives. Priority: success rates, accuracy percentages, difficulty scores on public pages.

### AGG-5: Practice page Path B progress filter still fetches all matching IDs + submissions into memory [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1)
**Files:** `src/app/(public)/practice/page.tsx:410-519`
**Description:** This was identified in cycle 18 (AGG-3) and remains unfixed. When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, and paginates. The code has a comment acknowledging this should be moved to SQL.
**Fix:** Move the progress filter logic into a SQL CTE or subquery. This is a scale concern, not an immediate bug.

### AGG-6: Plan status tracking is stale — several open plans have items already DONE in code [LOW/HIGH]

**Flagged by:** critic (CRI-3)
**Files:** Multiple plan files under `plans/open/`
**Description:** Previous cycles have flagged stale plan statuses. The rpf-cycle-18 plan was correctly updated, but older plans may still have inaccurate TODO items. This wastes review effort.
**Fix:** Audit all open plan files and archive those where all items are DONE.

### AGG-7: `formatNumber` placed in `datetime.ts` — wrong module for number formatting concern [LOW/MEDIUM]

**Flagged by:** architect (ARCH-1), critic (CRI-1)
**Files:** `src/lib/datetime.ts:62-67`
**Description:** `formatNumber` is a number formatting utility placed in a datetime module. A `formatting.ts` module already exists with `formatScore`. Number formatting should live with other formatting utilities.
**Fix:** Move `formatNumber` to `src/lib/formatting.ts` and re-export from `datetime.ts` for backward compatibility.

### AGG-8: No unit tests for `formatNumber` and `formatBytes` utilities [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1, TE-2)
**Files:** `src/lib/datetime.ts:62-67`, and the future `formatBytes` in `formatting.ts`
**Description:** Shared formatting utilities should have test coverage for edge cases (NaN, Infinity, 0, negative, large numbers, different locales).
**Fix:** Add unit tests when consolidating into shared utility.

### AGG-9: `SubmissionListAutoRefresh` polls at fixed intervals without backoff or error handling [LOW/LOW]

**Flagged by:** perf-reviewer (PERF-2), debugger (DBG-2 partial)
**Files:** `src/components/submission-list-auto-refresh.tsx:22-28`
**Description:** The auto-refresh component polls at fixed intervals without error handling or backoff. During server overload, this could worsen the load.
**Fix:** Add error-state tracking and switch to longer intervals on consecutive failures.

### AGG-10: `forceNavigate` bypasses Next.js router — call sites should be audited [LOW/LOW]

**Flagged by:** architect (ARCH-3), tracer (TR-2)
**Files:** `src/lib/navigation/client.ts:3-5`
**Description:** `forceNavigate` uses `window.location.assign()` which causes full page reloads. Call sites should be audited to ensure they need hard navigation.
**Fix:** Audit call sites and add JSDoc documenting appropriate usage.

### AGG-11: Mobile menu sign-out button touch target below recommended 44px [LOW/LOW]

**Flagged by:** designer (DES-2)
**Files:** `src/components/layout/public-header.tsx:318-326`
**Description:** The mobile sign-out button uses `py-2 text-sm` (~36px height), meeting the WCAG 2.2 minimum of 24px but below the recommended 44px for mobile touch targets.
**Fix:** Consider increasing padding to `py-3` for better mobile touch accessibility.

## Verified Safe / No Regression Found

- All cycle-18 fixes confirmed working (formatNumber, access code locale, userId assertion, clipboard feedback)
- Korean letter-spacing compliance is comprehensive — all instances properly conditional
- No `as any`, `@ts-ignore`, `@ts-expect-error` in the codebase
- Only 2 eslint-disable directives, both with justification
- HTML sanitization uses DOMPurify with strict allowlists for both `dangerouslySetInnerHTML` uses
- No `innerHTML` assignments
- Auth flow remains robust with Argon2id, timing-safe dummy hash, rate limiting
- CSRF protection consistent across all mutation routes
- All `new Date()` in API routes migrated to `getDbNowUncached()` where temporal consistency matters
- Navigation is centralized via shared `public-nav.ts`
- Bidirectional JSDoc reference between `DROPDOWN_ICONS` and `DROPDOWN_ITEM_DEFINITIONS` is maintained

## Agent Failures

None. All 11 review perspectives completed successfully.
