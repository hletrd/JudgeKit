# Code Quality Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified in Current Code)

All cycle 14 findings are fixed:
- AGG-1 (systemic unguarded `res.json()` — centralized `apiFetchJson` helper): Fixed — helper created and used in anti-cheat-dashboard, analytics-charts, leaderboard-table, participant-anti-cheat-timeline
- AGG-2 (double `res.json()` in create-problem-form): Fixed — now uses single parse + `.catch()` guard
- AGG-3 (problem-import-button file size validation): Fixed — 10MB limit added
- AGG-4 (problem-export-button unguarded `res.json()` + null check): Fixed — `.catch()` and null-safe access added
- AGG-5 (contest-join-client variable shadowing): Fixed — renamed to `errorPayload`

## Findings

### CR-1: Four remaining unguarded `res.json()` calls missed by cycle 14 `apiFetchJson` refactor [MEDIUM/HIGH]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:137` — `const json = await invRes.json();` inside `if (invRes.ok)`, no `.catch()`
- `src/components/contest/recruiting-invitations-panel.tsx:152` — `const json = await statsRes.json();` inside `if (statsRes.ok)`, no `.catch()`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235` — `const wd = await workersRes.json();` inside `if (workersRes.ok)`, no `.catch()`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:241` — `const sd = await statsRes.json();` inside `if (statsRes.ok)`, no `.catch()`

**Description:** The cycle 14 `apiFetchJson` refactor covered 4 components (anti-cheat-dashboard, analytics-charts, leaderboard-table, participant-anti-cheat-timeline) and added `.catch()` guards to several others. However, 4 calls in 2 files were missed. The `recruiting-invitations-panel.tsx` fetch functions (`fetchInvitations` and `fetchStats`) use `apiFetch` directly and call `.json()` without `.catch()` inside `if (res.ok)` blocks. The `workers-client.tsx` fetchData function does the same with both `workersRes` and `statsRes`.

While these are on success paths (after `res.ok` check), a 200 response with non-JSON body (e.g., proxy misconfiguration) would throw an unhandled SyntaxError inside the try-catch, showing a generic error toast with no diagnostic value.

**Concrete failure scenario:** Reverse proxy returns 200 with HTML body instead of JSON. `res.json()` throws SyntaxError. The catch block shows a generic "fetchError" toast, but the user has no indication that the data was malformed.

**Fix:** Either refactor to use `apiFetchJson`, or add `.catch()` guards:
- `recruiting-invitations-panel.tsx`: Use `apiFetchJson` for both fetch calls, or add `.catch(() => ({ data: [] }))` / `.catch(() => ({ data: prev }))`
- `workers-client.tsx`: Use `apiFetchJson` for both fetch calls, or add `.catch(() => ({ data: [] }))` / `.catch(() => ({ data: null }))`

**Confidence:** HIGH

---

### CR-2: `recruiting-invitations-panel.tsx` uses raw `apiFetch` instead of `apiFetchJson` for data fetching — inconsistent with other refactored components [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:133-152`

**Description:** While anti-cheat-dashboard, analytics-charts, leaderboard-table, and participant-anti-cheat-timeline were refactored to use `apiFetchJson` in cycle 14, the recruiting-invitations-panel still uses raw `apiFetch` for its two main fetch operations. This creates inconsistency — some components use the safe centralized helper, others don't.

**Fix:** Refactor `fetchInvitations` and `fetchStats` to use `apiFetchJson`, consistent with other contest components.

**Confidence:** MEDIUM

---

### CR-3: `workers-client.tsx` uses raw `apiFetch` instead of `apiFetchJson` [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:230-245`

**Description:** Same inconsistency as CR-2. The workers-client uses raw `apiFetch` + manual `.json()` parsing without `.catch()` guards, while other admin components have been migrated to `apiFetchJson`.

**Fix:** Refactor `fetchData` to use `apiFetchJson` for both the workers and stats endpoints.

**Confidence:** MEDIUM

---

### CR-4: `recruiting-invitations-panel.tsx` metadata remove button is icon-only without `aria-label` [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`

**Description:** The "remove metadata field" button uses `size="sm"` with only a `Trash2` icon and no `aria-label`. While this is a `size="sm"` button rather than `size="icon"`, it is still effectively an icon-only button (no visible text). Screen readers would announce it as an unlabeled button.

```tsx
<Button variant="ghost" size="sm" onClick={() => setMetadataFields(metadataFields.filter((_, j) => j !== i))}>
  <Trash2 className="h-4 w-4" />
</Button>
```

**Fix:** Add `aria-label={t("removeField")}` or similar i18n key.

**Confidence:** HIGH

---

## Final Sweep

The cycle 14 `apiFetchJson` refactor was a significant improvement, but 4 `res.json()` calls in 2 files were missed. The remaining unguarded calls are in `recruiting-invitations-panel.tsx` (2 calls) and `workers-client.tsx` (2 calls). These files should be migrated to `apiFetchJson` for consistency. A minor accessibility issue was also found with an icon-only button in the metadata fields section.
