# Performance Review — Cycle 33

**Reviewer:** perf-reviewer
**Date:** 2026-05-10
**Scope:** Rendering performance, network patterns, memory leaks, bundle size

---

## Findings

### C33-PR-1: [MEDIUM] submission-list-auto-refresh causes unnecessary re-renders

**File:** `src/components/submission-list-auto-refresh.tsx:51`
**Confidence:** HIGH

The component calls `router.refresh()` on every successful poll. This triggers a full Server Component re-render for the entire page tree, not just the submission list. With a 5-second interval during active submissions, this creates significant server load and React reconciliation work.

**Fix:** Consider using a more targeted data refresh mechanism (e.g., SWR or React Query with stale-while-revalidate) instead of `router.refresh()`.

---

### C33-PR-2: [LOW] Compiler client re-renders entire output on every keystroke

**File:** `src/components/code/compiler-client.tsx`
**Confidence:** MEDIUM

The CodeEditor component likely triggers onChange for every keystroke, and if parent components re-render, this could cause cascading re-renders. Without seeing the full implementation, the pattern suggests potential optimization opportunities.

**Fix:** Verify CodeEditor uses React.memo and that state updates are batched.

---

### C33-PR-3: [LOW] Anti-cheat monitor registers global document listeners

**File:** `src/components/exam/anti-cheat-monitor.tsx:266-271`
**Confidence:** LOW

The anti-cheat component registers 6 global document/window event listeners. While properly cleaned up, during the exam session these handlers fire on every copy, paste, context menu, blur, and visibility change event across the entire document.

**Fix:** Current implementation is reasonable. Consider using `passive: true` for non-blocking events where applicable.

---

### C33-PR-4: [LOW] problem-description re-parses markdown on every render

**File:** `src/components/problem-description.tsx:56-100`
**Confidence:** LOW

ReactMarkdown and its plugins re-process the full description on every render. For large problem descriptions with complex math, this is expensive.

**Fix:** Wrap in `useMemo`:
```typescript
const markdownContent = useMemo(() => (
  <ReactMarkdown ...>{description}</ReactMarkdown>
), [description, editorTheme]);
```

---

## Positive Observations

1. Dynamic imports used for JSZip (server utils).
2. Anti-cheat storage caps at MAX_PENDING_EVENTS to bound memory.
3. Submission list auto-refresh has backoff for errors.
4. Image optimization with sharp library.
