# Cycle 45 — Debugger

**Date:** 2026-04-23
**Base commit:** d96a984f

## Findings

### DBG-1: Map.get() non-null assertion in student page could throw if submissions are reordered [MEDIUM/LOW]

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx:131`

```typescript
for (const sub of studentSubmissions) {
  if (!submissionsByProblem.has(sub.problemId)) {
    submissionsByProblem.set(sub.problemId, []);
  }
  submissionsByProblem.get(sub.problemId)!.push(sub);
}
```

This is technically safe due to the `has()` + `set()` guard on the preceding lines. However, if JavaScript's event loop were to interleave (not possible in this synchronous loop, but the pattern is fragile), the `get()` could return `undefined`. More practically, if someone refactors this loop and moves the `set()` call into a separate pass, the `!` assertion would mask a bug.

**Fix:** Replace with explicit null guard for robustness and consistency with cycles 43-44 pattern.

---

### DBG-2: SSE connection cleanup mutates map during iteration [LOW/LOW]

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:106-110`

```typescript
for (const [connId, info] of connectionInfoMap) {
  if (now - info.createdAt > staleThreshold) {
    removeConnection(connId)
  }
}
```

`removeConnection` calls `connectionInfoMap.delete(connId)`, which mutates the map during iteration. In JavaScript, this is actually safe — the Map iteration protocol handles deletions during iteration (the deleted entry will not appear later in the iteration). This is documented behavior in the ECMAScript spec.

No fix needed.

---

## Summary

| ID | Severity/Confidence | Description |
|----|----|----|
| DBG-1 | MEDIUM/LOW | Map.get() non-null assertion in student page |
| DBG-2 | LOW/LOW | SSE cleanup map mutation during iteration (safe per spec) |
