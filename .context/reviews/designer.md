# Cycle 5 — designer

**Focus:** Regression-check the three cycle-4 settings forms that gained a `currentPassword` reconfirm field (`allowed-hosts-form`, `config-settings-form`, `system-settings-form`) + their en/ko i18n strings, and re-confirm status of the deferred Designer P1/P2 batch.
**Date:** 2026-06-27
**HEAD reviewed:** `7ebea50e`
**Cycle-4 UI surface:** `git diff edd45cca..7ebea50e --name-only -- 'src/**/*.tsx' 'src/**/*.css'` returns **exactly 3 files** — the three settings forms. No `.css`, no other component, no page-level change.
**Method:** Static review of the JSX + i18n + `Label` component source. A dev-server browser pass is not feasible here (the page lives under `(dashboard)/dashboard/admin/` behind auth + a live DB; cycle-4 gate logged `test:e2e skipped (no DB/browser infra locally)`), and the delta is three ~14-line additions to a known-good form scaffold, so static review is the proportionate lens. Multimodal caveat applies: no screenshots — findings reference selectors, classes, and token math.
**Framework (unchanged):** Next.js 16.2.9 + React 19.2 + Tailwind 4 + shadcn/Base UI + next-intl 4.9 + next-themes 0.4.

---

## TL;DR (cycle 5 verdict)

- **Regression:** NONE. The 3 form additions are consistent, accessible (label + `type=password` + `autoComplete=current-password` + `required`), correctly placed (last field before Save), and the en/ko strings are present, sensible, and obey the CLAUDE.md Korean-letter-spacing rule.
- **Net-new (polish tier, LOW only — do not inflate):** Two micro-nits.
  - **UI-15 (LOW):** the new password label uses a plain `<label className="text-sm font-medium">` instead of the `<Label>` component used by every sibling field in two of the forms — small `leading-none`/`select-none` baseline drift inside the same form. Polish.
  - **UI-16 (LOW):** the server-side `passwordReconfirmRequired` error surfaces only as a toast (sonner aria-live) with no inline `role="alert"` next to the field. Marginal because `required` makes the browser-native validation the real user path; the toast is defense-in-depth.
- **Deferred Designer P1/P2 batch:** ALL 14 ITEMS STILL VALID. The cycle-4 .tsx diff touches NONE of the selectors cited in cycle 4 (no leaderboard, sidebar, recruit form, error.tsx, headings, tabs, card.tsx, etc.). Re-confirmed by enumeration, not assumption.
- **Convergence:** 112 → 25 → 28 → now **14 + 2 LOW**. Do not inflate: UI-15 and UI-16 are polish-tier; both can ride along with the existing Cleanup batch.

---

## REGRESSION — cycle-4 settings password-reconfirm field

### REG-6 (CLEAN ✓, HIGH confidence) — `currentPassword` field in the 3 settings forms

**Files:**
- `src/app/(dashboard)/dashboard/admin/settings/allowed-hosts-form.tsx:114-128`
- `src/app/(dashboard)/dashboard/admin/settings/config-settings-form.tsx:117-131`
- `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:531-545`

**Shared shape (identical across all 3):**
```jsx
<div className="space-y-2">
  <label htmlFor="<form>-current-password" className="text-sm font-medium">{t("reconfirmLabel")}</label>
  <Input
    id="<form>-current-password"
    type="password"
    value={currentPassword}
    onChange={...}
    placeholder="••••••••"
    autoComplete="current-password"
    required
  />
  <p className="text-xs text-muted-foreground">{t("reconfirmHint")}</p>
</div>
```

**Checklist (all PASS):**

