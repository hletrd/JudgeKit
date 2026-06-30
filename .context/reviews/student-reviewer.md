# Student Review — Cycle 1 (2026-06-30)

> Persona: junior CS student, Korean/English bilingual, macOS Safari + Windows Chrome, occasional phone browsing.
> Scope: student-facing paths — practice list, problem detail, submission form, contest page, exam components, dashboard, hooks.

---

## 1. Submission Experience — 7/10

### What works

- Draft persistence is layered: `localStorage` per `(userId, problemId, language)` plus a server-side backup via `useServerSourceDraft`. When I open a problem on a new device, my code reappears with a toast showing the save time — reassuring during an exam.
- `useUnsavedChangesGuard` blocks browser close via `beforeunload` and intercepts Next.js client navigation when the editor is dirty.
- Language selection follows the preference chain `problem default → user preference → site default → C → first available` and never renders an empty picker for function problems (falls back to all languages if gating would remove everything).
- Run-before-submit is available with stdout/stderr/compile output and a "Show more" truncation toggle.
- The submit shortcut label adapts to the platform (⌘+Enter on Mac, Ctrl+Enter elsewhere) and CodeMirror actually binds `Mod-Enter`.
- Mobile submit UI switches to a bottom Sheet; desktop uses an inline panel.

### Issues

**HIGH — `src/hooks/use-unsaved-changes-guard.ts:5`**
`DEFAULT_WARNING_MESSAGE = "You have unsaved code changes. Leave this page?"` is hardcoded English. It appears in the browser's native `window.confirm()` and `beforeunload` dialog, which cannot be styled and are not internationalized. The hook accepts a `warningMessage` prop, but `ProblemSubmissionForm` at `src/components/problem/problem-submission-form.tsx:103` passes none:

```ts
const { allowNextNavigation } = useUnsavedChangesGuard({ isDirty });
```

A Korean student mid-solution sees raw English in an OS-level dialog.

**Fix**: add an i18n key in the `problems` namespace and pass it: `useUnsavedChangesGuard({ isDirty, warningMessage: t("unsavedChangesWarning") })`.

**HIGH — `src/app/(public)/practice/problems/[id]/page.tsx:636`**
The submit panel renders whenever `session?.user` is truthy, regardless of `assignmentContext.isSubmissionBlocked`:

```tsx
{session?.user ? (
  <div className="...">
    <Card id="public-submit-panel">
      <PublicQuickSubmit ... />
```

`isSubmissionBlocked` only gates the countdown timer (lines 507–519), not the form. After a windowed exam expires the student still sees a live Submit button, clicks it, and only then gets an API rejection toast. Nothing in the UI proactively explains that the deadline has passed.

**Fix**: thread `isSubmissionBlocked` into `PublicQuickSubmit`/`ProblemSubmissionForm`; when `true`, disable the submit button and show a "Deadline has passed" message.

**MEDIUM — `src/components/code/code-editor.tsx:139`**
The fullscreen toggle renders `<span>F</span>` as a shortcut hint next to the Maximize2 icon, but there is no `keydown` handler that binds the `F` key to toggle fullscreen. A student who presses `F` in the editor simply types a literal `f`.

**Fix**: either add a document-level `keydown` listener mapping `F` → `toggleFullscreen` when focus is outside the editor content, or remove the `<span>F</span>` label.

---

## 2. Problem Discovery — 8/10

### What works

- Search matches number, title, and content with match-kind badges.
- Tag filter, difficulty range slider, sort by number/difficulty/success-rate/newest.
- Progress filter pills (all / solved / unsolved / attempted) with `aria-current` on the active pill.
- Similar problems panel on the problem detail page.
- Previous/next keyboard navigation via `ProblemKeyboardNav`.

### Issues

**MEDIUM — `src/app/(public)/practice/page.tsx:459`**
The "unsolved" progress filter is defined as `progress !== "solved"`, which includes both `"attempted"` and `"untried"` problems:

```ts
else if (currentProgressFilter === "unsolved" && progress !== "solved") matchingIds.push(id);
```

A student looking for problems they have never touched will see already-attempted problems mixed in. There is no separate "Untried" option.

**Fix**: add a fourth `"untried"` option mapping to `progress === "untried"`, and relabel the current "unsolved" filter to "Not Solved" so its scope is clear.

