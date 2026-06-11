# Test Engineer — RPF Cycle 9 (2026-05-16)

**HEAD:** `9854e072` · **Test counts at HEAD:** 317 files, 2410 tests
PASS · cargo (judge-worker-rs) 64 tests PASS.

## Coverage gaps

### TE9-1 — `code-timeline-panel.tsx::hljsLanguageFor` has no test

**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/code-timeline-panel.tsx:57-59`

Behavior: maps judge language id (case-insensitive) to a hljs language
identifier or `undefined` (auto). If consolidating with
`getCodeSurfaceLanguage` (CR9-2), the consolidated function deserves
unit coverage covering: known map hit, case-insensitive hit, unknown
returns `undefined`, and the `"plaintext"` translation rule. Add to
`tests/unit/code/language-map.test.ts`.

### TE9-2 — Carry-forward LOWs from cycle 8

TE8b-3 (chat-widget loader role-bypass component test), TE8b-4
(submission detail capability surfacing integration test), TE8b-5
(`canViewAssignmentSubmissions` short-circuit reorder unit test) all
remain valid and DEFERRED.

## Verdict

Test suite is healthy. One small new coverage gap tied to the CR9-2
consolidation; will be added in the same cycle.
