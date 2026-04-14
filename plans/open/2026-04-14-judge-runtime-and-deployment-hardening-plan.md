# Implementation plan — judge runtime, worker coordination, and deployment hardening (2026-04-14)

## Source review lines
Primary sources:
- `.context/reviews/multi-agent-comprehensive-review-2026-04-13-current-head.md`
  - findings 6, 7, 8, 9, 10, 11, 19, 20, 23
- `.context/reviews/adversarial-security-review-2026-04-12-current-head.md`
  - M1, M5
- `.context/reviews/multi-perspective-review-2026-04-12-current-head.md`
  - remaining exam/contest ops architecture criticism

## Goal
Repair the current judge/worker/deploy invariants so long-running jobs, split-host deployments, similarity offload, and worker-boundary operations behave predictably and truthfully.

## Workstream A — Claim freshness and worker-capacity accounting
**Targets**
- `src/app/api/v1/judge/claim/route.ts`
- `src/app/api/v1/judge/poll/route.ts`
- `judge-worker-rs/src/main.rs`
- any relevant DB schema/helper code for worker accounting

**Implementation intent**
- refresh or otherwise re-derive claim freshness while work is still legitimately running;
- decrement `judge_workers.active_tasks` on terminal reports in the authoritative server transaction;
- clear worker ownership on completion in the same path.

**Acceptance criteria**
- long-running compile/execution jobs are not reclaimed while still healthy;
- DB worker capacity reflects completion immediately, not only after heartbeat reconciliation;
- stale-claim recovery still works for genuinely dead workers.

**Verification expectations**
- route/unit tests for long-running in-progress updates and terminal decrement behavior;
- manual or integration simulation of reclaim-after-dead-worker vs no-reclaim-for-live-worker.

## Workstream B — Runtime-limit contract alignment
**Targets**
- `judge-worker-rs/src/executor.rs`
- `src/lib/validators/problem-management.ts`
- `src/app/api/v1/problems/import/route.ts`
- `src/app/api/v1/problems/[id]/route.ts`
- any relevant docs describing runtime limits

**Implementation intent**
- align the worker’s actual memory ceiling with the problem-authoring contract, or lower the authoring contract to the real worker ceiling.

**Acceptance criteria**
- the value accepted by the UI/API is the value the worker really enforces;
- docs and validation messages do not over-promise memory availability.

**Verification expectations**
- unit tests for allowed limits and worker enforcement;
- one compiled/runtime path check at the chosen upper bound.

## Workstream C — Split-host runner/admin topology correctness
**Targets**
- `docker-compose.production.yml`
- `deploy-docker.sh`
- `src/lib/compiler/execute.ts`
- `src/lib/docker/client.ts`
- admin worker/docker docs and env examples

**Implementation intent**
- stop pointing the app at a local runner that the deploy script deliberately stops;
- support an explicit split-host runner/admin URL contract, or disable those surfaces when no runner exists.

**Acceptance criteria**
- split-host app deployments have a valid runner/admin target or clearly disabled dependent features;
- admin Docker image management no longer “succeeds empty” when the worker API is actually unreachable.

**Verification expectations**
- config tests for `INCLUDE_WORKER=true/false` topologies;
- one split-host smoke path covering compiler-run and/or admin Docker inventory behavior.

## Workstream D — Similarity service wiring and large-contest offload
**Targets**
- `docker-compose.production.yml`
- `src/lib/assignments/code-similarity-client.ts`
- `src/lib/assignments/code-similarity.ts`
- `code-similarity-rs/` request validation where needed

**Implementation intent**
- wire the app to the actual similarity sidecar in containerized deployments;
- try the Rust sidecar before applying the TypeScript-only size bailout;
- harden request validation where the sidecar currently panics or fails unclearly.

**Acceptance criteria**
- Docker deployments actually reach `code-similarity` instead of `127.0.0.1` in the app container;
- large contests can use the Rust path instead of always returning `too_many_submissions`;
- malformed `ngram_size`-style inputs fail cleanly.

**Verification expectations**
- parity/integration tests that exercise sidecar success and fallback behavior;
- one large-input test proving the Rust path is attempted before local bailout.

## Workstream E — Deploy fail-fast and runtime-truth synchronization
**Targets**
- `deploy-docker.sh`
- `scripts/online-judge.nginx.conf`
- `scripts/online-judge.nginx-http.conf`
- `scripts/*.service`
- `docs/deployment.md`
- `docs/judge-workers.md`

**Implementation intent**
- make migration failure fatal by default;
- keep checked-in nginx/service/docs artifacts aligned with the deploy-generated runtime truth;
- make the archive/manual docs stop pointing operators at stale paths or broken proxy headers.

**Acceptance criteria**
- failed migrations abort deploy rather than printing success;
- checked-in nginx templates match the current known-good generated config for critical headers/body limits;
- legacy systemd/manual docs do not point at stale repo paths or unwritable dead-letter defaults.

**Verification expectations**
- script/fixture tests for migration failure handling and generated nginx shape;
- doc/config contract tests where static templates are meant to match generated output.

## Workstream F — Worker-boundary credential and isolation follow-up
**Targets**
- `src/lib/judge/auth.ts`
- `judge-worker-rs/src/runner.rs`
- `src/lib/docker/client.ts`
- relevant env examples / docs

**Implementation intent**
- separate judge-protocol auth from runner/docker-admin auth, or otherwise reduce the blast radius of one shared bearer token;
- clarify which services are allowed to call the high-consequence worker-runner surfaces.

**Acceptance criteria**
- one leaked/shared token no longer authorizes every worker-side capability;
- docs/env examples explain the token split or revised trust boundary clearly.

**Verification expectations**
- auth tests for distinct token scopes and negative-path coverage.

## Completion bar
This plan is ready to archive only when worker lifecycle state, split-host topology, deploy failure handling, and similarity offload behavior are all internally consistent and reflected accurately in checked-in runtime docs/templates.
