# Document Specialist — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Method:** doc/code mismatch audit across `docs/`, `SECURITY.md`, in-code comments on the changed surface, plan registers, and both i18n catalogs (operator-facing strings are documentation).

## Mismatches (action required)

### DOC6-1 — User-injected ops register is stale on two of three items (MEDIUM-doc, High, CONFIRMED)
`plans/open/user-injected/pending-next-cycle.md`: item #1 marked "ONGOING / Priority: High" but the referenced plan was archived 2026-04-29 as "ALL PHASES COMPLETE" (`plans/archive/2026-04-29-archived-workspace-to-public-migration.md` — verified: no `(workspace)` route group exists in `src/app`); item #3 (COMPILER_RUNNER_URL auto-injection for the algo target) is implemented at `deploy-docker.sh:657` (`ensure_env_literal COMPILER_RUNNER_URL "${COMPILER_RUNNER_DEFAULT}"`) with a drift warning at `:663-666`. Update both entries with resolution evidence, following the file's own item-#2 precedent ("RESOLVED (cycle 22)" with line citations).

### DOC6-2 — False authz comment on the anti-cheat GET (LOW-doc, High, CONFIRMED)
`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:192-195` claims the POST keeps `canManageContest`; the POST is the student ingest (enrollment/token + origin pinning). Correct the comment to name real write surfaces guarded by `canManageContest` (similarity POST, score overrides, leaderboard freeze).

### DOC6-3 — Operator-facing string documents an unreachable state (LOW, High, CONFIRMED)
`messages/en.json:2313` / `messages/ko.json` `similarityServiceUnavailable` — no code path can produce `reason: "service_unavailable"` since AGG5-5. Remove with the enum member (CR6-2) so the catalog documents only real states.

## Verified consistent (no action)
- `docs/exam-integrity-model.md` ↔ flag-recording behavior (accepted-only, submission linkage, fail-open) — exact match at this HEAD.
- `SECURITY.md` heartbeat-gate fail-open posture — matches `submissions/route.ts:396-403`.
- `review-model.ts` tier doc-comment ↔ actual producers (single producer, post-accept) — match.
- `anti-cheat-storage.ts` module docs (queue cap rationale, in-flight slot semantics) ↔ implementation — match, including the "bounded duplicate beats silent loss" tradeoff note.
- `docs/judge-workers.md` staleness lifecycle (online→stale→offline, background sweep) ↔ `worker-staleness-sweep.ts` — match.
- Deploy policy docs ↔ `.env.deploy.algo` (SKIP_LANGUAGES/BUILD_WORKER_IMAGE/INCLUDE_WORKER) — match; CLAUDE.md production rules reflected in `deploy-docker.sh` guards.

## i18n catalog parity sweep
`contests.antiCheat.*` namespace: en and ko key sets identical (including cycle-5's `heartbeatGaps.*`, `detailStale*`, `durationMinutesSeconds`); no Korean string uses `tracking-*` styling (rule honored via locale-conditional classes). One asymmetry to remove with DOC6-3 (both locales).

## Final sweep
README/docs reference no removed scripts or routes; `docs/api.md` submissions pagination section does not promise tie-stability (so CR6-3's fix is non-breaking documentation-wise, but adding a sentence about the (submittedAt, id) order after the fix would make the contract explicit).
