# Test Engineer — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Test coverage analysis

343 test files across unit (majority), integration (3), and E2E (~34) layers.

### Test gaps

### C3-TE-1: No dedicated unit test for `in-memory-rate-limit.ts` (MEDIUM, confidence: High)

**File:** `src/lib/security/in-memory-rate-limit.ts`

The in-memory rate limiter has no dedicated test file. There is a `rate-limiter-client.test.ts` (for the sidecar client) and a `rate-limit.test.ts` (for the DB-backed module), but the in-memory module's unique behaviors are untested:
- Eviction logic (time-based and FIFO)
- Exponential backoff with `MAX_BLOCK` cap
- `consumeInMemoryRateLimit` integration
- `resetInMemory` function

This is a significant gap given the module handles high-throughput paths.

**Fix:** Create `tests/unit/security/in-memory-rate-limit.test.ts` covering:
- Basic rate limiting (within window, over limit)
- Exponential backoff with MAX_BLOCK cap
- Eviction (time-based expiry, FIFO overflow at MAX_ENTRIES)
- `consumeInMemoryRateLimit` (request-based API)
- `resetInMemory`

### C3-TE-2: `buildIoiLatePenaltyCaseExpr` not tested directly (LOW, confidence: High)

**File:** `src/lib/assignments/scoring.ts:78-99`

The SQL CASE expression builder is tested only indirectly via scoring tests. The function's edge cases (null score, negative score via LEAST/GREATEST, windowed vs non-windowed late penalty) should be tested against actual SQL execution to verify the generated SQL is correct.

**Fix:** Add a test that executes the generated SQL against a test database with known inputs.

### C3-TE-3: `participant-status.ts` null status edge case not tested (LOW, confidence: High)

**File:** `src/lib/assignments/participant-status.ts:99`

The test file `tests/unit/assignments/participant-status.test.ts` exists but the case where `latestStatus === null` AND `attemptCount > 0` returning "submitted" is likely not explicitly tested (it's the behavior that should be changed per C3-CR-1).

**Fix:** Add an explicit test case for the null status + positive attempts scenario.

### Test quality observations

- Test factories in `tests/unit/support/factories.ts` are well-structured
- Mock patterns using `vi.mock()` are consistent
- E2E tests cover major user flows
- The codebase follows the AGENTS.md testing rules for multi-layer coverage

## Final sweep

The in-memory rate limiter test gap (C3-TE-1) is the most significant finding. The module handles auth-adjacent security logic and should have dedicated tests.
