# Verifier Review — Cycle 1

**Date:** 2026-06-30
**Scope:** entire repository
**Reviewer angle:** evidence-based correctness checks — compare implemented code against documented behavior in AGENTS.md, docs/api.md, and inline comments.
**Summary:** Cross-checked advertised API contracts, function-signature judging, contest access/scoring, anti-cheat similarity checks, and deployment-safety claims against the current implementation. Found one clear docs/behavior mismatch on the similarity-check endpoint, one unguarded limit on the Rust similarity sidecar, one precision risk in the Java function harness, one misleading field in the compute-expected route, and one worker-host command fallback inconsistency. All findings are supported by direct code reads and test cross-references.
**Findings count:** 5

---

## MEDIUM: `POST /api/v1/contests/:assignmentId/similarity-check` response contract differs from `docs/api.md` (confidence: High)

- **Files:**
  - `docs/api.md:1089-1099`
  - `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:43-92`
  - `tests/unit/api/similarity-check.route.test.ts:104-168`
- **Problem:** `docs/api.md` documents the endpoint as returning a simple shape with only a flagged-pairs count and a `504` status on timeout:
  ```
  30-second timeout. Returns `504` on timeout.
  Response: { "data": { "flaggedPairs": 5 } }
  ```
  The implementation does two things the docs omit:
  1. On timeout it returns HTTP `200` with `data.status === "timed_out"`, `data.reason === "timeout"`, `flaggedPairs: 0`, `pairs: []` (route.ts:53-60).
  2. On success it enriches every pair with `user1Name`, `user2Name`, and converts the raw `[0,1]` similarity to a percentage integer via `Math.round(p.similarity * 100)` (route.ts:82-87).
- **Failure scenario:** An API consumer generated from `docs/api.md` will expect a `504` on timeout and will not handle the actual `200` + `status: "timed_out"` body. A dashboard or client that only reads `data.flaggedPairs` will also miss the `pairs` array, the `submissionCount`, the `maxSupportedSubmissions`, and the percentage-scaled `similarity` values.
- **Suggested fix:** Update `docs/api.md` to match the implementation (preferred, because the tests at `similarity-check.route.test.ts:133-168` explicitly assert the `200` + `timed_out` shape and the enriched pairs are already shipped). Alternatively, change the route to return `504` and the minimal payload, but that would break the existing unit tests and dashboard callers.
- **Cross-references:** `src/lib/assignments/code-similarity.ts:404-457` (storage of pairs), `src/lib/assignments/code-similarity.ts:236` (`maxSupportedSubmissions: 500`).

---

## MEDIUM: `MAX_SUBMISSIONS_FOR_SIMILARITY` limit is enforced only on the TypeScript fallback, not the Rust sidecar (confidence: High)

- **Files:**
  - `src/lib/assignments/code-similarity.ts:236, 354-367, 379-388`
- **Problem:** `runSimilarityCheck` first attempts the Rust sidecar (`computeSimilarityRust`) and only applies the 500-submission guard when falling back to the TypeScript implementation. The guard is explicitly commented as applying only to the fallback, but the constant name and the response field `maxSupportedSubmissions` advertise it as a general ceiling for the feature.
- **Failure scenario:** On a deployment where the Rust sidecar is running, a contest with 700, 1,000, or more best submissions will be sent to the sidecar without any cap. If the sidecar is not bounded internally, this can cause excessive CPU/memory usage and a route timeout, degrading the API for all users. The documented/engineered limit of 500 is effectively bypassed in the common (sidecar-available) path.
- **Suggested fix:** Move the `rows.length > MAX_SUBMISSIONS_FOR_SIMILARITY` check before the Rust sidecar attempt, or add an equivalent limit inside `computeSimilarityRust` / the sidecar itself. If the sidecar is intentionally allowed to handle larger contests, update the constant name, the response semantics, and the dashboard copy so operators understand the limit is fallback-only.
- **Cross-references:** `src/lib/assignments/code-similarity-client.ts` (sidecar client), `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:43-65` (30-second timeout).

---

## MEDIUM: Java function harness formats `double` returns with only 10 significant digits (confidence: Medium)

- **Files:**
  - `src/lib/judge/function-judging/adapters/java.ts:186`
  - `src/lib/judge/function-judging/comparison.ts:32-48`
  - `src/lib/judge/function-judging/serialization.ts:33-41, 68-74`
