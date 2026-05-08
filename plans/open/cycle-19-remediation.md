# Cycle 19 Review Remediation Plan

**Created:** 2026-05-08
**Review Head:** 18b479ac
**Findings Source:** `.context/reviews/_aggregate-cycle-19.md`

---

## Planned Fixes (to implement this cycle)

### C19-1: Validate ContestReplay playback speed before applying [MEDIUM]

**File:** `src/components/contest/contest-replay.tsx:214`

**Description:** The Select `onValueChange` handler uses an unchecked `parseInt(v, 10) as (typeof PLAYBACK_SPEEDS)[number]`. If `v` is empty or invalid, `parseInt` returns `NaN`, which causes `1400 / NaN` in the playback timer to evaluate to `NaN`. Browsers treat `setTimeout(fn, NaN)` as `setTimeout(fn, 0)`, creating a rapid-fire state-update loop that freezes the UI.

**Fix:**
```tsx
const parsed = parseInt(v, 10);
if (PLAYBACK_SPEEDS.includes(parsed as typeof PLAYBACK_SPEEDS[number])) {
  setSpeed(parsed);
}
```

**Status:** OPEN

---

### C19-2: Use stable React keys for recruiting invitation metadata fields [LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:472`

**Description:** Metadata field rows use `key={i}`, which is a React anti-pattern. On field deletion, React may reuse DOM nodes and preserve stale internal state (cursor position, focus, scroll).

**Fix:** Generate stable IDs (using `nanoid()` or a counter) when fields are added, include them in the field object, and use `key={field.id}`.

**Status:** OPEN

---

### C19-3: Commit uncommitted Korean copy improvements in messages/ko.json [LOW]

**File:** `messages/ko.json`

**Description:** The working tree has unstaged modifications replacing em-dashes with periods in Korean error messages for improved readability. These should be committed.

**Status:** OPEN

---

## Deferred Items

None this cycle. All findings are scheduled for implementation.

---

## Implementation Notes

- Run all gates (eslint, tsc --noEmit, next build, vitest run, vitest run --config vitest.config.component.ts) after each fix.
- Commit in fine-grained way per fix with semantic messages and gitmoji.
- GPG-sign all commits.
