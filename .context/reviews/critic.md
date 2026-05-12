# Critic — Cycle 3 Multi-Perspective Review

## C3-CRIT-1: Transaction semantics are inconsistently applied

**Files:** `src/lib/assignments/participant-timeline.ts`, `src/lib/assignments/exam-sessions.ts`, `src/lib/db/queries.ts`
**Severity:** MEDIUM | Confidence: High

The codebase has a systemic inconsistency around transactions:
- `exam-sessions.ts` correctly uses `db.transaction()` but then calls `rawQueryOne()` which bypasses it.
- `participant-timeline.ts` reads 8 related tables without any transaction wrapper.
- `rate-limit.ts` correctly uses `execTransaction` for atomic operations.
- `api-rate-limit.ts` correctly uses `execTransaction`.

This inconsistency suggests developers are unsure when transactions are needed. A guideline or lint rule would help.

---

## C3-CRIT-2: Source-inspection tests provide false confidence

**File:** `tests/unit/assignments/participant-timeline-logic.test.ts`
**Severity:** MEDIUM | Confidence: High

The test file reads source code and checks string presence. This is not testing — it's static analysis done at runtime. It provides no evidence that the functions produce correct output for given inputs. The existence of this file may discourage writing real tests because "coverage exists."

**Fix:** Replace with real unit tests or remove and track as a coverage gap.

---

## C3-CRIT-3: Duplicate SQL scoring logic is a maintenance hazard

**Files:** `src/lib/assignments/contest-scoring.ts`, `src/lib/assignments/leaderboard.ts`
**Severity:** MEDIUM | Confidence: High

Two complex raw SQL queries implement the same scoring rules. The ICPC ranking query in `leaderboard.ts` (118-176) duplicates the CTE structure from `contest-scoring.ts`. The IOI ranking query (182-216) calls `buildIoiLatePenaltyCaseExpr` which is shared, but the surrounding CTE structure is still duplicated. If a scoring bug is fixed in one place, the other may remain broken indefinitely.

**Fix:** Refactor to use a single shared query builder, or have the single-user rank call the full ranking function.
