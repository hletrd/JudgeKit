# Cycle 24 Code Reviewer

**Date:** 2026-04-20
**Base commit:** f1b478bc

## Findings

### CR-1: Dead code — `titleKeyByMode` on hidden sidebar nav item [LOW/HIGH]

**Files:** `src/components/layout/app-sidebar.tsx:66-67`
**Description:** The "Problems" nav item in `navGroups` has both `titleKeyByMode: { recruiting: "challenges" }` and `hiddenInModes: ["recruiting"]`. When `platformMode === "recruiting"`, `filterItems()` hides the item entirely due to `hiddenInModes`, so `titleKeyByMode` is dead code that can never execute. This is confusing for maintainers who may think the item is visible in recruiting mode with an alternate label.
**Concrete failure scenario:** A developer reading the code assumes "Problems" shows as "Challenges" in recruiting mode, but it's actually hidden.
**Fix:** Remove `titleKeyByMode: { recruiting: "challenges" }` from the "Problems" nav item definition.
**Confidence:** HIGH

### CR-2: Silent error swallowing in `submission-overview.tsx` fetchStats [MEDIUM/MEDIUM]

**Files:** `src/components/lecture/submission-overview.tsx:101-102`
**Description:** The `fetchStats` callback catches all errors with `catch { // ignore }`. Per the project convention documented in `src/lib/api/client.ts` ("Never silently swallow errors — always surface them to the user"), this violates the project standard. If the API is down or returns malformed data, the instructor sees stale stats with no indication of failure. The similar `contest-quick-stats.tsx` was fixed in cycle 23 to show a toast error.
**Concrete failure scenario:** An instructor is monitoring live submission stats during a contest. The API returns a 500 error. The UI continues showing stale stats with no error feedback, leading the instructor to believe the stats are current.
**Fix:** Add `toast.error(...)` in the catch block, matching the pattern established in `contest-quick-stats.tsx`.
**Confidence:** MEDIUM

### CR-3: Silent error swallowing in `invite-participants.tsx` search [MEDIUM/MEDIUM]

**Files:** `src/components/contest/invite-participants.tsx:49-50`
**Description:** The `search` callback catches all errors with `catch { // ignore }`. If the search API fails, the user sees no results with no indication that an error occurred. The `handleInvite` function in the same file correctly shows `toast.error(t("inviteFailed"))` on error, but the search function does not.
**Concrete failure scenario:** An instructor searches for a student to invite to a contest. The API call fails. The UI shows "No results" with no error feedback, leading the instructor to believe the student doesn't exist rather than that the search failed.
**Fix:** Add `toast.error(t("searchFailed"))` or a generic search error toast in the catch block.
**Confidence:** MEDIUM

### CR-4: Silent error swallowing in `create-problem-form.tsx` tag fetch [LOW/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:223-224`
**Description:** The tag suggestion fetch catches all errors with `catch { // ignore }`. Tag suggestions are a non-critical enhancement, so swallowing the error is more defensible here, but it still violates the project convention.
**Concrete failure scenario:** A problem author types in the tag field and gets no suggestions. They don't know if there are no matching tags or if the fetch failed.
**Fix:** Add a `console.warn` at minimum, or show a subtle indicator that suggestions are unavailable.
**Confidence:** MEDIUM

### CR-5: Silent error swallowing in `chat-logs-client.tsx` (2 instances) [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:61-62,75-76`
**Description:** Two `catch { // ignore }` blocks: one for `fetchLogs` (line 61) and one for `fetchMore` (line 75). Both swallow errors silently. For an admin tool, this is problematic because the admin has no way to know if the data is stale or the fetch failed.
**Concrete failure scenario:** An admin reviewing chat logs sees a partial list. They don't know if there are no more logs or if the fetch failed.
**Fix:** Add toast.error in both catch blocks, matching the pattern used in other admin pages.
**Confidence:** MEDIUM

### CR-6: `ContestsLayout` intercepts ALL internal link clicks [MEDIUM/MEDIUM]

**Files:** `src/app/(dashboard)/dashboard/contests/layout.tsx:16-28`
**Description:** The layout uses a click event handler on `#main-content` and `[data-slot='sidebar']` that intercepts ALL internal `<a>` clicks and forces `window.location.href` navigation. This is a workaround for a Next.js 16 RSC streaming bug. However, this approach has several problems:
1. It breaks Next.js client-side navigation for ALL links on contest pages, not just problematic ones.
2. It uses `me.stopPropagation()` which can prevent other click handlers from firing.
3. The `href.startsWith("http")` check only excludes absolute URLs, not protocol-relative URLs.
4. The `getElementById("main-content")` and `querySelector("[data-slot='sidebar']")` may return null if the DOM isn't ready, silently failing to attach the handler.
**Concrete failure scenario:** A custom button with an `<a>` wrapper inside contest pages has its own onClick handler. The layout's handler calls `stopPropagation()`, preventing the custom handler from running.
**Fix:** This is a workaround for a Next.js bug. Add a comment explaining the specific bug and consider scoping the interception to only `<Link>` components from Next.js, or using a data attribute to opt specific links out. At minimum, add a JSDoc explaining the tradeoff and when the workaround can be removed.
**Confidence:** MEDIUM
