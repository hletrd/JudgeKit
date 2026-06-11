# Cycle 24 Aggregate Review

**Date:** 2026-04-20
**Base commit:** f1b478bc
**Review artifacts:** `cycle-24-code-reviewer.md`, `cycle-24-security-reviewer.md`, `cycle-24-critic.md`, `cycle-24-architect.md`, `cycle-24-verifier.md`, `cycle-24-test-engineer.md`, `cycle-24-debugger.md`, `cycle-24-perf-reviewer.md`, `cycle-24-designer.md`, `cycle-24-tracer.md`, `cycle-24-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Systematic silent error swallowing across multiple components [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-2, CR-3, CR-4, CR-5), security-reviewer (SEC-1), critic (CRI-1), verifier (V-1), designer (DES-1), tracer (TR-1), document-specialist (DOC-1)
**Files:**
- `src/components/lecture/submission-overview.tsx:101-102` — fetchStats catch
- `src/components/contest/invite-participants.tsx:49-50` — search catch
- `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76` — fetchLogs and fetchMore catch (2 instances)
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:223-224` — tag suggestion catch
- `src/components/contest/participant-anti-cheat-timeline.tsx:120-121` — loadMore catch

**Description:** There is a systematic pattern of `catch { // ignore }` blocks across the codebase that violates the project's own convention documented in `src/lib/api/client.ts`: "Never silently swallow errors — always surface them to the user." Cycle 23 fixed two instances (`contest-quick-stats.tsx` and `contest-clarifications.tsx`), but at least five more remain. When API calls fail, these components show stale or empty data with no error feedback.

**Concrete failure scenario:** An instructor monitoring submission stats during a contest sees stale data after an API 500 error, with no indication the stats are not current. They make decisions based on incorrect information.

**Fix:**
1. Replace each `catch { // ignore }` with toast.error feedback, matching the pattern in `contest-quick-stats.tsx`.
2. For `submission-overview.tsx`: add `toast.error(...)` using the `lecture` i18n namespace.
3. For `invite-participants.tsx`: add `toast.error(t("searchFailed"))` — add i18n key if missing.
4. For `chat-logs-client.tsx`: add `toast.error(...)` using the `admin.chatLogs` i18n namespace.
5. For `create-problem-form.tsx`: add `console.warn("Tag suggestions fetch failed")` (non-critical, console.warn is acceptable).
6. For `participant-anti-cheat-timeline.tsx`: add `toast.error(...)` using the `contests.antiCheat` i18n namespace.

### AGG-2: Dead code — `titleKeyByMode` on hidden AppSidebar nav item [LOW/HIGH]

**Flagged by:** code-reviewer (CR-1), critic (CRI-2), verifier (V-2), document-specialist (DOC-3)
**Files:** `src/components/layout/app-sidebar.tsx:66-67`
**Description:** The "Problems" nav item in `navGroups` has both `titleKeyByMode: { recruiting: "challenges" }` and `hiddenInModes: ["recruiting"]`. When `platformMode === "recruiting"`, `filterItems()` hides the item entirely, so `titleKeyByMode` is dead code.
**Concrete failure scenario:** A developer reading the code assumes "Problems" shows as "Challenges" in recruiting mode, but it's actually hidden.
**Fix:** Remove `titleKeyByMode: { recruiting: "challenges" }` from the "Problems" nav item definition.

### AGG-3: `ContestsLayout` click interception has multiple issues [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-6), security-reviewer (SEC-2), critic (CRI-3), architect (ARCH-1), debugger (DBG-1), perf-reviewer (PERF-1), designer (DES-2), tracer (TR-2), document-specialist (DOC-2)
**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:16-28`
**Description:** The contests layout intercepts all internal `<a>` clicks and forces `window.location.href` navigation as a workaround for a Next.js 16 RSC streaming bug. Multiple issues identified:
1. **stopPropagation breaks React event delegation** (DBG-1, TR-2): Capture-phase `stopPropagation()` prevents React onClick handlers from firing on child elements.
2. **Performance impact** (PERF-1, DES-2): Full page reload on every navigation loses React state and bfcache.
3. **No bug tracker reference** (DOC-2): The comment mentions the bug but doesn't link to a specific issue.
4. **Missing scheme check** (SEC-2): No check for `javascript:` or `data:` scheme URLs before setting `window.location.href`.
5. **Fragile DOM dependencies** (CR-6): Depends on `getElementById("main-content")` and `querySelector("[data-slot='sidebar']")` which may be null.

**Concrete failure scenario:** A contest page has a button with onClick inside an `<a>` tag. The layout's capture-phase listener calls `stopPropagation()`, preventing the button's handler from firing. The user is navigated away instead of seeing the expected action.

**Fix:**
1. Remove `me.stopPropagation()` — rely only on `me.preventDefault()`.
2. Add `javascript:` and `data:` scheme checks before setting `window.location.href`.
3. Add a Next.js GitHub issue link to the comment.
4. Consider adding a `data-force-navigation` attribute to opt specific links into forced navigation.

### AGG-4: `submission-overview.tsx` polling continues when tab is hidden [LOW/MEDIUM]

**Flagged by:** perf-reviewer (PERF-2)
**Files:** `src/components/lecture/submission-overview.tsx:108-114`
**Description:** The `SubmissionOverview` component uses `setInterval(fetchStats, 5000)` but does not pause the interval when the tab is hidden. This is the same pattern fixed for `leaderboard-table.tsx` in cycle 23.
**Concrete failure scenario:** An instructor leaves the lecture stats panel open in a background tab. The interval continues firing every 5 seconds, making unnecessary API calls.
**Fix:** Add visibility-aware pause/resume to the interval, matching the pattern in `leaderboard-table.tsx`.

### AGG-5: Inconsistent error handling patterns lack architectural enforcement [MEDIUM/MEDIUM]

**Flagged by:** architect (ARCH-3), document-specialist (DOC-1)
**Files:** N/A (cross-cutting concern)
**Description:** The codebase has no centralized error handling convention for client-side `apiFetch` calls. Some components show toast errors, some silently swallow, and some set error state flags. The convention documented in `apiFetch` is not enforced by code.
**Fix:** Create a `useApiFetch` hook or wrapper that standardizes error handling. At minimum, add an ESLint rule that flags `catch { // ignore }` patterns.

## Agent Failures

None. All review perspectives completed successfully.
