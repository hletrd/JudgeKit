# High-stakes validation matrix

_Last updated: 2026-04-13_

This matrix defines the minimum evidence JudgeKit should gather before changing any GO/NO-GO statement for formal exams or public/high-stakes contests.

## Required validation lanes

### 1. Runtime topology validation
- Explicitly declare `APP_INSTANCE_COUNT` or `REALTIME_SINGLE_INSTANCE_ACK`
- If running more than one app instance, require `REALTIME_COORDINATION_BACKEND=postgresql`
- Require `COMPILER_RUNNER_URL`
- Keep `ENABLE_COMPILER_LOCAL_FALLBACK=0`
- Suggested command: `bash scripts/check-high-stakes-runtime.sh`

### 2. Realtime load validation
- concurrent SSE connection-cap enforcement under realistic user load
- anti-cheat heartbeat deduplication under multi-instance routing
- sticky-session / load-balancer behavior verified in the real target topology

### 3. Recovery / failover rehearsal
- reclaiming and requeue behavior verified for worker failure
- app restart during active judging reviewed
- operator runbook reviewed for worker incidents

### 4. Assessment-integrity review
- anti-cheat wording reviewed and accepted
- evidence model reviewed against the target institution/employer policy
- any stronger proctoring or operational controls documented if required

### 5. Retention / governance review
- retention windows explicitly approved for the target deployment
- transcript access and handling rules reviewed
- export/archive requirements reviewed before relying on automated deletion

## Output expectation
A deployment should not call itself exam-ready or public-contest-ready unless every lane above has explicit recent evidence, not just code changes.
