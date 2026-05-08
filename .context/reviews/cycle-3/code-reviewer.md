# Cycle 3/3 — Code Reviewer

**HEAD:** main / c6f92a37
**Focus:** Final correctness + dead-comment / drift sweep across cycle 1+2 commits.

---

## C3-01 — Stale `AppSidebar` references in comments — LOW / HIGH
- **Files & lines:**
  - `src/lib/navigation/public-nav.ts:105` — `Capability checks must stay aligned with AppSidebar's filterItems().`
  - `src/components/layout/public-header.tsx:37` — `Must stay aligned with AppSidebar's capability checks.`
  - `src/lib/auth/sign-out.ts:68` — `Shared sign-out handler used by both PublicHeader and AppSidebar.`
  - `src/lib/assignments/active-timed-assignments.ts:18` — `See \`getActiveTimedAssignmentsForSidebar\``
- **Evidence:** `AppSidebar` was deleted in cycle 2 (commit 8c411b08). Comments still point at it.
- **Fail mode:** Future readers chase a non-existent file; documentation lies.
- **Fix:** Drop / rephrase. The capability-alignment comment in `public-nav.ts` and `public-header.tsx` should reference admin landing (`ADMIN_NAV_GROUPS`) and the dropdown-vs-landing surfaces instead. The sign-out doc should say "PublicHeader" only. The `active-timed-assignments.ts` docstring should describe the helper's intent without referencing the dead consumer.
- **Confidence:** HIGH.

## C3-02 — `getActiveTimedAssignmentsForSidebar` is now orphaned in production — MEDIUM / HIGH
- **File:** `src/lib/assignments/active-timed-assignments.ts:49`
- **Evidence:** The only consumer was `ActiveTimedAssignmentSidebarPanel` (deleted) and `AppSidebar` (deleted). Test file `tests/unit/assignments/active-timed-assignments.test.ts` still imports it but only to exercise the helper itself.
- **Fail mode:** Dead production code with passing unit tests gives false confidence; timed-assignment "active now" UX never reaches the user. Banner re-host (cycle-2 plan F9) was deferred.
- **Fix this cycle:** Rename the export to `getActiveTimedAssignments` (drop the `ForSidebar` suffix) and update the doc to say "consumed by future banner / floating widget surfaces". Keep behavior identical so existing tests pass after a single rename. Defer actually re-hosting the panel as UX work to a later cycle (it is no longer regression risk because no surface ever rendered it post-cycle-1).
- **Confidence:** HIGH on the dead-link diagnosis. MEDIUM on the rename being the right fix vs a delete; rename is safer (preserves caller surface, no behavior change, fixes the misleading name).

