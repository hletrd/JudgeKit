# Cycle 21 Review Remediation Plan

**Created:** 2026-05-09
**Review Head:** 17ae0bda
**Findings Source:** `.context/reviews/_aggregate.md`

---

## Open Tasks

### C21-1: Fix timestamp column dataType detection in database import [MEDIUM]

**File:** `src/lib/db/import.ts:33`

**Description:** `buildImportColumnSets` checks `dataType === "date"` but Drizzle `timestamp()` columns report `dataType === "timestamp"`. The schema has 66 `timestamp()` columns and 0 `date()` columns. This causes all timestamp values to remain as ISO strings during import instead of being converted to `Date` objects.

**Implementation:**
- Change `dataType === "date"` to `dataType === "timestamp"` in `buildImportColumnSets`.
- Verify no `date()` columns exist in the schema (confirmed: 0).
- Run existing import/export tests.

**Gate requirements:** `npx tsc --noEmit`, `npx vitest run`

---

### C21-2: Add plugin config validation to auto-review background job [MEDIUM]

**File:** `src/lib/judge/auto-review.ts:92`

**Description:** `auto-review.ts` casts `pluginState.config` without runtime validation. Cycle 20 fixed the same pattern in `chat/route.ts` by adding `pluginConfigSchema`, but `auto-review.ts` was missed.

**Implementation:**
- Extract `pluginConfigSchema` from `chat/route.ts` to a shared location (e.g., `src/lib/plugins/chat-widget/config-schema.ts`) or import it.
- Validate `pluginState.config` with `pluginConfigSchema.safeParse()` before use in `auto-review.ts`.
- Return early with a debug log if validation fails.

**Gate requirements:** `npx tsc --noEmit`, `npx vitest run`

---

### C21-3: Fix inconsistent width detection in use-mobile hook [LOW]

**File:** `src/hooks/use-mobile.ts:9-15`

**Description:** The hook initializes `isMobile` with `window.innerWidth < MOBILE_BREAKPOINT` but uses a media query listener for updates. These can disagree in edge cases.

**Implementation:**
- Replace `window.innerWidth < MOBILE_BREAKPOINT` with `mql.matches` for both initialization and updates.

**Gate requirements:** `npx tsc --noEmit`, `npx vitest run --config vitest.config.component.ts`

---

### C21-4: Fix modifier-key blocking in use-keyboard-shortcuts [LOW]

**File:** `src/hooks/use-keyboard-shortcuts.ts:30`

**Description:** The handler returns early if ANY modifier is pressed, contradicting the comment and preventing shortcuts like "Ctrl+Enter" from working.

**Implementation:**
- Remove the blanket `if (e.ctrlKey || e.metaKey || e.altKey) return;` check.
- The existing `tag === "input" || tag === "textarea" || tag === "select"` and CodeMirror checks already prevent interference with typing.
- If modifier shortcuts are needed, callers can include the modifier in the shortcut key string (e.g., "ctrl+s"), or the check can be made conditional.

**Gate requirements:** `npx tsc --noEmit`, `npx vitest run --config vitest.config.component.ts`

---

## Deferred Items

None this cycle. All findings are scheduled for implementation.

---

## Gate Checklist

- [ ] `npx eslint .` — no errors, no warnings
- [ ] `npx tsc --noEmit` — clean
- [ ] `npx next build` — passes
- [ ] `npx vitest run` — passes (314 files, 2338 tests)
- [ ] `npx vitest run --config vitest.config.component.ts` — passes (66 files, 179 tests)
