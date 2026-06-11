# Performance Reviewer — Cycle 17

## Findings

### P-1: [LOW] Double Serialization in `truncateObject` Array Branch
**File:** `src/lib/audit/events.ts:66-70`
**Confidence:** High

In the array path of `truncateObject`, each item is processed twice:
1. `JSON.stringify(truncateObject(item, remaining - 1))` — for budget check
2. `truncateObject(item, remaining - 1)` — for the actual push into the result array

For deeply nested objects, this doubles the recursion cost. The second call could reuse the result from the first serialization.

**Impact:** Low — `truncateObject` is only called during audit event serialization with a 4000-byte budget, so objects are small.

**Fix:** Compute the truncated item once, serialize it for budget, and push the already-computed value.

---

### P-2: [LOW] `waitForReadableStreamDemand` Uses Polling with 50ms Intervals
**File:** `src/lib/db/export.ts:33-44`
**Confidence:** Medium

The export stream uses a polling loop with `setTimeout(resolve, 50)` when the stream's `desiredSize` is zero or negative. Under backpressure, this results in up to 20 polls per second per export. While exports are rare (admin-initiated), this could be improved with a more event-driven approach using the stream's pull mechanism.

**Impact:** Low — exports are infrequent and the 50ms polling is bounded.

**Fix:** Consider using the ReadableStream `pull()` callback instead of manual polling for a more idiomatic backpressure implementation.

---

### P-3: [INFO] Module-Level Process Spawn in `executeCompilerRun`
**File:** `src/lib/compiler/execute.ts`
**Confidence:** High

The compiler execution pipeline uses `pLimit(Math.max(cpus().length - 1, 1))` to cap concurrent Docker containers, which is good. The Rust runner delegation (via HTTP) also uses `AbortSignal.timeout()` for request timeouts. No performance concerns here.

---

### P-4: [INFO] FIFO Auth Cache in Proxy
**File:** `src/proxy.ts:23-71`
**Confidence:** High

The in-process auth cache uses a Map with FIFO eviction (delete oldest on overflow). This is efficient (O(1) eviction) compared to the previous LRU approach. The 2-second TTL and 500-entry cap are reasonable for the middleware use case.
