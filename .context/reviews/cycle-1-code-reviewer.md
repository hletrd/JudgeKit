# RPF Loop Cycle 1 — Code Reviewer (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** code-reviewer

## Summary
Quality is broadly high — the recent month of work added strong defenses (per-worker tokens, IPv6 CIDR, anti-cheat heartbeat correlation, docker-path validator). However a few real issues remain at HEAD.

## NEW findings

### CR-1: [HIGH] `recruit/[token]/results/page.tsx` totalScore mixes raw score (0-100) with points-scaled values

- **File:** `src/app/(auth)/recruit/[token]/results/page.tsx:183-191`
- **Code:**
  ```ts
  let totalScore = 0;
  let totalPossible = 0;
  for (const ap of assignmentProblemRows) {
    totalPossible += ap.points ?? 100;          // ← per-problem points (e.g., 50)
    const best = bestByProblem.get(ap.problemId);
    if (best?.score !== null && best?.score !== undefined) {
      totalScore += best.score;                  // ← submission percentage 0-100
    }
  }
  ```
- **Description:** `submissions.score` is a percentage (0-100) per the Drizzle schema and the rest of the codebase (e.g., `mapSubmissionPercentageToAssignmentPoints` in `scoring.ts`). But `totalPossible` accumulates `assignmentProblems.points` (problem weight, often 100 but configurable to e.g. 25 or 50). The displayed total compares apples to oranges. With three 25-point problems each at 80% raw score: `totalScore = 240`, `totalPossible = 75` — the candidate sees `240 / 75`, which is nonsensical.
- **Confidence:** HIGH (cross-referenced `submissions.score` semantics in `scoring.ts:13-29` and `assignmentProblems.points` semantics in the schema)
- **Failure scenario:** A candidate sees an inflated or impossible total on the recruit results page. Cosmetic but undermines trust in the platform during recruiting flows. Internally the per-problem display row (`{formatScore(best?.score ?? 0)} / {formatScore(ap.points ?? 100)}` at line 263) shows the same mismatch — `best.score` is a percentage, `ap.points` is the weight, so a candidate scoring 80 on a 25-point problem sees `80 / 25`.
- **Fix:** Use `mapSubmissionPercentageToAssignmentPoints(best.score, ap.points)` for the per-problem display value, then sum those scaled values for `totalScore`. Apply late penalties consistently (the function already handles them).

### CR-2: [MEDIUM] `participant-status.ts` "accepted-fallthrough" returns `submitted` for already-accepted submissions

- **File:** `src/lib/assignments/participant-status.ts:107-109`
- **Code:**
  ```ts
  if (latestStatus === "accepted") {
    return "submitted";
  }
  ```
- **Description:** The function returns "submitted" for an "accepted" latest status when the perfect-score branch did not match (e.g., partial-credit acceptance with `bestTotalScore < totalPoints`, or `totalPoints === 0`). In that case the status displayed to the participant is "submitted" rather than "accepted". This is intentional per recent design (only return "accepted" when the score is perfect), but the early-return at line 82 already handles `latestStatus === "accepted"` because `isActiveSubmissionStatus("accepted")` is true OR equivalent — let's verify. Actually `isActiveSubmissionStatus` likely returns false for terminal states like `accepted`. So this branch IS reachable. The semantics need a code comment so future readers don't assume bug.
- **Confidence:** MEDIUM (depends on `isActiveSubmissionStatus` semantics)
- **Fix:** Add a comment explaining why the `accepted → submitted` mapping exists. If the intent is "accepted but not full marks display as 'submitted'", say so explicitly. Alternatively introduce a new value `"partial_accepted"` and update the type union.

### CR-3: [MEDIUM] `docker/client.ts` build-API path uses dual-purpose error string for missing token

- **File:** `src/lib/docker/client.ts:26-30, 101-103`
- **Code:**
  ```ts
  const WORKER_DOCKER_API_CONFIG_ERROR =
    JUDGE_WORKER_URL && !RUNNER_AUTH_TOKEN
      ? "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing"
      : null;
  ```
