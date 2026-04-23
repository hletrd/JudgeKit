# RPF Cycle 3 — Designer (UI/UX)

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### DES-1: `compiler-client.tsx` stdin `<textarea>` uses raw HTML element instead of `<Textarea>` component — inconsistent styling [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:466-483`
**Confidence:** HIGH

The stdin input area uses a raw `<textarea>` with inline Tailwind styles. This is inconsistent with:
- The test case name input which uses `<Input>` component (line 444)
- The question textarea in `contest-clarifications.tsx` which uses `<Textarea>` component
- The answer textarea in `contest-clarifications.tsx` which uses `<Textarea>` component

The raw textarea misses:
- Consistent focus ring styling (uses custom `focus:border-ring focus:ring-3 focus:ring-ring/15` instead of the shared component's focus ring)
- Dark mode theme consistency
- Disabled state styling

**Fix:** Replace with `<Textarea>` component from `@/components/ui/textarea`.

---

### DES-2: `compiler-client.tsx` `TruncatedOutput` expand button uses raw `<button>` instead of `<Button>` [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:106-115`
**Confidence:** HIGH

The "Show full output" button uses a raw `<button>` with inline Tailwind classes instead of the shared `<Button>` component. This is the same issue that was fixed for the anti-cheat privacy notice in cycle 2 (AGG-10).

**Fix:** Replace with `<Button variant="link" size="sm">` or similar.

---

### DES-3: `contest-clarifications.tsx` shows raw `userId` for other users' clarifications [LOW/MEDIUM]

**File:** `src/components/contest/clarifications.tsx:263`
**Confidence:** HIGH

Line 263 shows `clarification.userId` as the author identifier when the current user is not the author:
```tsx
{clarification.userId === currentUserId ? t("askedByMe") : clarification.userId}
```

Displaying a raw UUID to users is not meaningful. It should either show the user's name (if available) or a generic label like "Another participant".

**Fix:** Either include the user's name in the `ContestClarification` type (fetched from API) or use a generic label like `t("askedByOther")`.

---

### DES-4: `contest-clarifications.tsx` no loading skeleton for clarification list [LOW/LOW]

**File:** `src/components/contest/clarifications.tsx:242-243`
**Confidence:** LOW

When loading, the component shows a plain text "Loading..." message instead of a skeleton or spinner. Other list views in the app (submissions, problems) use skeleton loading states.

**Fix:** Replace with `<Skeleton>` components for better perceived performance.

---

## Verified Safe

- `anti-cheat-monitor.tsx` privacy notice now uses `<Button>` component (fixed in cycle 2)
- `submission-detail-client.tsx` uses `formatScore` for locale-aware display (fixed in cycle 2)
- ARIA attributes are used correctly throughout: `role="status"`, `aria-live="polite"`, `role="alert"`, `role="timer"`
- Keyboard navigation is supported with focus-visible rings
- WCAG contrast ratios appear adequate in light/dark modes