- **Problem:** The Java adapter serializes `double` return values using `String.format(java.util.Locale.ROOT, "%.10g", v)`. `%.10g` prints at most 10 significant digits. The docs and comments state that `double`/`double[]` returns are judged with float comparison, so exact byte-match across languages is not required. However, a 10-significant-digit round-trip can lose enough precision that two mathematically identical results (or a result and its expected value) diverge by more than the default `1e-9` tolerance when the value needs more digits to round-trip exactly.
- **Failure scenario:** A problem expecting `1.0000000001234567` could be serialized from the reference solution as `1.0000000001` (10 significant digits). The student's C# solution, which uses `double.ToString("R")`, might emit `1.00000000012346`. The float comparator uses tolerance, so this specific pair may still pass, but values near the tolerance boundary or with larger magnitudes can produce wrong verdicts. More importantly, `serialization.ts` already uses `String(Number(v))` (JavaScript's shortest round-trip, ~17 significant digits) for expected outputs, so the Java adapter's 10-digit form is the least precise adapter in the pipeline.
- **Suggested fix:** Replace `%.10g` with a round-trip-safe format such as `%.17g` or `Double.toString(v)`, matching the precision contract used by `serialization.ts` and the other adapters (Python `repr(float)`, C# `"R"`).
- **Cross-references:** `src/lib/judge/function-judging/adapters/python.ts:20-24` (`repr(float(...))`), `src/lib/judge/function-judging/adapters/csharp.ts:151` (`"R"` round-trip format), `src/lib/judge/function-judging/adapters/javascript.ts:15-16` (`String(__result)` — also low precision but documented as acceptable under tolerance).

---

## MEDIUM: `compute-expected` populates `expectedOutput` with stdout even when the reference solution exits non-zero (confidence: High)

- **Files:**
  - `src/app/api/v1/problems/[id]/compute-expected/route.ts:162-170`
  - `docs/api.md` (Function-Signature Problems section)
- **Problem:** The route comment says "The produced stdout becomes each case's computed `expectedOutput`." For a successful run (`exitCode === 0`) this holds. For a run that exits non-zero, the route marks `ok: false` but still stores the captured stdout in the `expectedOutput` field (route.ts:166). The field name implies the value will be used as expected output; a UI that displays per-case results may let an author save a crashing reference solution's partial/empty stdout as the canonical expected output.
- **Failure scenario:** An author writes a reference solution that segfaults on one test case. The `compute-expected` response for that case contains `ok: false, error: "exitCode 139", expectedOutput: ""` (or whatever garbage stdout was produced). If the authoring UI ignores `ok` and writes `expectedOutput` to the database, the test case will be judged against malformed expected output. The route does not currently persist anything itself, so the immediate bug is in the contract it presents to callers.
- **Suggested fix:** When `exitCode !== 0`, set `expectedOutput: ""` so the field is unambiguously not usable, or rename the field to `output` for non-success cases. Alternatively, document that `expectedOutput` may contain partial stdout for debugging when `ok === false`.
- **Cross-references:** `src/lib/judge/function-judging/serialization.ts:68-74` (canonical expected-output encoding), `src/lib/judge/function-judging/assemble.ts` (reference-solution assembly).

---

## LOW: Worker-host restart in `deploy-docker.sh` lacks the `docker-compose` fallback used for the app host (confidence: Medium)

- **Files:**
  - `deploy-docker.sh:1285`
  - `deploy-docker.sh:1393-1396`
- **Problem:** When starting containers on the app host, the script uses `docker compose ... || docker-compose ...` (line 1285) to tolerate either Docker Compose v2 or v1. When restarting the worker compose on a dedicated worker host, it uses only `docker compose` (lines 1393-1396) with no fallback.
- **Failure scenario:** If a worker host is running an older Docker version that provides only the `docker-compose` Python plugin/standalone binary, the deploy will fail at the worker restart step even though the app host would have succeeded in the same environment.
- **Suggested fix:** Apply the same fallback pattern on the worker host:
  ```bash
  docker compose -f docker-compose.worker.yml --env-file .env up -d || \
  docker-compose -f docker-compose.worker.yml --env-file .env up -d
  ```
- **Cross-references:** `deploy-docker.sh:1309-1422` (entire `WORKER_HOSTS` block), `CLAUDE.md` (algo.xylolabs.com must not build worker images; worker images are built on dedicated worker hosts).

---

## Final sweep

- **Areas verified and found consistent:**
  - Function-signature type system (`src/lib/judge/function-judging/types.ts`) correctly restricts to scalar + 1-D arrays and rejects void returns, matching AGENTS.md v1.
  - `resolveComparisonMode` (comparison.ts:32-43) forces `"float"` for `double`/`double[]` returns and `"exact"` otherwise, matching the documented contract.
  - `extractClientIp` (`src/lib/security/ip.ts:68-131`) correctly validates hop count, unwraps IPv4-mapped IPv6, and returns `null` in production when the chain is shorter than `TRUSTED_PROXY_HOPS`; callers in `ip-allowlist.ts:204-207`, `rate-limit.ts:46`, and `request-context.ts:20-27` handle the `null`/`"0.0.0.0"` sentinel safely.
  - Contest access-token expiry (`src/lib/assignments/contest-access-tokens.ts:99-104`) now uses `lateDeadline ?? deadline`, matching the documented fix for late-submission windows.
  - `deploy-docker.sh` never runs `docker volume prune` or `docker system prune --volumes` in automated paths, and uses `chmod 600` for `.env` files, consistent with safety claims.

- **Items needing manual validation (cannot verify statically):**
  - Whether the Rust similarity sidecar internally enforces its own submission limit or memory ceiling when the TS guard is skipped.
  - Whether any dashboard/API client still relies on the documented `504`/minimal `flaggedPairs` response and will break on the actual implementation.
  - Whether Java reference solutions emitting doubles near the tolerance boundary have produced wrong verdicts in production or E2E tests.

