# Architect — RPF Cycle 9 (2026-05-16)

**HEAD:** `9854e072`

## Findings

### ARCH9-1 — Confirmed: parallel language-id maps fragment the language-handling layer

**Severity:** LOW · **Confidence:** HIGH

`src/lib/code/language-map.ts::CODE_SURFACE_LANGUAGE_MAP` is the
canonical "judge language → highlight pipeline" lookup. The new
`LANGUAGE_TO_HLJS` map in `code-timeline-panel.tsx` is a parallel
authority that will drift. The architectural fix is to make
`language-map.ts` the single source of truth and have any consumer
(CodeMirror via `code-surface.tsx`, hljs via `code-timeline-panel.tsx`)
go through one helper.

Concrete: keep `CODE_SURFACE_LANGUAGE_MAP` unchanged for
CodeMirror (which expects "plaintext" as a fallback), and add a
small adapter `getHighlightJsLanguage(language)` that returns
`undefined` when the canonical lookup yields `"plaintext"` (signaling
auto-detection). Place the adapter alongside `getCodeSurfaceLanguage`
in the same file.

### ARCH9-2 — Carry-forwards (deferred)

ARCH8b-1..4 still valid:
- userRole-less form deprecation in `isAiAssistantEnabledForContext`
- Plaintext-storage `@policy` JSDoc marker on `secrets.ts`
- Verify `LectureModeProvider` is pure-client
- Rename `getEnrolledContestDetail` → `getParticipationContestDetail`

## Verdict

One small architectural cleanup (ARCH9-1) actionable in this cycle
without churn.
