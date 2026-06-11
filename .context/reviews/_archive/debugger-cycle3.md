# Debugger — Cycle 3 Deep Review (2026-05-01)

**HEAD reviewed:** `894320ff` (main)

## Latent bug surface analysis

### C3-DBG-1: `participant-status.ts:99` — null status returns "submitted" (MEDIUM, confidence: High)

**File:** `src/lib/assignments/participant-status.ts:99`

Confirmed latent bug. When `latestStatus` is null and `attemptCount > 0`, the function returns "submitted". This is incorrect because:
1. A null status typically means "not yet judged" or "status unknown"
2. "submitted" implies the submission was explicitly accepted by the system
3. This could mislead instructors viewing the participant table

**Failure mode:** Worker crashes mid-judge before updating status. The submission record has `status = null`. The participant status table shows "submitted" instead of a more accurate "pending" or "queued", preventing the instructor from identifying stuck submissions.

**Reproduction:** Create a submission, set its status to null in the DB (simulating a crash), then view the participant status. It will show "submitted".

### C3-DBG-2: `in-memory-rate-limit.ts:129` — Infinity exponent in edge case (LOW, confidence: High)

**File:** `src/lib/security/in-memory-rate-limit.ts:129`

While `Math.min(blockMs * Math.pow(2, entry.consecutiveBlocks), MAX_BLOCK)` correctly caps the result, `Math.pow(2, Infinity)` returns `Infinity` and `Math.min(Infinity, MAX_BLOCK)` returns `MAX_BLOCK`, so no actual bug exists. However, if someone removes the MAX_BLOCK cap thinking the BACKOFF_CAP protects the exponent (as in the DB module), the exponent would be unbounded.

**Failure mode:** Not a current bug, but a latent risk due to inconsistent cap patterns between the in-memory and DB-backed modules.

### C3-DBG-3: `visibility.ts:103-136` — `delete` operator on spread-copied object (LOW, confidence: Medium)

**File:** `src/lib/submissions/visibility.ts:103-136`

The function creates a sanitized copy via `const sanitized = { ...submission }` and then uses `delete sanitized.sourceCode` on line 133. While `delete` works on plain objects, the spread copy creates an own property that can be deleted. This is correct but potentially fragile — if the input type changes to include getters or non-enumerable properties, the spread copy would miss them. No current issue, but worth noting.

**Failure mode:** Not a current bug, but a defensive programming concern.

## Final sweep

C3-DBG-1 is the primary latent bug finding (same as C3-CR-1). C3-DBG-2 is a code smell related to the BACKOFF_CAP inconsistency. No other latent bugs found in the critical paths.