**LOW — `src/app/(public)/practice/page.tsx:428–466`**
When a progress filter is active, the page fetches all matching problem IDs and all user submissions into JavaScript for in-memory filtering before re-fetching the page slice. The inline comment acknowledges this is a temporary approach not suitable for large problem sets.

---

## 3. Assignment Workflow — 7/10

### What works

- Dashboard upcoming deadlines show relative countdowns ("in 3 hours") via `formatRelativeTimeFromNow`.
- Assignment overview lists problems with progress icons and `sr-only` text.
- Late deadline and late penalty are surfaced separately in the overview card.
- `CountdownTimer` syncs with the server clock on mount and on every tab refocus.

### Issues

**HIGH — `src/app/(public)/dashboard/_components/student-dashboard.tsx:100–102`**
"Upcoming deadlines" filters on the primary `deadline` field only:

```ts
const upcomingAssignments = studentAssignments
  .filter((assignment) => assignment.deadline && assignment.deadline > now)
  .slice(0, 5);
```

If a professor sets a primary deadline in the past but a late deadline in the future, the assignment disappears from the student's upcoming list even though they can still submit (with penalty). The `openAssignments` count at line 103 correctly uses `lateDeadline ?? deadline`, so the dashboard counts disagree with the displayed list.

**Fix**: filter on `(assignment.lateDeadline ?? assignment.deadline) > now`, and add a "Late" badge when only the late deadline is still open.

**LOW — `src/components/assignment/assignment-overview.tsx:227`**
Late penalty renders as `{assignment.latePenalty ?? 0}%`. If the instructor never configured a penalty, the student sees "0%", implying no penalty when the policy was simply unset. Better: show "-" or "Not configured" when null.

---

## 4. Exam Experience — 8/10

### What works

- Anti-cheat privacy notice is modal and cannot be dismissed via Escape or outside clicks until accepted.
- The notice itemizes collected signals: tab switches, copy/paste, IP address, code snapshots.
- A 3-second grace period (`TAB_SWITCH_GRACE_MS = 3000`) prevents OS notification popups from immediately flagging a tab switch.
- 15/5/1 minute warnings are announced via toasts with `aria-live`.
- Start-exam button shows a confirmation dialog with duration before starting the clock.
- Crash recovery for anti-cheat events via in-flight slot and orphan re-queue is solid.

### Issues

**HIGH — Submit panel stays active after exam expiry**
Same root cause as Section 1 HIGH. When the windowed exam expires, `CountdownTimer` shows "00:00:00" and fires an `aria-live` alert, but the Submit button below the editor remains clickable. The student discovers they cannot submit only after the API rejects the request.

**MEDIUM — `src/components/exam/anti-cheat-monitor.tsx:44`**
Privacy-notice acceptance is stored in `sessionStorage` keyed by `assignmentId`:

```ts
sessionStorage.getItem(`judgekit_anticheat_notice_${assignmentId}`)
```

`sessionStorage` is tab-scoped. A student who opens two problems in separate tabs — a common workflow for cross-referencing — must click through the notice twice, right at the start of a timed exam.

**Fix**: use `localStorage` with the same key, or broadcast acceptance across tabs via `BroadcastChannel`.

**LOW — `src/components/exam/countdown-timer.tsx:224`**
The timer renders inside a small `<Badge>` inline in the page flow. On a long problem statement the badge can scroll off-screen. Under exam stress the timer should be pinned (sticky header or floating chip).

---

## 5. Mobile & Accessibility — 7/10

### What works

- `useIsMobile` switches submission UI from Dialog to bottom Sheet.
- `prefers-reduced-motion` is honored globally in `src/app/globals.css:138`.
- Skip-to-content link is present (`src/components/layout/skip-to-content.tsx`).
- Code editor fullscreen overlay sets `role="dialog"` with `aria-modal` and traps Tab focus.
- Submission status has `role="status" aria-live="polite"` on the badge container.
- Progress icons have `sr-only` text labels.

### Issues

**MEDIUM — Fullscreen F-key affordance is non-functional**
Cross-listed from Section 1. Sighted keyboard-only users following the "F" hint cannot enter fullscreen without a mouse click.

