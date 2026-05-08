# Designer Review — Cycle 2 (2026-05-03)

**Reviewer:** designer (UI/UX)
**HEAD:** `689cf61d`

---

## C2-UX-1 (LOW, HIGH confidence) — Recruiting results page has no loading state

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx`

The page is a server component that fetches data on each request. There is no `loading.tsx` file in the `recruit/[token]/results/` directory. This means the user sees a blank page while the server fetches the invitation, assignment, problems, and submissions. On slow connections, this could take several seconds.

**Fix:** Add a `loading.tsx` file with a skeleton UI matching the card layout.

---

## C2-UX-2 (LOW, MEDIUM confidence) — Score display uses `formatScore` which may show excessive decimal places

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:222-224`

The `formatScore` function may produce scores like `66.66666666666667 / 100` for weighted problem scores. This is confusing for candidates who expect integer or single-decimal scores.

**Fix:** Verify `formatScore` rounds to a reasonable number of decimal places (1 or 2). If it doesn't, update the formatting.

---

## C2-UX-3 (LOW, HIGH confidence) — Contact email is rendered as a `mailto:` link without spam protection

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:285`

```tsx
<a className="underline" href={`mailto:${assignment.contactEmail}`}>
  {assignment.contactEmail}
</a>
```

The email is displayed as a clickable `mailto:` link. While this is user-friendly, it exposes the recruiter's email to email harvesting bots since the results page is behind auth but the page HTML may be cached.

**Fix:** Consider using a contact form instead of a raw `mailto:` link. At minimum, add `rel="nofollow"` to the link.

---

## Final Sweep

The recruit results page has a clean, accessible design. Card-based layout with clear hierarchy. The `SubmissionStatusBadge` component provides clear visual feedback. The page correctly hides scores when `hideScoresFromCandidates` is true. Color contrast appears adequate (using default Tailwind palette). The page is responsive using standard Tailwind utilities.
