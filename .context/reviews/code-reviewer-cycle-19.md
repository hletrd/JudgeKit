# Code Review — Cycle 19/100

**Reviewer:** code-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** 18b479ac
**Scope:** Code quality, logic, maintainability, React patterns

---

## NEW FINDINGS

### C19-CR-1: [LOW] RecruitingInvitationsPanel metadata fields use index-based React key

**Severity:** LOW
**Confidence:** HIGH
**File:** `src/components/contest/recruiting-invitations-panel.tsx:472`

**Code:**
```tsx
{metadataFields.map((field, i) => (
  <div key={i} className="flex gap-2">
```

**Problem:** The metadata fields in the invitation creation dialog use `key={i}` (array index). While the inputs are controlled by state and fields are only appended/removed by index (no reordering), this is still an anti-pattern. If future enhancements add drag-to-reorder or pre-populated fields, React will reuse DOM nodes incorrectly.

**Fix:** Generate stable IDs when fields are added (e.g., `nanoid()` or a counter ref), store them in the field object, and use `key={field.id}`.

**Concrete failure scenario:** If a user fills in Field 0 (key=0, key="name", value="Alice"), Field 1 (key=1, key="email", value="alice@example.com"), then deletes Field 0, React reuses the DOM node that had focus in Field 0 for what is now Field 1. The cursor position and internal DOM state (scroll, selection) shift unexpectedly.

---

### C19-CR-2: [MEDIUM] ContestReplay unsafe type assertion on Select parseInt

**Severity:** MEDIUM
**Confidence:** HIGH
**File:** `src/components/contest/contest-replay.tsx:214`

**Code:**
```tsx
<Select value={String(speed)} onValueChange={(v) => { if (v) setSpeed(parseInt(v, 10) as (typeof PLAYBACK_SPEEDS)[number]); }}>
```

**Problem:** The `as` type assertion masks a runtime invariant. While the Select component constrains values, if a DOM manipulation or Select bug passes an empty string, `parseInt("", 10)` returns `NaN`. The `speed` state becomes `NaN`, and at line 99:
```tsx
}, 1400 / speed);
```
`1400 / NaN` evaluates to `NaN`. `setTimeout(fn, NaN)` treats the delay as 0, firing immediately. The timer callback at line 88 schedules the next tick unconditionally with `scheduleNext()`, creating a rapid-fire state-update loop that pegs the main thread.

**Fix:** Validate the parsed value against `PLAYBACK_SPEEDS` before setting state:
```tsx
const parsed = parseInt(v, 10);
if (PLAYBACK_SPEEDS.includes(parsed as typeof PLAYBACK_SPEEDS[number])) {
  setSpeed(parsed as typeof PLAYBACK_SPEEDS[number]);
}
```

---

## No Other Confirmed Issues

- Skeleton placeholders using `key={i}` are acceptable — skeletons have no internal state or user input.
- All previously fixed index-key issues remain fixed.
- Timer cleanup patterns are correct across the board.
- AbortController separation per operation in language-config-table is correctly implemented.