| Criterion | Status | Evidence |
|---|---|---|
| Field placement | ✓ | Last field before the submit `<Button>` in all 3 forms; sits inside the form's `space-y-4` rhythm, not after the button |
| Label association | ✓ | Each `<label htmlFor>` matches a unique `<Input id>` (`allowed-hosts-`, `config-settings-`, `system-settings-current-password`) — no duplicate ids even though all three forms render on the same `/admin/settings` page |
| `type="password"` | ✓ | All 3 |
| `autoComplete` | ✓ | `current-password` — the correct semantic; browser offers the saved site password (NOT `new-password`, NOT absent) |
| `required` | ✓ | All 3 — browser-native validation blocks empty submit |
| Validation copy empty-submit | ✓ | `passwordReconfirmRequired` string exists in en/ko; surfaced via `toast.error(t(result.error ?? "updateError"))` if server returns it (defense-in-depth behind `required`) |
| `state` seeding | ✓ | `useState("")` — no stale value, no uncontrolled input warning |
| Form-layout break | ✓ None | The field is wrapped in the same `space-y-2` block pattern used by every sibling field; the parent `<form className="space-y-4">` rhythm is preserved |
| Card composition | ✓ | Each form is hosted in its own `<Card>` (`page.tsx:186, 243, 255` + tabs variant), so the password field does not collide visually with another form's submit |

**Verdict:** All three forms are well-placed, accessible, validate empty submit, and do not break form layout.

### REG-7 (CLEAN ✓, HIGH confidence) — en/ko i18n strings

**Selectors:** `messages/en.json:1621-1623`, `messages/ko.json:1621-1623` under `admin.settings`.

| key | en | ko |
|---|---|---|
| `reconfirmLabel` | Confirm with your password | 비밀번호 확인 |
| `reconfirmHint` | Required to save security-sensitive changes. | 보안 관련 설정을 저장하려면 필요해요. |
| `passwordReconfirmRequired` | Enter your current password to save security-sensitive changes. | 보안 관련 설정을 저장하려면 현재 비밀번호를 입력해 주세요. |

**Checks (all PASS):**
- Both locales define all three keys at the same namespace path the forms resolve (`useTranslations("admin.settings")`). No missing keys → no fall-through to key strings.
- Tone matches surrounding copy (the ko `…해요` / `…주세요` register is consistent with the rest of the admin/settings copy).
- **CLAUDE.md Korean-letter-spacing rule: CLEAN.** `grep -c "tracking-" messages/ko.json` → `0`. The ko strings carry no `letter-spacing`/`tracking-*` overrides. Sibling file `home-page-content-form.tsx:49-50` correctly guards its `tracking-wide` behind `locale !== "ko"` — the codebase-wide rule is respected.

---

## NEW UI/UX FINDINGS (cycle 5) — polish tier only

### UI-15 — Password field uses plain `<label>` instead of the `<Label>` component (line-height drift vs sibling labels) — NEW, LOW, MED confidence

**Selectors:**
- `src/app/(dashboard)/dashboard/admin/settings/allowed-hosts-form.tsx:115`
- `src/app/(dashboard)/dashboard/admin/settings/config-settings-form.tsx:118`
- `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:532`

**Issue:** All three password fields use `<label htmlFor="…" className="text-sm font-medium">`. In `config-settings-form.tsx` and `system-settings-form.tsx`, **every other field label uses the `<Label>` component** (`<Label htmlFor="site-title">` at `:212`, `<Label htmlFor="cfg-…">` at `:91`, etc.). The `Label` component (`components/ui/label.tsx:12`) applies:
```
flex items-center gap-2 text-sm leading-none font-medium select-none
group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50
peer-disabled:cursor-not-allowed peer-disabled:opacity-50
```
The plain `<label className="text-sm font-medium">` drops `leading-none` (so line-height resolves to ~1.25rem instead of 1) and `select-none`. The password label therefore sits at a slightly taller line-box than its sibling field labels in the same form — a small vertical-rhythm / baseline mismatch inside one card.

**User impact:** Cosmetic only. No functional issue; label-to-input association is correct. A reviewer with a pixel-ruler would notice the password label is ~3-4px taller than the labels above it in the same card.

**Fix:** Replace the plain `<label>` with `<Label>` in all 3 files. `Label` is already imported in `config-settings-form.tsx:10` and `system-settings-form.tsx:11`; add `import { Label } from "@/components/ui/label";` to `allowed-hosts-form.tsx` (which currently has no `Label` import). Tag-only change, no visual delta once swapped.