- **Description:** This error message is then surfaced *to the API caller* via `buildDockerImage`, `pullDockerImage`, `removeDockerImage` (line 309-310, 362-363, etc.) — the strings flow into `{ success: false, error: configError }`. That leaks operator-facing config details (env-var names) into client responses. Not a vulnerability per se, but inconsistent with the explicit hardening at `src/app/api/metrics/route.ts:30-43` (commit `d30c362b`) which deliberately stopped leaking `CRON_SECRET` env-var name to anonymous callers. The same principle should apply here.
- **Confidence:** MEDIUM
- **Failure scenario:** An admin UI showing this error reveals to anyone with access to the request log that the deployment uses `RUNNER_AUTH_TOKEN`, which leaks deployment-fingerprint information.
- **Fix:** Log the operator-friendly message via `logger.error` and return a generic `{ success: false, error: "configError" }` to the API. The admin UI can show "config error — see logs".

### CR-4: [LOW] `pre-restore-snapshot.ts` `pruneOldSnapshots` runs without await on the main path

- **File:** `src/lib/db/pre-restore-snapshot.ts:57-59`
- **Code:**
  ```ts
  void pruneOldSnapshots(dir).catch((err) => {
    logger.warn({ err, dir }, "[restore] failed to prune old snapshots");
  });
  return fullPath;
  ```
- **Description:** The fire-and-forget prune runs concurrently with the next caller invocation. Two close-in-time `takePreRestoreSnapshot` calls can both list-and-delete the same older snapshots (race). Worst case is duplicate `unlink` errors that are swallowed. Not a correctness issue but a sign of "best-effort" code that could occasionally lose snapshots in edge cases.
- **Confidence:** LOW
- **Fix:** Either await `pruneOldSnapshots` (cheap — only reads N files) or guard it with a per-process mutex.

### CR-5: [LOW] `submission-form` snapshot timer never resets `lastSnapshotRef` after submit

- **File:** `src/components/problem/problem-submission-form.tsx:92, 110-134, 250-296`
- **Description:** When the user successfully submits, `clearAllDrafts()` and `router.push()` run, but `lastSnapshotRef.current` is never reset. If they navigate back to the same problem in the same SPA session and start typing the same code, the snapshot diff will erroneously consider it "unchanged" and skip the snapshot. Minor — the next character typed will trigger a snapshot — but it's an unintended state.
- **Confidence:** LOW
- **Fix:** Reset `lastSnapshotRef.current = ""` inside `executeSubmit`'s success branch, alongside `clearAllDrafts()`.

### CR-6: [LOW] `judge/auth.ts` warn-log spreads `workerId` outside of the format string for one log

- **File:** `src/lib/judge/auth.ts:92-95`
- **Code:**
  ```ts
  logger.warn(
    { workerId },
    "[judge] Worker %s has no secretTokenHash — rejecting auth. Re-register the worker so it acquires a per-worker secret.",
  );
  ```
- **Description:** The format string contains `%s` but no positional arg follows. Pino doesn't substitute `%s` from the binding object — `workerId` lands as structured field but the message string keeps the literal `%s`. The other log at line 75-77 uses `{ workerId }` correctly without `%s`.
- **Confidence:** HIGH (verified by reading pino docs — printf-style format requires positional argument list)
- **Fix:** Either remove `%s` from the message or pass `workerId` as a positional arg: `logger.warn({ workerId }, "[judge] Worker has no secretTokenHash ..."`.

### CR-7: [LOW] `data-retention-maintenance.ts` `pruneTimer` and global timer can desync on stop

- **File:** `src/lib/data-retention-maintenance.ts:108, 120-136`
- **Description:** `startSensitiveDataPruning` assigns `globalThis.__sensitiveDataPruneTimer` and also stores the same handle in module-local `pruneTimer`. `stopSensitiveDataPruning` clears `pruneTimer` only when truthy and clears the global. But if `start` is called twice, the old `pruneTimer` (now stale handle that was already `clearInterval`'d on line 114) is never reassigned via the new globalThis (line 120 does it correctly — confirmed). On second look the code IS correct: line 120 re-binds `pruneTimer` from the new globalThis. So this is a non-issue. Withdrawing this finding.
- **Confidence:** LOW (withdrawn after re-read)
- **Status:** WITHDRAWN

## Final-sweep checklist

- [x] Re-read all changed source files since cycle 3 aggregate.
- [x] Cross-checked each finding against the relevant test (where present).
- [x] Confirmed CR-1 by tracing `submissions.score` semantics through `scoring.ts` and `submissions.ts`.
- [x] Confirmed CR-3 against `metrics/route.ts` precedent.
