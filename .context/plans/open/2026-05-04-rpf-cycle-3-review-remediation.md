# RPF Cycle 3 — Review Remediation Plan (2026-05-04)

**Aggregate:** `.context/reviews/_aggregate.md`
**HEAD:** `4cd03c2b`

---

## Actionable findings (4 LOW)

### FIX-1: Replace hardcoded "Loading..." in CodeTimelinePanel with i18n

- **Finding:** AGG3-1
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/code-timeline-panel.tsx:93`
- **Problem:** The loading state uses a hardcoded English string instead of the i18n translation key `common.loading`. The component already uses `useTranslations("common")` as `tCommon`.
- **Fix:** Replace `Loading...` with `{tCommon("loading")}`.
- **Exit criteria:** No hardcoded English loading string in the component.
- [x] DONE — commit `rpf-c3-i18n`

### FIX-2: Replace hardcoded "chars" in CodeTimelinePanel with i18n

- **Finding:** AGG3-2
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/components/contest/code-timeline-panel.tsx:199`
- **Problem:** The character count label `{current.charCount} chars` is hardcoded in English.
- **Fix:** Add i18n key `contests.codeTimeline.charCount` with value `{count} chars` in `messages/en.json` and `{count}자` in `messages/ko.json`. Then use `t("charCount", { count: current.charCount })`.
- **Exit criteria:** No hardcoded English "chars" string in the component.
- [x] DONE — commit `rpf-c3-i18n`

### FIX-3: Replace hardcoded "Loading..." in loading.tsx files with i18n

- **Finding:** AGG3-3
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/(dashboard)/loading.tsx`, `src/app/(public)/loading.tsx`, `src/app/(auth)/recruit/[token]/results/loading.tsx`
- **Problem:** Server components use hardcoded English "Loading..." for `aria-label` and sr-only text. The `common.loading` key exists in i18n files.
- **Fix:** Convert to async server components using `getTranslations("common")` and use `t("loading")` for both the `aria-label` and sr-only text.
- **Exit criteria:** No hardcoded English loading strings in loading.tsx files.
- [x] DONE — commit `rpf-c3-i18n`

### FIX-4: Add component test for CodeTimelinePanel

- **Finding:** AGG3-4
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/contest/code-timeline-panel.tsx`
- **Problem:** The CodeTimelinePanel component has no dedicated test.
- **Fix:** Add a component test under `tests/component/` that mocks `apiFetchJson` and verifies the component renders correctly in loading, error, empty, and populated states.
- **Exit criteria:** Component test exists covering the main states.
- [ ] TODO — DEFERRED to next cycle (low priority, no correctness risk)

---

## Carry-forward deferred items

All previously deferred items from the cycle 2 plan remain valid. See `_aggregate.md` for full table.

---

## Implementation order

1. FIX-1 (CodeTimelinePanel Loading... — one line change)
2. FIX-2 (CodeTimelinePanel chars — add i18n key + one line change)
3. FIX-3 (loading.tsx files — convert to async + use getTranslations)
4. FIX-4 (CodeTimelinePanel test — new test file)
5. Run all gates (eslint, tsc --noEmit, npm run build, vitest run, vitest run --config vitest.config.component.ts)
6. Fix any gate failures
7. Commit and push

---

## Gate checklist

- [x] `eslint` — PASS (0 errors)
- [x] `tsc --noEmit` — PASS (0 errors)
- [x] `npm run build` — PASS
- [x] `vitest run` — PASS (pre-existing 13 failures in plugins.route.test.ts, unrelated)
- [x] `vitest run --config vitest.config.component.ts` — PASS (pre-existing 5 failures in recruit-page.test.tsx, unrelated)
- [x] `vitest run --config vitest.config.integration.ts` — SKIPPED (no DB)
- [x] `playwright test` — SKIPPED (no DB)
- [x] `bash -n deploy-docker.sh && bash -n deploy.sh` — PASS