**LOW — My Submissions table on mobile**
The right-column panel on the problem page (`src/app/(public)/practice/problems/[id]/page.tsx:670–768`) hides time/memory columns with `hidden md:table-cell` but still shows 6 visible columns on a phone. The `lg:overflow-y-auto` container combined with horizontal scroll can be awkward on iOS Safari.

---

## 6. Internationalization — 8/10

### What works

All user-visible text routes through `next-intl`. Korean `tracking-*` guards are applied consistently across 25+ components, e.g.:

```tsx
className={`text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""}`}
```

`html:lang(ko)` override in `src/app/globals.css:134` resets `letter-spacing` custom properties to `normal`. Numeric/monospace strings ("404", access codes) apply fixed tracking without locale gating, which is correct per `CLAUDE.md`.

### Issue

**HIGH — `src/hooks/use-unsaved-changes-guard.ts:5`**
(Repeated from Section 1.) The single user-visible string that escapes the i18n system appears in a native OS dialog — the worst possible place for a language mismatch.

---

## 7. Privacy & Anti-Cheat Disclosure — 8/10

### What works

- Blocking consent modal with itemized list of collected signals (`src/components/exam/anti-cheat-monitor.tsx`).
- Amber banner on both the problem page and the contest page.
- Contest page includes a `signalsDisclaimer` paragraph explaining that flagged signals do not automatically mean cheating.

### Issue

**LOW — `src/app/(public)/practice/problems/[id]/page.tsx:484–491`**
The problem-page amber banner shows only the title and body paragraphs. The contest page at `src/app/(public)/contests/[id]/page.tsx:254–256` also shows the `signalsDisclaimer`. Students who arrive via a direct problem deep-link — bypassing the contest overview — never see the disclaimer about signal interpretation.

**Fix**: add the disclaimer paragraph to the problem page's amber banner, reusing the same i18n key.

---

## Summary — Top Issues

| # | Severity | File:line | Issue | Fix |
|---|----------|-----------|-------|-----|
| 1 | HIGH | `src/hooks/use-unsaved-changes-guard.ts:5` | `DEFAULT_WARNING_MESSAGE` hardcoded English; appears in native browser dialog for Korean users | Pass i18n string via `warningMessage` prop from `ProblemSubmissionForm` |
| 2 | HIGH | `src/app/(public)/practice/problems/[id]/page.tsx:636` | Submit panel stays active after assignment deadline expires; student only learns via API error toast | Thread `isSubmissionBlocked` into form; show disabled state with explanation |
| 3 | HIGH | `src/app/(public)/dashboard/_components/student-dashboard.tsx:100` | "Upcoming deadlines" ignores `lateDeadline`; active late windows invisible on dashboard | Filter on `(lateDeadline ?? deadline) > now`; add "Late" badge |
| 4 | MEDIUM | `src/components/code/code-editor.tsx:139` | `<span>F</span>` shortcut hint has no corresponding `keydown` handler | Add F-key binding or remove the label |
| 5 | MEDIUM | `src/app/(public)/practice/page.tsx:459` | "Unsolved" filter includes attempted problems; no way to find truly untried problems | Add "Untried" option; rename "Unsolved" to "Not Solved" |
| 6 | MEDIUM | `src/components/exam/anti-cheat-monitor.tsx:44` | Privacy notice re-prompts on each new browser tab (sessionStorage is tab-scoped) | Use `localStorage` or `BroadcastChannel` to share acceptance |
| 7 | LOW | `src/app/(public)/practice/problems/[id]/page.tsx:484` | `signalsDisclaimer` missing from problem-page anti-cheat banner | Add disclaimer paragraph matching contest page |

---

## Final Sweep

- **Korean typography regression:** None. All `tracking-*` usages are locale-gated or applied to purely numeric/monospace content. `html:lang(ko)` CSS override is intact.
- **Network blip recovery during exam:** Anti-cheat event queue with exponential backoff, in-flight slot, and crash-recovery orphan re-queue is well-implemented.
- **Deadline at T-30s:** `CountdownTimer` fires destructive badge variant and `animate-pulse` at <1 minute, plus a 1-minute `aria-live` assertive announcement. Server clock sync on refocus prevents drift.
- **Copy/paste in exam:** Paste events are logged with a sanitized element descriptor — content is not captured. Properly disclosed in the privacy notice.
