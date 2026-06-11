# Architect — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Architectural risk analysis

### C3-ARCH-1: `scoring.ts` mixed abstraction levels (LOW, confidence: High)

**File:** `src/lib/assignments/scoring.ts`

The module mixes TypeScript scoring logic (`mapSubmissionPercentageToAssignmentPoints`) with raw SQL generation (`buildIoiLatePenaltyCaseExpr`). These are fundamentally different abstraction levels:
- The TS function is pure, testable with known inputs/outputs
- The SQL function generates a SQL string that must be tested against a database

Having both in the same module violates the Single Responsibility Principle and makes the module harder to test and reason about.

**Fix:** Extract `buildIoiLatePenaltyCaseExpr` into a dedicated `scoring-sql.ts` module alongside the TS scoring logic.

### C3-ARCH-2: Rate-limit module drift — BACKOFF_CAP inconsistency (LOW, confidence: High)

**File:** `src/lib/security/in-memory-rate-limit.ts` vs `src/lib/security/rate-limit.ts`

The DB-backed rate limiter uses `BACKOFF_CAP = 5` to limit the exponent before `Math.pow(2, ...)`. The in-memory rate limiter has no `BACKOFF_CAP` and instead caps the result with `MAX_BLOCK`. Both produce the same behavior, but the divergent implementation patterns make it harder to verify correctness and increase the risk of drift when fixes are applied to one module but not the other.

This is a new data point for the existing C7-AGG-9 deferred item (rate-limit consolidation). The inconsistency should be tracked as an additional motivator for the consolidation cycle.

### C3-ARCH-3: `compiler/execute.ts` module size (LOW, confidence: Medium)

**File:** `src/lib/compiler/execute.ts` (852 lines)

This module contains Docker execution, orphan cleanup, Rust runner delegation, shell validation, concurrency limiting, and container inspection. While not yet at the deploy-script threshold (1098 lines), it's approaching a size where splitting would improve maintainability.

**Fix:** Consider extracting into:
- `compiler/docker-executor.ts` (Docker run logic)
- `compiler/orphan-cleanup.ts` (container cleanup)
- `compiler/rust-runner.ts` (sidecar delegation)
- `compiler/shell-validation.ts` (command validation)

### Carry-forward architectural items

All prior deferred items (ARCH-CARRY-1, ARCH-CARRY-2) remain applicable and unchanged at HEAD.

## Final sweep

No HIGH-severity architectural risks found. The codebase is well-structured overall with clear separation between API routes, business logic, and data access.