**Confidence:** MED-HIGH. The `leading-none` delta is real; the magnitude is small but visible in side-by-side inspection.

### UI-16 — `passwordReconfirmRequired` error is toast-only (no inline `role="alert"` next to the field) — NEW, LOW, LOW-MED confidence

**Selectors:** Identical handler in all 3 forms — `toast.error(t(result.error ?? "updateError"))` then `return`.
- `allowed-hosts-form.tsx:56-58`
- `config-settings-form.tsx:73-75`
- `system-settings-form.tsx:195-197`

**Issue:** When the server action returns `{ success: false, error: "passwordReconfirmRequired" }`, the error surfaces only via a sonner toast. There is no inline `<p role="alert">` adjacent to the password input, and the input has no `aria-describedby` linking it to either the hint or an inline error.

**Mitigations (why this is LOW, not MED):**
- The `required` attribute on the input means the **browser-native "please fill in this field" tooltip on the field itself** is the path real users hit in ~all cases. The toast path is a defense-in-depth fallback for the rare case where client-side validation is bypassed (form submission via JS, an old browser, etc.).
- Sonner toasts use `role="status"`/`aria-live="polite"` (verified in cycle-3 sweeps), so the error IS announced to SR users — just not associated with the field.
- The static hint `<p className="text-xs text-muted-foreground">{t("reconfirmHint")}</p>` already explains *why* the field exists ("Required to save security-sensitive changes." / "보안 관련 설정을 저장하려면 필요해요.").

**User impact:** Marginal. A SR user who triggers the server-side error gets a generic toast announcement without "this is about the password field you just skipped" field-level association. Sighted users see a toast near the top-right corner, not next to the field.

**Fix (optional polish, do NOT block cycle 5 on this):**
1. Add `id="<form>-reconfirm-hint"` to the hint `<p>` and `aria-describedby="<form>-reconfirm-hint"` on the input.
2. If a future iteration wants the inline path, render `<p role="alert" id="<form>-reconfirm-error">{t("passwordReconfirmRequired")}</p>` when a local `submitError === "passwordReconfirmRequired"` state is set, and link via `aria-describedby`. Today the forms use `toast.error` only, so this would also require capturing the error into state.

**Confidence:** MED. The accessibility gap is real but its blast radius is tiny because `required` short-circuits the user path.

---

## DEFERRED DESIGNER P1/P2 BATCH — re-confirmed on head `7ebea50e`

The cycle-4 .tsx diff is exactly `{allowed-hosts,config-settings,system-settings}-form.tsx`. **None of the selectors cited in the cycle-4 review (`edd45cca`) are touched by these edits.** Therefore every item is re-confirmed by re-reading the same selector at the same (or line-shifted) location. Do NOT re-litigate; status unchanged.

| ID | Sev | Status | Cycle-5 note |
|---|---|---|---|
| AGG-58 | P1 | Still present | 27 `<h2>` page titles — none are in the 3 changed files |
| AGG-59 | P1 | Still present | `leaderboard-table.tsx` `hsl(var(--border))` ×4 — not touched |
| AGG-60 | P1 | Still present | `recruit/[token]/recruit-start-form.tsx` — not the settings forms |
| AGG-61 | P1 | Still present | `loading.tsx`/`error.tsx` coverage — no boundary files added this cycle |
| UI-1 | P1 | Still present | `/60` opacity contrast sites — not touched |
| UI-2 | P1 | Still present | `sidebar.tsx` `hsl(var(--sidebar-*))` — not touched |
| UI-3 | P1 | Still present | `tag-form-fields.tsx` inline `hsl(var(--foreground))` — not touched |
| UI-4 | P2 | Still present | `<html nonce>` — not touched |
| UI-5 | P2 | Still present | viewport `viewport-fit`/`themeColor` — not touched |
| UI-6 | P2 | Still present | `api-keys`/`discussions` headings — not touched |
| UI-7 | P2 | Still present | production `console.*` — not touched |
| UI-8 | P2 | Still present | hardcoded status-color palettes — not touched |
| UI-9 | P2 | Still present | `TabsContent` focus-visible — not touched |
| UI-10 | P2 | Still present | sticky `bg-background` vs `bg-card` — not touched |
| UI-11 | P1 | Still present | 5 `error.tsx` render `<h2>` — not touched |
| UI-12 | P2 | Still present | `discussion-moderation-list.tsx` `text-3xl` — not touched |
| UI-13 | P2 | Still present | `CardTitle` is `<div>` — architectural; unchanged |
| UI-14 | P3 | Still present | 14 error `<p>` without `role="alert"` — UI-16 above extends this observation to the new reconfirm error path |

