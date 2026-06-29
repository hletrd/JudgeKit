# Performance, Concurrency, and Operational Responsiveness Review

Repo: `/Users/hletrd/flash-shared/judgekit`  
HEAD: `120d5544`  
Cycle: review-plan-fix 1/100  
Reviewer: perf-reviewer  
Date: 2026-06-30

## Inventory

I inventoried the repository before reviewing hot paths. Excluding build/runtime bulk directories (`node_modules`, `.git`, Rust `target`, `.next`, `data`, backups, coverage/test results), the working tree contains 6,102 files. Largest areas by file count are `.context` (2,937), `.omc` (800), `src` (636), `tests` (525), `plans` (344), `.omx` (275), `docker` (106), `static-site` (101), `drizzle` (99), `scripts` (68), and `judge-worker-rs` (21). Extension mix is dominated by Markdown/history (`.md` 2,339), TypeScript/TSX (1,169 combined), JSON (679), Python (416), C++ fixtures (410), SQL (58), shell (27), and Rust (14).

Review focus was the performance-sensitive surface: `deploy-docker.sh`, Dockerfiles and `.dockerignore`, cleanup scripts, Docker admin APIs, Rust judge worker, Rust sidecars, submission/judge claim paths, leaderboard/ranking cache paths, validator limits, and database index usage around hot queries.

## Findings

### PERF-1 - App and worker builds throw away almost all reusable work

Severity: High  
Confidence: High  
Files: `deploy-docker.sh:753-760`, `deploy-docker.sh:1192-1201`, `Dockerfile:17-18`, `Dockerfile:29-47`, `Dockerfile.judge-worker:5-17`

Scenario: every normal deploy builds `judgekit-app` and `judgekit-judge-worker` with `docker build --no-cache`. The app Dockerfile is cache-friendly (`COPY package*.json` then `npm ci`, then copy source), but `--no-cache` disables that benefit. The worker Dockerfile then forces `cargo clean && cargo build --release`, so even a small TypeScript-only deploy rebuilds Rust dependencies from scratch on the app host and again on every dedicated worker host.

Failure mode: deploy latency and disk churn scale with dependency compilation instead of source changes. Repeated deploys on worker hosts rewrite large Rust layer sets, then depend on later prune steps to reclaim them. Under incident response, this makes the slowest path the one operators need most: shipping a small config or UI fix while hosts are already under disk pressure.

Fix: keep server-side target-architecture builds, but preserve dependency caches safely. Use BuildKit cache mounts for npm (`--mount=type=cache,target=/root/.npm`) and Cargo (`--mount=type=cache,target=/usr/local/cargo/registry`, `target=/build/target`) keyed by platform, or use `cargo-chef` for worker dependencies. Remove unconditional `cargo clean`; make a fully clean worker build an explicit deploy flag. Add a worker-input hash over `judge-worker-rs/**`, `Cargo.lock`, `Dockerfile.judge-worker`, `docker/seccomp-profile.json`, and only rebuild dedicated worker images when that hash changes.

### PERF-2 - Build failure paths skip the cleanup designed to protect disk

Severity: High  
Confidence: High  
Files: `deploy-docker.sh:742-815`, `deploy-docker.sh:822-824`, `deploy-docker.sh:1199-1224`

Scenario: the deploy script correctly runs dangling-image, builder-cache, and BuildKit-history cleanup after a successful app/worker restart. But if app, worker, or language image build fails, the script hits `die` before the post-build cleanup path. Dedicated worker hosts have the same shape: a failed `docker build --no-cache` exits at `deploy-docker.sh:1199-1201`, while worker-host cleanup only runs after the worker is restarted and verified at `deploy-docker.sh:1210-1222`.

Failure mode: the exact case most likely to fill disk, a failed no-cache build or language build, leaves partial layers and builder history behind. The next deploy starts with less free disk and may fail earlier, creating a failure loop. This is especially risky for large language images and for hosts already near the hard disk threshold.

Fix: wrap each remote build block in a host-local `finally` cleanup. In shell terms, use a helper that runs `run_remote_build`, captures its status, always calls `prune_old_docker_artifacts` on that same host, then returns the original status. For language builds, run a lightweight cleanup after each failed language build before `die`, and after every N successful language builds during `--languages=all` to bound transient cache growth.

### PERF-3 - Disk guards check `/`, not the actual Docker and workspace mounts

Severity: High  
Confidence: High  
Files: `deploy-docker.sh:513-541`, `scripts/docker-disk-cleanup.sh:27-42`, `docker-compose.worker.yml:54-80`

Scenario: deploy preflight and recurring cleanup both compute disk pressure with `df --output=pcent /`. The worker uses `/judge-workspaces:/judge-workspaces` and `TMPDIR=/judge-workspaces`, while Docker may store layers under a separate mount from `/` depending on host setup (`docker info DockerRootDir`).

Failure mode: a host can pass the root-FS preflight while `/var/lib/docker` or `/judge-workspaces` is nearly full. Builds then fail mid-layer, or active judging fails to create temporary workspaces, even though logs say "Remote disk preflight OK". On the other side, a root filesystem at 92% can abort a deploy even if Docker storage is on a separate healthy volume.

