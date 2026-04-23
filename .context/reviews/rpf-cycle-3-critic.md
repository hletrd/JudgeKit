# RPF Cycle 3 — Critic

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Multi-Perspective Critique

### CRI-1: `SubmissionListAutoRefresh` was designed for backoff but the implementation makes it impossible [MEDIUM/HIGH]

This is the highest-signal finding this cycle, flagged by code-reviewer, security-reviewer, perf-reviewer, architect, debugger, verifier, and test-engineer (7 perspectives).

The component has:
- `MAX_BACKOFF_MS`, `BACKOFF_MULTIPLIER` constants
- `errorCountRef` with increment/reset logic
- `getBackoffInterval()` function
- Detailed comments about how backoff works

But `router.refresh()` never throws, so none of this code ever executes. This is a "implementation contradicts design" issue. The code looks correct at first glance, but the design intent (backoff on failure) is fundamentally impossible with the chosen API primitive.

**Severity adjustment:** What would be a simple bug is elevated because the dead code gives a false sense of robustness. A developer reading this code would believe backoff is working, and wouldn't add real error handling.

---

### CRI-2: `recruiting-invitations-panel.tsx` uses dynamic `import()` where static import is appropriate [LOW/MEDIUM]

Three separate locations use `const { copyToClipboard } = await import("@/lib/clipboard")`. This pattern was likely used during migration (copy-paste from different files) but is unnecessary for a 37-line utility that will be bundled anyway. The dynamic import adds:
- Unnecessary async overhead on every click
- Less readable code
- Potential CSP issues in strict environments

**Fix:** Simple static import at the top of the file.

---

### CRI-3: `contest-clarifications.tsx` polling architecture could benefit from a reusable hook [LOW/LOW]

The component implements its own visibility-based polling with interval management. This is the same pattern used by `SubmissionListAutoRefresh` and `useSubmissionPolling`. A shared `usePollingWithVisibility` hook could reduce duplication.

This is a maintainability suggestion, not a bug.

---

### CRI-4: SSE `queryFullSubmission` fetches `sourceCode` but client always ignores it [LOW/MEDIUM]

The `sendTerminalResult` function in the SSE route fetches the full submission including `sourceCode`. The client (`use-submission-polling.ts`) always uses `normalized.sourceCode || prev.sourceCode` — preferring the already-loaded source code. So the source code in the SSE event is always discarded by the client. This wastes bandwidth and adds latency to every SSE completion event.

**Fix:** Exclude `sourceCode` from the `queryFullSubmission` query.

---

## Positive Observations

- Cycle 2 fixes are all properly applied and working
- `clipboard.ts` shared utility is well-designed with proper fallback pattern
- `contest-layout.tsx` opt-in navigation pattern is clean and minimal
- `formatScore` adoption is consistent
- Code quality overall is high — no `as any`, no `@ts-ignore`, minimal `eslint-disable`
