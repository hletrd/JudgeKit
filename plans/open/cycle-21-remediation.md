# Cycle 21 Review Remediation Plan

**Created:** 2026-05-09
**Review Head:** 17ae0bda
**Findings Source:** `.context/reviews/_aggregate.md`

---

## Completed Fixes

### C21-1: Fix timestamp column dataType detection in database import [MEDIUM] — DONE

**File:** `src/lib/db/import.ts:33`

**Completed:** 2026-05-09
- Changed `dataType === "date"` to `dataType === "timestamp"` in `buildImportColumnSets`.
- Confirmed zero `date()` columns exist in the schema (66 `timestamp()` columns).
- Commit: `9859ad8c` — `fix(data): 🐛 correct Drizzle dataType for timestamp columns in import`

### C21-2: Add plugin config validation to auto-review background job [MEDIUM] — DONE

**File:** `src/lib/judge/auto-review.ts:92`

**Completed:** 2026-05-09
- Imported `chatWidgetConfigSchema` from the shared `@/lib/plugins/chat-widget/schema` module.
- Replaced unsafe cast with `chatWidgetConfigSchema.safeParse(pluginState.config)`.
- Returns early with warn log when validation fails.
- Commit: `d3ac0433` — `fix(auto-review): 🐛 validate plugin config with zod schema before use`

### C21-3: Fix inconsistent width detection in use-mobile hook [LOW] — DONE

**File:** `src/hooks/use-mobile.ts:9-15`

**Completed:** 2026-05-09
- Replaced `window.innerWidth < MOBILE_BREAKPOINT` with `mql.matches` for both initialization and updates.
- Commit: `c95eeef6` — `fix(hooks): 🐛 use mql.matches for consistent mobile detection`

### C21-4: Fix modifier-key blocking in use-keyboard-shortcuts [LOW] — DONE

**File:** `src/hooks/use-keyboard-shortcuts.ts:30`

**Completed:** 2026-05-09
- Removed the blanket `if (e.ctrlKey || e.metaKey || e.altKey) return;` check.
- Existing input/textarea/CodeMirror focus checks already prevent typing interference.
- Commit: `40848880` — `fix(hooks): 🐛 remove blanket modifier-key block in keyboard shortcuts`

---

## Gate Results

- `npx eslint .`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (66 files, 179 tests)

## Deploy Results

- **test.worv.ai** — SUCCESS (exit code 0)
  - Build: linux/arm64, Next.js 16.2.3 compiled + TypeScript passed
  - DB: migrations applied, schema repairs, ANALYZE run, pre-deploy backup saved
  - HTTPS verified, nginx reloaded
- **algo.xylolabs.com** — SUCCESS (exit code 0)
  - Build: linux/arm64, Next.js 16.2.3 compiled + TypeScript passed
  - DB: no schema changes detected, schema repairs, ANALYZE run
  - HTTPS verified, nginx reloaded

---

## Deferred Items

None this cycle. All findings are implemented.