## C3-03 — Korean letter-spacing rule violation in `recruit/[token]/results/page.tsx` — MEDIUM / HIGH
- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:268, 278`
- **Evidence:**
  ```
  <p className="text-xs uppercase tracking-wide text-muted-foreground">
    {t("totalScore")}
  </p>
  <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
    {t("perProblemBreakdown")}
  </h2>
  ```
  Both labels are i18n-translated and render Korean glyphs (`총 점수`, `문제별 결과`). `tracking-wide` violates `CLAUDE.md`'s "Keep Korean text at the browser/font default letter spacing" rule.
- **Fail mode:** Awkward Korean rendering on the candidate-facing recruiting results page (highest-stakes user-visible surface in recruiting mode).
- **Fix:** Resolve `locale` (already imported via `getLocale()`) and apply the `locale !== "ko" ? " tracking-wide" : ""` pattern used elsewhere (`src/app/(dashboard)/dashboard/admin/page.tsx:35`, `src/app/(public)/_components/public-contest-list.tsx:42`).
- **Confidence:** HIGH.

## C3-04 — `(public)/dashboard/page.tsx` instructor branch double-renders judge system tabs — LOW / MEDIUM
- **File:** `src/app/(public)/dashboard/page.tsx:83-124`
- **Evidence:** When `isInstructorView=true`, `InstructorDashboard` renders, AND lines 113-124 also render `DashboardJudgeSystemSection` (the gate is `!isAdminView && !isCandidateView`). `InstructorDashboard` itself does not render the judge system section, so this is intentional — instructors see ops snapshot below their dashboard. No double render. RECORD ONLY.
- **Confidence:** MEDIUM (no fix, behavioural verification only).

## C3-05 — `(public)/dashboard/page.tsx` student branch redundant guard — LOW / HIGH
- **File:** `src/app/(public)/dashboard/page.tsx:42`
- **Evidence:** `{!canReviewAssignments && !isCandidateView && !isAdminView && (` — `isAdminView` implies `canReviewAssignments` only when the admin role grants it; the guard is correct but verbose. Could simplify to `!canReviewAssignments && !isCandidateView` because `hasAdminWorkspace` (and thus `isAdminView`) being true does not imply `canReviewAssignments` is true (admin caps can be `users.view` only). CHECK: an admin without `submissions.view_all` AND without `assignments.view_status` would have `canReviewAssignments=false` and `isAdminView=true` → student branch would erroneously fire without the `!isAdminView` guard. So keep the guard as-is. RECORD ONLY.
- **Confidence:** HIGH (no fix, documents that the guard is load-bearing).

## C3-06 — `(public)/layout.tsx` allocates `capabilities` even for unauth users — LOW / MEDIUM
- **File:** `src/app/(public)/layout.tsx:20`
- **Evidence:** `const capabilities = session?.user ? [...await resolveCapabilities(session.user.role)] : undefined;`
  This is a one-shot await per request; `resolveCapabilities` is cached per-role. No perf concern; correct behavior.
- **Confidence:** MEDIUM (no fix).

## C3-07 — `getDropdownItems` has no admin role early-bail — LOW / MEDIUM
- **File:** `src/lib/navigation/public-nav.ts:123-130`
- **Evidence:** When session resolves with caps, admin sees the Admin entry. Before caps resolve (capabilities undefined), the Admin entry is hidden — same as cycle-2 finding C2-07. Layout server-renders with caps so this is not user-visible in production. RECORD ONLY.
- **Confidence:** MEDIUM.

## C3-08 — `dashboard.adminQuickActions` fully removed — PASS / HIGH
- **Files:** scanned `messages/en.json`, `messages/ko.json`, all `.ts/.tsx` — no occurrences. Cycle 2's A7 landed cleanly.
- **Confidence:** HIGH.

## C3-09 — `(dashboard)/layout.tsx` calls `getTranslations("common")` thrice in `getResolvedSystemSettings` arg — LOW / MEDIUM
- **File:** `src/app/(dashboard)/layout.tsx:40-43`
- **Evidence:**
  ```
  getResolvedSystemSettings({
    siteTitle: (await getTranslations("common"))("appName"),
    siteDescription: (await getTranslations("common"))("appDescription"),
  }),
  ```
  Two extra `await getTranslations("common")` calls inside the object literal. The outer `Promise.all` already awaits a `tCommon` binding. Should reuse `tCommon`.
- **Fail mode:** Minor overhead per dashboard request; cosmetic. No correctness issue.
- **Fix:** Lift `tCommon` resolution outside the `Promise.all` (it's already resolved as the second item), or pre-resolve `tCommon` and reference it in the arg object.
- **Confidence:** MEDIUM (cosmetic; defer if cycle is full).

## C3-10 — Comment inconsistency around `nav.problems` segment — LOW / HIGH
- **File:** `src/components/layout/breadcrumb.tsx:10` — `SEGMENT_LABEL_MAP` includes `assignments: "problemSets"`. This re-uses the `nav.problemSets` key for `assignments` URL segment, which is intentional (assignments routes redirect to problem-sets). Verified harmless.
- **Confidence:** HIGH (no fix).

---

## SUMMARY

Cycle 1+2 landed cleanly. Final-cycle issues are limited to (a) stale `AppSidebar` references in code comments, (b) the orphaned `getActiveTimedAssignmentsForSidebar` helper name + docs, and (c) a real Korean letter-spacing rule violation on the candidate-facing recruit results page. None are functional regressions; the recruit results page Korean spacing is the only user-visible defect.