Fix: check all relevant mounts: root, `dirname "$(docker info -f '{{.DockerRootDir}}')"`, and `/judge-workspaces` when present. Gate builds on both percent used and free bytes, because large layers need absolute headroom. Mirror the same logic in `scripts/docker-disk-cleanup.sh` so the systemd timer cleans the mount that is actually under pressure.

### PERF-4 - `.dockerignore` misses large local history and generated directories

Severity: Medium  
Confidence: High  
Files: `.dockerignore:1-29`

Scenario: deploy rsync excludes `.context`, `.omx`, and other local agent/history directories, but `.dockerignore` does not. Local Docker builds and any build path using the repository as context can hash/send thousands of irrelevant files. Current inventory shows `.context` alone has 2,937 files, `.omx` has 275, and `static-site` has 101.

Failure mode: Docker context creation becomes slower and less stable. Updating a review artifact or plan file can invalidate build context checksums even though no production code changed. On remote hosts, any path that builds from a synced tree with these directories present pays unnecessary I/O and context hashing costs.

Fix: extend `.dockerignore` to match the deploy exclusion policy: `.context/`, `.omx/`, `.agent/`, `.sisyphus/`, `plans/` if not needed at runtime, `coverage/`, `test-results/`, `node-compile-cache/`, `static-site/`, and other generated local-only artifacts. Keep `messages/*.json`, `drizzle/`, `docker/`, and production runtime assets explicitly included.

### PERF-5 - Admin Docker build timeouts do not reliably stop expensive work

Severity: High  
Confidence: High  
Files: `src/lib/docker/client.ts:320-350`, `src/lib/docker/client.ts:532-540`, `judge-worker-rs/src/runner.rs:264-279`, `judge-worker-rs/src/runner.rs:375-395`, `judge-worker-rs/src/runner.rs:659-687`

Scenario: the local admin build path times out after 600 seconds and calls `proc.kill()`, but that only targets the `docker` CLI process and does not guarantee BuildKit child work is stopped. The remote worker build path sends a request with a 600 second fetch timeout, but the Rust runner uses `Command::output().await` with no worker-side timeout and captures the full build output in memory. If the app request times out, the worker-side `docker build` can continue until Docker exits.

Failure mode: an admin clicks Build for a slow language image, the UI reports timeout, but the remote host keeps compiling and writing layers. Repeated clicks can start overlapping builds for the same tag. Build logs can also grow in worker memory because `Command::output()` buffers stdout and stderr until completion.

Fix: enforce timeout and cancellation in the runner itself. Run `docker build` in its own process group/session, kill the process group on timeout or request cancellation, and call safe cleanup afterward. Add a per-image or global build semaphore/single-flight guard so duplicate builds return the in-flight result or a 409. Apply the same head+tail log cap used in the TypeScript local path to the Rust runner.

### PERF-6 - Judge output buffering can consume hundreds of MiB per worker

Severity: High  
Confidence: High  
Files: `judge-worker-rs/src/docker.rs:418-468`, `docker-compose.worker.yml:61-68`, `src/lib/compiler/execute.ts:15-18`, `src/lib/compiler/execute.ts:455-464`

Scenario: the Rust worker default output cap is 128 MiB per stream. `docker-compose.worker.yml` defaults `JUDGE_CONCURRENCY` to 4 and documents worst-case output RAM as `JUDGE_MAX_OUTPUT_BYTES x 2 streams x JUDGE_CONCURRENCY`. That is roughly 1 GiB of output buffers before normal process overhead, compile memory, Docker, and app traffic. The Node fallback runner mirrors the 128 MiB cap and appends to JS strings, which can use more memory than raw bytes.

Failure mode: a few malicious or buggy submissions that print until timeout can push the worker into memory pressure while still staying inside configured limits. Because the worker correctly drains after the cap to avoid EPIPE, the container can continue running while the worker holds large captured buffers.

Fix: lower the default cap to an operationally safer value, for example 8-16 MiB per stream, and make large-output problems opt in. Store only a bounded diagnostic prefix/tail for stderr and stdout, not the whole cap, because judge comparison only needs enough bytes to decide output-limit-exceeded after the cap. Set `JUDGE_MAX_OUTPUT_BYTES` explicitly in compose rather than leaving the high code default implicit.

### PERF-7 - Submission POST performs an exact global queue count on every submit

Severity: Medium  
Confidence: High  
Files: `src/app/api/v1/submissions/route.ts:345-390`, `src/lib/db/schema.pg.ts:503-511`, `src/lib/validators/system-settings.ts:121-123`

Scenario: every non-manual submission transaction acquires a per-user advisory lock, checks per-user rates, then runs `COUNT(*)` over all `pending` and `queued` submissions. The status and queue-claim indexes help, but PostgreSQL still has to count every matching queued row. The setting allows `submissionGlobalQueueLimit` up to 100,000.

