# Cycle 4 Review Remediation Plan

**Created:** 2026-05-09
**Review Head:** d660aefb
**Findings Source:** `.context/reviews/_aggregate.md`

---

## Items to implement this cycle

### 1. C4-AGG-1 — Fix incorrect SSE stale threshold fallback value [MEDIUM]
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:113`
- **Task:** Change `30_030_000` to `1_830_000` in `getStaleThreshold()` fallback path.
- **Status:** DONE — Commit `74963311`

### 2. C4-AGG-2 — Fix missing dbReader.releaseLock() in backup export [MEDIUM]
- **File:** `src/lib/db/export-with-files.ts:133-143`
- **Task:** Add `finally` block to ensure `dbReader.releaseLock()` is called in both normal and error paths.
- **Status:** DONE — Commit `ade60474`

### 3. C4-AGG-3 — Fix missing reader.releaseLock() in chat-widget [MEDIUM]
- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx:233-260`
- **Task:** Add `reader.releaseLock()` in the finally block.
- **Status:** DONE — Commit `d0495d9f`

### 4. C4-AGG-4 — Fix missing reader.releaseLock() in providers.ts transformSSE [MEDIUM]
- **File:** `src/lib/plugins/chat-widget/providers.ts:454-495`
- **Task:** Add `reader.releaseLock()` in the finally block before `controller.close()`.
- **Status:** DONE — Commit `248e39ba`

### 5. C4-AGG-5 — Document session maxAge load-time behavior [LOW]
- **File:** `src/lib/auth/config.ts:320`
- **Task:** Add comment documenting that `session.maxAge` is evaluated at module load time and requires restart to take effect.
- **Status:** DONE — Commit `21215a1c`

---

## Deferred items

None this cycle. All findings are actionable and will be implemented.

---

## Gate Results

- `npx eslint .`: PASS (no errors, no warnings)
- `npx tsc --noEmit`: PASS
- `npx next build`: PASS
- `npx vitest run`: PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts`: PASS (66 files, 179 tests)

---

## Deploy Results

- **test.worv.ai** — SUCCESS (exit code 0)
  - Build: linux/arm64, Next.js compiled + TypeScript passed
  - DB: migrations applied, schema repairs, ANALYZE run, pre-deploy backup saved
  - HTTPS verified, nginx reloaded
- **algo.xylolabs.com** — SUCCESS (exit code 0)
  - Build: linux/arm64, Next.js compiled + TypeScript passed
  - DB: no schema changes detected, schema repairs, ANALYZE run
  - HTTPS verified, nginx reloaded

---

## Implementation order

1. C4-AGG-1 (SSE threshold) — simplest fix, one number change
2. C4-AGG-2 (backup export reader) — resource leak fix
3. C4-AGG-3 (chat-widget reader) — resource leak fix
4. C4-AGG-4 (providers transformSSE reader) — resource leak fix
5. C4-AGG-5 (session maxAge comment) — documentation only
