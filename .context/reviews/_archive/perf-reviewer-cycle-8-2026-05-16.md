# Perf-Reviewer — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16

---

## Findings

### PERF8b-1 — `DOCKER_RUN_OVERHEAD_BUDGET_MS = 2000ms`
**Severity:** LOW (latency tradeoff) **Confidence:** HIGH
**File:** `judge-worker-rs/src/executor.rs:14-22`

Every test case now adds 2000ms to the wall-clock kill timeout. For a
1000ms TLE problem this is +200% — the worst-case wall time for a
genuinely-hung user program is now 3s instead of 1s. The new
`classify_test_case_verdict` helper still emits `RuntimeError` when the
kill fires while user-code stayed under the limit, so the verdict
semantics are correct, but the worst-case throughput per worker drops
proportionally. Acceptable for a small fleet (1–2 workers) but should
be revisited if the worker count drops or if test cases per problem
grow significantly.

**Defer:** Tradeoff is operator-accepted (fixes the "765ms < 1000ms TLE
오인" report).

---

### PERF8b-2 — `dynamic import` of `@/lib/capabilities/cache` inside hot path
**Severity:** LOW **Confidence:** HIGH
**File:** `src/lib/platform-mode-context.ts:278`

`isAiAssistantEnabledForContext` does
`const { resolveCapabilities } = await import("@/lib/capabilities/cache")`
on every call when `userRole` is truthy. Dynamic imports are cached in
the module loader, so subsequent calls are cheap, but this is a stylistic
deviation from the surrounding eager imports. Likely added to break a
circular import. Defer: cosmetic.

---

### PERF8b-3 — `[...await resolveCapabilities(...)]` allocates a new array
**Severity:** LOW **Confidence:** HIGH
**File:** `src/app/(public)/submissions/[id]/page.tsx:103`

Each render of the submission detail page allocates a new array from
the capability `Set`. Consumer expects an iterable list, so a `Set`
would also work. Cosmetic.

---

### PERF8b-4 — Lecture-mode CSS lock may interfere with browser scroll restoration
**Severity:** LOW **Confidence:** MEDIUM
**File:** `src/app/globals.css:400-411`

`.lecture-mode { overflow: hidden; height: 100% }` and the body variant
prevent the surrounding scroll from racing the inner panes. This is the
correct fix for the reported scroll race, but iOS Safari's
scroll-restoration heuristic may treat the locked `body` differently
across navigation. Defer: needs a runtime check on iOS.

---

## Verification

- Rust release build still produces a binary; no compile-time perf
  regression.
- No N+1 query introduced on the modified pages.
- `Promise.all` parallelism preserved on the contest-analytics path.