Failure mode: during deadline bursts, this query runs at the exact moment the queue is deepest. Cost grows with queue depth and is paid by every submitter. The per-user lock does not serialize different users, but it does keep each user's transaction open longer and adds database work before the insert can complete.

Fix: replace exact full count with a bounded threshold query: `SELECT COUNT(*) FROM (SELECT 1 FROM submissions WHERE status IN (...) LIMIT $maxGlobalQueue) q`, or use `EXISTS`/`LIMIT 1` style checks when the cap is small. Better, maintain a queue-depth counter updated on submit, claim, and terminal poll. The global soft cap can run before the per-user transaction; slight races are acceptable for admission control.

### PERF-8 - Judge claim ships all test case payloads with no byte cap

Severity: Medium  
Confidence: Medium-High  
Files: `src/lib/validators/problem-management.ts:9-13`, `src/lib/validators/problem-management.ts:135-164`, `src/app/api/v1/judge/claim/route.ts:319-329`, `src/app/api/v1/judge/claim/route.ts:413-427`, `judge-worker-rs/src/executor.rs:542-655`

Scenario: problem validators cap the number of test cases at 100, but do not cap `input` or `expectedOutput` size. The claim route selects every test case's full input and expected output, then returns the whole array to the worker. The worker then runs test cases sequentially, and IOI/function-style `run_all_test_cases` keeps going after failures.

Failure mode: an instructor or import path can create a problem with 100 large test cases. Every claimed submission then creates a large JSON response in the app, a large request body in the worker, and potentially a long-held worker slot. With high time limits, all-test-case judging can hold a slot for minutes to tens of minutes.

Fix: add per-test-case and per-problem aggregate byte limits for input and expected output at validation/import time. For larger datasets, store cases as files or blobs and have the worker fetch/stream them by ID rather than embedding all payloads in the claim JSON. Add a per-submission wall-clock budget in the worker so `run_all_test_cases` cannot monopolize a slot indefinitely.

### PERF-9 - Leaderboard cache invalidation defeats stale-while-revalidate during active contests

Severity: Medium  
Confidence: Medium-High  
Files: `src/app/api/v1/judge/poll/route.ts:198-207`, `src/lib/assignments/contest-scoring.ts:49-103`, `src/lib/assignments/contest-scoring.ts:132-190`

Scenario: contest rankings have a 30 second TTL and a stale-after-15-seconds background refresh path, but every final judge report invalidates the assignment's ranking cache immediately. During an active contest, verdicts can arrive continuously, so most leaderboard reads become cold recomputes instead of cache hits.

Failure mode: a popular contest can create a feedback loop: submissions complete, cache is deleted, many clients refresh leaderboard, the full ranking query recomputes, then the next verdict deletes it again. This hurts both DB responsiveness and perceived leaderboard latency.

Fix: switch from immediate deletion to a dirty marker plus coalesced refresh. Keep serving the last cached ranking for a small window, mark it dirty on verdict, and allow one background recompute per assignment every N seconds. If strict freshness is needed for admins, expose a `fresh=1` path with rate limiting rather than making every public/user leaderboard request synchronous after each verdict.

### PERF-10 - Code similarity can consume all CPU after client timeout

Severity: Medium  
Confidence: Medium  
Files: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:27-49`, `src/lib/assignments/code-similarity-client.ts:45-54`, `code-similarity-rs/src/main.rs:88-127`, `code-similarity-rs/src/similarity.rs:329-383`, `docker-compose.production.yml:157-174`

Scenario: the API route aborts after 30 seconds and the Rust client fetch uses a 25 second timeout, but the sidecar runs CPU work in `spawn_blocking` and then Rayon `par_iter`. There is no visible sidecar semaphore, request cancellation check inside the O(n^2) loops, `RAYON_NUM_THREADS`, or compose CPU/memory limit for `code-similarity`.

Failure mode: the app times out and returns `timed_out`, while the sidecar can keep burning CPU to finish the abandoned compute. Multiple admin-triggered checks can overlap and occupy all host cores, contending with Postgres, Next.js, Docker builds, and judge workers. The existing 500-submission cap is good, but 500 submissions in one language bucket still means about 124,750 pair comparisons per request, with normalization and hashed-set work.

Fix: add a sidecar-wide semaphore so only one or a small fixed number of compute jobs run at once. Set `RAYON_NUM_THREADS` and compose CPU/memory limits for `code-similarity`. Pass a cancellation token into the compute loop or split work into chunks that check cancellation between chunks. Consider assignment-level single-flight in the app so duplicate clicks share the same run.

## Positive notes

- The queue claim path uses `FOR UPDATE SKIP LOCKED` and dedicated queue indexes, which is the right shape for concurrent workers.
- Deploy cleanup already avoids `docker image prune -af`, preserving tagged judge language images.
- BuildKit history corruption recovery exists in `run_remote_build`; keep that behavior.
- The worker drains stdout/stderr after the output cap, which avoids misleading broken-pipe runtime errors.
- Code similarity now has a hard 500-submission boundary in the Rust sidecar, so the remaining issue is concurrency/cancellation, not unbounded input size.