**Batch remediation plan (unchanged from cycle 4):** Batches 1-5 in `plan/cycle-4-2026-06-27-review-remediation.md` Phase B "Designer P1/P2 batch" still stand verbatim. **Batches 1 (drop `hsl(…)` wrappers) and 2 (`<h2>` → `<h1>` tag-only swap) remain trivially cheap and should not defer another cycle.**

---

## SWEEPS THAT CAME BACK CLEAN (cycle 5)

- **Icon-only buttons:** No new icon-only buttons introduced. The "Add" button in `allowed-hosts-form` is text-labeled (`{tCommon("add")}`), the host-remove `<button>` wraps a `<X>` icon but is unchanged from prior cycles (cycle-3/4 sweeps confirmed equivalent patterns). No new finding.
- **Color-only state indicators:** None added.
- **Korean letter-spacing (CLAUDE.md rule):** CLEAN. `grep -rn 'tracking-\|letter-spacing' messages/ko.json` → 0 hits. The 3 forms render label/hint/copy via i18n without any `tracking-*` className anywhere on the input, label, or hint. ✓
- **Form semantics:** Each form is a `<form onSubmit>` with a real submit `<Button>` (no `<div>` pseudo-forms, no `onClick`-only buttons). Keyboard "Enter in password field" submits correctly. ✓
- **Autofill:** `autoComplete="current-password"` is the spec-correct value for "confirm with your current password." Browsers will offer the saved password for the site. ✓
- **Focus management / modals:** No new modals. No focus traps added or removed.
- **i18n parity:** en and ko define the same 3 keys (`reconfirmLabel`, `reconfirmHint`, `passwordReconfirmRequired`) at the same namespace; no orphan keys, no missing translations. ✓

---

## CONFIDENCE SUMMARY (cycle 5)

| ID | Sev | Conf | Status vs cycle 4 |
|---|---|---|---|
| REG-6 | — | HIGH | new — 3 password fields verified (placement, type, label, autoComplete, required) |
| REG-7 | — | HIGH | new — en/ko strings present, sensible, letter-spacing-clean |
| UI-15 | LOW | MED | **NEW** — plain `<label>` vs `<Label>` baseline drift |
| UI-16 | LOW | LOW-MED | **NEW** — reconfirm error toast-only, no inline `role="alert"` |
| AGG-58..AGG-61 | P1 | HIGH | Carry-forward verbatim (zero selector overlap with cycle-4 diff) |
| UI-1..UI-14 | P1/P2/P3 | HIGH | Carry-forward verbatim (zero selector overlap with cycle-4 diff) |

---

## RECOMMENDED FIX ORDER (delta vs cycle-4 plan)

The two new LOW findings fold into the existing **Cleanup (P2/P3, ride-along)** batch — no new batch needed:

- **Cleanup batch (add):** UI-15 — swap `<label>` → `<Label>` in the 3 settings forms (tag-only; in `allowed-hosts-form`, add the `Label` import).
- **Cleanup batch (add, optional):** UI-16 — add `aria-describedby` on the input + `id` on the hint `<p>`. Inline `role="alert"` is a larger lift and is **not** required given the `required` attribute + sonner aria-live.

**Batches 1-5 from cycle 4 remain unchanged and are still the highest-leverage work.** The 3 cycle-4 settings-form additions are production-quality; ship them.
