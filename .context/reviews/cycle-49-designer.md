# Cycle 49 — Designer / UI-UX Reviewer

**Date:** 2026-05-12
**HEAD reviewed:** `17a35892`
**Scope:** UI/UX review of new timeline component and related changes

---

## Findings

### C49-UI-1: [MEDIUM] `participant-timeline-bar.tsx` — CSS-only tooltips are inaccessible

**File:** `src/components/contest/participant-timeline-bar.tsx:235-281`
**Confidence:** HIGH

The event markers use a pure CSS `group-hover:block` tooltip:
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[200px] hidden group-hover:block">
```

**Problems:**
1. **No keyboard accessibility**: Users navigating with Tab/keyboard cannot trigger hover, so tooltips never appear.
2. **No touch device support**: Mobile/tablet users cannot hover, so they never see submission details.
3. **No ARIA labels**: The event markers (Link elements) have no `aria-label` describing what they represent.
4. **z-index risk**: `z-50` may not be sufficient if parent containers introduce stacking contexts. The outer container uses `overflow-visible` but ancestor containers could clip.

**Fix:** Add `aria-label` to each marker with descriptive text (problem name, time, status). For touch/keyboard support, consider adding an onClick handler that shows tooltip statefully, or use a proper tooltip component from the UI library.

---

### C49-UI-2: [MEDIUM] `participant-timeline-bar.tsx` — snapshot markers use `<Link href="#">` causing page scroll

**File:** `src/components/contest/participant-timeline-bar.tsx:206-233`
**Confidence:** HIGH

Snapshot events have no `submissionId`, so the Link renders with `href="#"`:
```tsx
<Link
  href={
    ev.submissionId
      ? `/submissions/${ev.submissionId}`
      : "#"
  }
  className="block -translate-x-1/2"
>
```

Clicking a snapshot marker scrolls to the top of the page (`#`). Snapshots are not navigable submissions, so they should not be clickable links at all. They should be non-interactive divs or should open a snapshot viewer modal.

**Fix:** Render snapshots as `<div>` or `<span>` instead of `<Link>`, or conditionally render `<Link>` only when `ev.submissionId` exists.

---

### C49-UI-3: [LOW] `participant-timeline-bar.tsx` — hardcoded English strings

**File:** `src/components/contest/participant-timeline-bar.tsx`
**Confidence:** HIGH

```tsx
firstAccepted: "First Accepted!",
codeSnapshot: (chars: number) => `Code snapshot (${chars} chars)`,
```

These strings are hardcoded English instead of using the `next-intl` translation system. The component already receives a `translations` prop for other strings — these should also be translated.

**Fix:** Add translation keys for "First Accepted!" and "Code snapshot ({chars} chars)" and pass them through the `translations` prop.

---

### C49-UI-4: [LOW] `participant-timeline-view.tsx` — hardcoded English in summary cards

**File:** `src/components/contest/participant-timeline-view.tsx:343-346`
**Confidence:** HIGH

```tsx
<Badge variant="secondary" className="text-xs">
  {summary.totalAttempts} tries
</Badge>
<Badge variant="outline" className="text-xs">
  best: {summary.bestScore ?? "-"}
</Badge>
```

"tries" and "best:" are hardcoded English. These should use the existing translation system (the component already loads `tSubmissions` and `tCommon`).

**Fix:** Add translation keys and use them.

---

### C49-UI-5: [LOW] `participant-timeline-bar.tsx` — event markers may overlap on dense timelines

**File:** `src/components/contest/participant-timeline-bar.tsx:195-284`
**Confidence:** MEDIUM

When many events occur close together in time, their markers overlap visually on the timeline bar. Each marker is positioned absolutely by percentage, and there's no collision detection or stacking offset. For contests with 20+ events in a short time window, markers become unreadable.

**Mitigation:** This is a design limitation of a single-row timeline. The per-problem mini timelines below provide an alternative view. Consider adding a minimum pixel spacing or grouping nearby events.

---

### C49-UI-6: [LOW] `participant-timeline-bar.tsx` — `formatDuration` lacks hour formatting

**File:** `src/components/contest/participant-timeline-bar.tsx:142-146`
**Confidence:** HIGH

Displays "125m 30s" instead of "2h 5m 30s". This is a readability issue for longer contests. Same finding as C49-CODE-2.

---

### C49-UI-7: [LOW] Korean typography compliance

**File:** `src/components/contest/participant-timeline-bar.tsx` (entire file)
**Confidence:** HIGH

No `tracking-*` Tailwind utilities are applied to text elements. Korean text will render with default browser letter spacing, which complies with the project rule in CLAUDE.md. Verified: no custom letter-spacing on Korean content.

---

## Verified UI Improvements

- The unified timeline bar replaces per-event tables with a more visual representation. Good information architecture improvement.
- Color coding by problem is clear and consistent.
- The mini per-problem timelines provide useful secondary context.

---

## No Agent Failures

Single-agent comprehensive review (subagent fan-out unavailable).
