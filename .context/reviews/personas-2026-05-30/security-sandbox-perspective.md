# JudgeKit Sandbox Security Review — Offensive Perspective

Scope: untrusted-code execution sandbox (judge-worker-rs, docker/Dockerfile.judge-*,
crun install, docker-compose.worker.yml / .production.yml, deploy-worker.sh,
rebuild-worker-language-images.sh, src/app/api/v1/judge/*, src/lib/judge/*).

Threat model: an attacker submits arbitrary source code as a candidate / student /
contestant. Goals: (1) break out to the judge host, (2) cheat by reading expected
outputs or other test data, (3) reach the network, (4) DoS other contestants, (5)
forge verdicts.

Verdict up front: the run-time isolation design is **above average** for a self-hosted
judge — `--network none`, `--cap-drop=ALL`, `--read-only` rootfs, `--user 65534`,
`--pids-limit`, `--memory`, custom default-deny seccomp, read-only workspace at run
phase, and (critically) **expected outputs are never mounted into the sandbox** —
comparison happens in the worker, outside the container. The most serious issues are
(a) a likely **silent seccomp bypass** caused by the daemon resolving the profile path
on the host while the file only exists inside the worker container, and (b) the
**docker-socket-proxy with POST/DELETE/START = full container-create rights**, which is
a host-compromise vector if the worker (or its runner HTTP endpoint) is ever abused.

---

## Top exploitable risks (ranked)

1. **Seccomp profile likely NOT applied on production/worker compose (silent bypass).**
   Containers are spawned through `DOCKER_HOST=tcp://docker-proxy:2375`, so the **host
   Docker daemon** resolves `--security-opt=seccomp=/etc/judge/seccomp-profile.json`
   against the **host filesystem**. The profile is `COPY`d only *inside* the worker
   image (`Dockerfile.judge-worker:34`) and is never bind-mounted to the host
   (`/etc/judge` is not in any compose volume list). If the host lacks that path, every
   sandbox runs with **Docker's default seccomp** (much wider) — or, if the daemon
   errors, the worker fails closed. Either way the *intended* hardened profile is not
   what executes. CONFIRMED config gap; runtime effect SUSPECTED (needs `docker inspect`
   on a live sandbox). Severity High, Confidence Medium-High.

2. **docker-socket-proxy grants POST + DELETE + ALLOW_START + ALLOW_STOP + CONTAINERS=1.**
   This is effectively container-create on the host. Anything that can drive the worker's
   docker calls (a worker RCE, or the authenticated `/docker/*` + `/run` runner HTTP API)
   can create a new container with `--privileged`, `-v /:/host`, hostPID, etc. — full
   host takeover. The sandbox flags are applied by *worker code*, not enforced by the
   proxy ACL (the compose comments admit this). CONFIRMED. Severity Critical *if* the
   worker process or runner endpoint is compromised; the sandbox itself does not directly
   expose it. Confidence High.

3. **No user-namespace remapping; root-in-container == uid mapping on host.**
   Sandboxes run `--user 65534:65534` (good) but there is no `--userns-remap` / rootless
   daemon. Combined with risks #1/#2, any container-escape primitive (kernel LPE, a
   seccomp gap) lands as a real host uid. The only thing standing between a kernel 0-day
   and the host is the seccomp profile — which per #1 may not even be applied. CONFIRMED
   (no userns config anywhere). Severity High, Confidence High.

4. **Compile phase: 600 s timeout, 2 GiB RAM, writable workspace, `sh -c` of an
   arbitrary admin/DB command — compiler bomb DoS surface.** `executor.rs:13-14`
   (`COMPILATION_MEMORY_LIMIT_MB=2048`, `COMPILATION_TIMEOUT_MS=600_000`). A submission
   that triggers pathological compilation (C++ template recursion, huge constexpr, Rust
   trait recursion) can pin a CPU + 2 GiB for **10 minutes** per claim. With
   `JUDGE_CONCURRENCY` up to 16, that's 32 GiB and 16 cores tied up — a cheap
   contest-wide DoS. CONFIRMED. Severity Medium-High, Confidence High.

5. **Workspace `/tmp` is `exec`-capable and 1 GiB during compile, and 7 languages get
   `exec` `/tmp` at *run* time (`needs_exec_tmp`).** `docker.rs:9-10`,
   `runner.rs`/`executor.rs` pass `needs_exec_tmp`. For those langs the run sandbox loses
   the `noexec /tmp` mitigation, widening the "drop a binary and run it" surface that a
   seccomp/escape chain would use. CONFIRMED. Severity Low-Medium (defense-in-depth),
   Confidence High.

6. **stdout/stderr cap is 128 MiB each, buffered in worker RAM, per concurrent job.**
   `docker.rs:356`. 16 concurrent jobs × 256 MiB = 4 GiB of worker heap from output
   flooding alone, on top of the 4 MiB request body and source limits. Worker OOM = DoS
   of the whole node. CONFIRMED. Severity Medium, Confidence High.

---

## Findings by group

### A. Sandbox escape / host compromise

**A1 — Seccomp path resolved on host, profile shipped only in worker image (silent
downgrade). [High / Medium-High, CONFIRMED config gap]**
- Evidence: `docker.rs:297-299` appends `--security-opt=seccomp={path}` with the value
  `config.seccomp_profile_path`; in prod that env is `/etc/judge/seccomp-profile.json`
  (`docker-compose.production.yml:137`, `docker-compose.worker.yml:60`). The worker talks
  to the daemon over `DOCKER_HOST=tcp://docker-proxy:2375` (`...:140` / `worker.yml:64`),
  so the **daemon** opens that path on the **host**. The profile is only `COPY`d into the
  worker container (`Dockerfile.judge-worker:34`); no compose bind-mounts `/etc/judge`
  to the host, and `bootstrap-instance.sh` never writes it there.
- Why it may still "work" in dev: when the worker runs as a bare-metal process (not in a
  container) `current_dir()/docker/seccomp-profile.json` exists locally, so the daemon
  finds it. The containerized prod/worker topology is the dangerous one.
- Failure mode analysis: if the daemon can't find the file it returns an OCI create error;
  `should_retry_without_seccomp` (`docker.rs:210-212`, snippets at `13-17`) matches
  `"OCI runtime create failed"` / `"error during container init"` and `run_docker`
  refuses to retry without seccomp (`docker.rs:450-459`) — fail-closed, good. But the
  matched snippets are heuristic; a daemon that *silently* applies default seccomp (file
  present but wrong, or a Docker version whose error text differs) would run with weak
  seccomp and the worker would never know.
- Attacker payload: with default Docker seccomp, syscalls like `keyctl`, `ptrace`,
  `userfaultfd`, `unshare`/`setns` (some blocked by no-new-privs + cap-drop, but many
  reachable) re-open kernel attack surface that the custom default-deny profile was
  specifically designed to remove.
- Fix: bind-mount the host copy explicitly and assert it daemon-side. In every worker
  compose service add `- /etc/judge/seccomp-profile.json:/etc/judge/seccomp-profile.json:ro`
  *and* place the file on the host in bootstrap; OR mount the host dir and point
  `JUDGE_SECCOMP_PROFILE` at the host path. Add a startup self-test that creates a
  throwaway container with the profile and verifies (via `docker inspect` /
  `/proc/self/status` `Seccomp: 2`) that it is actually loaded. Do not rely on stderr
  snippet matching.

**A2 — docker-socket-proxy ACL allows full container creation. [Critical-if-reached /
High, CONFIRMED]**
- Evidence: `docker-compose.production.yml:69-84` and `docker-compose.worker.yml:22-43`:
  `CONTAINERS=1, POST=1, DELETE=1, ALLOW_START=1, ALLOW_STOP=1`. Socket mounted `:ro`
  (only protects the proxy, not the API). The compose comment explicitly states
  "container privilege/volume mount controls live in the runner code, not in the
  socket-proxy ACL."
- Consequence: the proxy does **not** restrict `HostConfig` (Privileged, Binds,
  CapAdd, PidMode, Devices). Any code path that can issue a `containers/create` with
  attacker-influenced HostConfig = host root. The sandbox flags in `docker.rs` are the
  only thing keeping submissions safe; they are not a *boundary*, just a *policy*.
- Reach: (a) a worker process compromise (e.g. via A1 + kernel bug) trivially escalates;
  (b) the runner HTTP API (`/run`, `/docker/build`, `/docker/pull`, `/docker/remove`)
  is authenticated by a Bearer token (`runner.rs:355-368`) but bound to `0.0.0.0:3001`
  inside the worker (`production.yml:142`, `RUNNER_HOST=0.0.0.0`) — only the compose
  publish in `worker.yml:50` pins it to `127.0.0.1`. In `production.yml` there is **no
  ports publish**, so it's reachable only on the compose network — acceptable, but the
  bind is still 0.0.0.0; a second container on that network can hit it. CONFIRMED.
- Fix: front the socket with a proxy that enforces an allowlist on `HostConfig` (e.g.
  reject any create whose body sets Privileged/Binds/CapAdd/Devices/PidMode), or move to
  a rootless / sysbox / gVisor runtime so a create is not host-root. At minimum bind the
  runner to `127.0.0.1` in production too and document that `/docker/*` admin endpoints
  must never be network-exposed.

**A3 — No user-namespace isolation. [High / High, CONFIRMED]**
- No `userns-remap`, no rootless dockerd, no `--userns` flag in `docker.rs`. uid 65534
  in-container maps to uid 65534 on host. With cap-drop=ALL + no-new-privileges this is
  fine for *normal* execution, but it removes the last layer if seccomp is bypassed (A1)
  and a kernel LPE is used. Fix: enable userns-remap on the worker daemon (it's a single
  `daemon.json` key) or adopt gVisor/Kata for the run phase.

**A4 — crun install adds no security config, just a faster runtime. [Informational]**
- `install-crun-runtime.sh` only sets `default-runtime=crun`. It downloads a pinned
  static binary over HTTPS from GitHub (`:62`) with `curl -fsSL` but **no checksum/sig
  verification** — a compromised release asset or MITM on the TLS chain would install a
  trojaned runtime that handles every sandbox. Severity Low (TLS + pin mitigates),
  Confidence High. Fix: pin and verify the sha256 of the crun binary.

**A5 — `validate_shell_command` is a denylist; `&&`, `;`, `exec` allowed. [Low / High,
CONFIRMED — by design]**
- `runner.rs:122-173`. Backticks, `$()`, `|`, redirects, newlines blocked; `&&`/`;`/`exec`
  permitted because compile/run commands are admin-owned (`language_configs` DB rows). The
  trust boundary is the admin role, and everything runs in the sandbox anyway. Not
  attacker-controlled from a submission. Acceptable, but note: the command string is the
  *only* thing between an admin-config compromise and `sh -c` in the sandbox; keep it a
  denylist of last resort, the sandbox is the real control.

### B. Cheating / isolation gaps (reading expected outputs, other test data, secrets)

**B1 — Expected outputs are NEVER exposed to submitted code. [POSITIVE — strong design]**
- `claim/route.ts:292-303` fetches `expectedOutput` into the claim payload; the worker
  holds it in `Submission.test_cases[].expected_output` (`types.rs:204-209`). Only the
  **source file and stdin** are written into the workspace (`executor.rs:337` writes
  `solution.ext`; stdin is piped via `-i`/stdin, `docker.rs:325-348`). The expected
  output is compared in `comparator.rs`, in the **worker process, outside the container**
  (`executor.rs:545-554`). A submission cannot read it from the filesystem because it was
  never placed on the filesystem. CONFIRMED. This neutralizes the classic "cat the answer
  file" cheat.

**B2 — Run phase mounts the workspace read-only and gives a fresh tempdir per submission.
[POSITIVE]**
- `docker.rs:251-255` (`:ro` when `read_only_workspace`), set true for run phase
  (`executor.rs:512`, `runner.rs:891`). Each submission gets its own `tempfile::TempDir`
  (`executor.rs:261`), chowned to 65534 and `0o700` when chown succeeds
  (`executor.rs:291-302`). So a submission cannot read another submission's in-flight
  artifacts via the workspace, and cannot leave a persistent dropper for the next job
  (tempdir is dropped/cleaned, `executor.rs:617`). CONFIRMED.

**B3 — Compile artifacts world-readable when chown fails (host-side fallback). [Low /
Medium, CONFIRMED]**
- `executor.rs:291-305`: if `chown(workspace, 65534)` fails (worker lacks CAP_CHOWN —
  which is exactly the rootless/dev case) it falls back to `0o777`. On a multi-tenant
  host another local uid could read in-flight compile output. In the documented prod
  topology (worker runs in a container with appropriate perms, `/judge-workspaces`
  identity-mapped) chown should succeed, but the fallback is silent (only a `warn!` log).
  Fix: in production refuse to run if chown fails (fail-closed) rather than degrade to
  world-readable; or always create the tempdir under a 0700 parent dir.

**B4 — Cross-submission isolation depends on `--network none` + per-submission tempdir;
AF_UNIX still allowed by seccomp. [Low / Medium, CONFIRMED — accepted in profile comment]**
- `seccomp-profile.json:2` keeps socket/bind/connect/AF_UNIX because language runtimes
  need them, relying on `--network none` for TCP isolation and the per-submission tempdir
  for AF_UNIX scoping. Within a single submission's own process tree this is fine; there
  is no shared mount/namespace bridge between concurrent sandboxes, so no cross-tenant
  AF_UNIX leak. Reasonable trade-off. Note: this only holds *if* the custom profile is
  actually applied (see A1). If A1 means default seccomp, network syscalls are also wide.

**B5 — Worker secrets / judge token not reachable from sandbox. [POSITIVE]**
- The `JUDGE_AUTH_TOKEN` / worker secret live as env in the worker process only; they are
  never written into the workspace nor passed as container env. The sandbox image gets no
  env injection from the worker (`docker.rs:257-309` sets no `-e`). CONFIRMED.

### C. Network egress

**C1 — `--network none` on every sandbox. [POSITIVE / High, CONFIRMED]**
- `docker.rs:260-261` (`--network none`) for both compile and run phases. No bridge, no
  host net, no DNS. A submission cannot reach the internet, the app DB, the worker API,
  or cloud metadata (169.254.169.254). The prewarm path also restricts memory/cpu but
  notably does **not** set `--network none` (`main.rs:267-277`) — however it runs a fixed
  trusted image with command `true`, no untrusted code, so not exploitable. CONFIRMED.
- Caveat: this is the strongest single control and again depends only on the worker code
  setting it (per A2 the proxy wouldn't stop a create without it). Keep it; consider
  enforcing "network must be none" in a HostConfig-validating proxy.

**C2 — Compile phase is also `--network none`. [POSITIVE]**
- Same code path (`docker.rs` is phase-agnostic for `--network`). So `cargo`/`npm`/`pip`
  at *compile* time cannot fetch dependencies or exfiltrate — build must be hermetic. Good
  (also prevents dependency-confusion exfil). CONFIRMED.

### D. Resource exhaustion / DoS of other contestants

**D1 — Compiler bomb: 10 min × 2 GiB × up-to-16 concurrent. [Medium-High / High,
CONFIRMED]** — see Top-risk #4. `executor.rs:13-14`, `:392-406`. memory-swap capped to
=memory at compile (`docker.rs:266-274`, a deliberate fix), pids-limit 128, cpus 1 — so a
single compile can't fork-bomb or swap-storm, but it *can* burn a full core + 2 GiB for
10 minutes. Fix: cut `COMPILATION_TIMEOUT_MS` to ~60-120 s default (per-language override
for genuinely heavy toolchains), and/or lower compile concurrency separately from run
concurrency.

**D2 — Fork bomb mitigated. [POSITIVE]** `--pids-limit 128` for both phases
(`docker.rs:249`), `--init` reaps zombies (`docker.rs:305`). 128 may be tight for some
JVM/.NET runtimes but is safe against fork bombs. CONFIRMED.

**D3 — Memory bomb mitigated. [POSITIVE]** `--memory` + `--memory-swap` equal
(`docker.rs:263-277`); OOM kill detected via cgroup/inspect (`docker.rs:142-194`) and
classified `MemoryLimit`. CONFIRMED.

**D4 — Disk fill bounded by tmpfs sizes. [Mostly POSITIVE / Low]** `/tmp` is tmpfs
(64 MiB run, 1 GiB compile, `docker.rs:9-10`). BUT the **workspace bind-mount
(`/judge-workspaces/...`) has no size quota** — at compile phase it's writable
(`read_only_workspace:false`, `executor.rs:404`). A compile command can write up to the
host disk's free space into the workspace (build artifacts). With concurrency this can
fill `/judge-workspaces` and wedge the worker/host. Severity Low-Medium, CONFIRMED. Fix:
mount `/judge-workspaces` on a size-capped filesystem or per-submission quota (XFS prjquota
/ loopback / tmpfs with size), or run compile with a tmpfs workspace too.

**D5 — Output flood buffered in worker RAM. [Medium / High, CONFIRMED]** — see Top-risk
#6. `docker.rs:356` caps each stream at 128 MiB but reads it fully into a `Vec` in the
worker before truncating semantics apply, and the drain-to-sink keeps reading past the
cap (into `/dev/null`, so bounded, good). Still 256 MiB resident per job. Fix: lower
`MAX_OUTPUT_BYTES` to a few MiB for the judge path (test outputs are tiny; the 128 MiB
matches the local compiler runner but is excessive for graded I/O).

**D6 — Wall-clock vs CPU time. [POSITIVE]** Kill timeout = problem limit +2 s overhead
(`executor.rs:501-502`); TLE classified on Docker-reported StartedAt→FinishedAt
(`docker.rs:142-194`, `executor.rs:104-121`), so container-spawn overhead doesn't cause
false TLE and an infinite loop is hard-killed. CONFIRMED.

**D7 — `MAX_TIME_LIMIT_MS` clamp + per-language multiplier capped at 50×. [POSITIVE]**
`executor.rs:26-31` (default 30 s clamp), claim route caps multiplier to [0.1, 50]
(`claim/route.ts:323`). Prevents a corrupted/huge time limit from creating an
effectively-unbounded run. CONFIRMED.

### E. Result integrity (does the app trust the worker?)

**E1 — App fully trusts worker-reported verdicts and metrics. [Medium / High, CONFIRMED
— inherent to architecture]**
- `verdict.ts:39-68` computes score purely from `result.status` strings the worker sends;
  `poll/route.ts:134-176` writes them to the DB. There is **no app-side re-comparison** of
  actual vs expected output (expected output isn't even sent back). A compromised or
  malicious worker can report `accepted` for anything. This is acceptable *if* workers are
  trusted infrastructure, which they are here — but it means **worker compromise == grade
  forgery for all submissions routed to it**, in addition to host risk. Defense: per-worker
  secret auth is enforced (`auth.ts:52-97`, `claim/route.ts:160-167`) and the claim token
  is checked on report (`poll/route.ts:154`), so an *external* party can't forge results
  without the worker secret. The residual risk is a worker that is itself popped (tie-in
  to A1/A2). Fix (defense-in-depth): for high-stakes contests, randomly re-judge a sample
  on an independent worker and diff verdicts; sign result reports with a per-worker key and
  store the signature for audit.

**E2 — Memory/time are worker-measured and clamped, not spoof-proof. [Low / Medium]**
`reported_memory_used_kb` clamps peak to the submission limit (`executor.rs:42-53`) and
time is daemon-reported, so a submission cannot *inflate* its own reported usage beyond the
limit, and cannot easily *deflate* runtime (it's measured by Docker, not the program).
Spoofing would require worker compromise (→E1). Acceptable.

**E3 — Input/source size limits enforced before disk write. [POSITIVE]**
`runner.rs:666-685` (64 KB source/stdin on runner path), `executor.rs:32`/`:323` (256 KB
source on judge path), `MAX_RUNNER_BODY_BYTES=4 MiB` (`runner.rs:27`,
`DefaultBodyLimit`, `:929`). CONFIRMED.

---

## Existing hardening (honest credit)

- `--network none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`
  rootfs, `--user 65534:65534`, `--pids-limit 128`, `--memory`+equal `--memory-swap`,
  `--cpus 1`, `--ulimit nofile=1024`, `--init` — all set per sandbox (`docker.rs:257-309`).
- Custom default-deny seccomp profile (`SCMP_ACT_ERRNO` default), blocking `clone3`,
  and an allowlist that omits `ptrace`, `mount`, `pivot_root`, `keyctl`, `bpf`,
  `add_key`, `init_module`, `kexec_load`, etc. (`seccomp-profile.json`). Compile phase now
  uses the custom profile by default (`docker.rs:220-227`); opting out is an explicit env.
- Run phase mounts workspace `:ro`; expected outputs never enter the sandbox; comparison
  is out-of-band — eliminates the most common OJ cheat.
- Per-submission ephemeral tempdir, chowned + 0700 on success, auto-cleaned.
- Fail-closed seccomp: refuses to retry without the custom profile on init failure
  (`docker.rs:450-459`); startup errors if profile missing and seccomp not disabled
  (`main.rs:189-194`).
- All 102 `Dockerfile.judge-*` declare a non-root `judge` USER and use pinned base image
  tags (e.g. `alpine:3.21`, `python:3.14-alpine`, `rust:1.94.0-slim-bookworm`,
  `golang:1.26.1-alpine`); the runtime `--user 65534` overrides regardless.
- Constant-time token comparison on runner auth (`runner.rs:371-380`) and per-worker
  hashed secrets server-side (`auth.ts`).
- Docker-socket access is via socket-proxy (not raw socket) with `BUILD=0`; image-build
  is off the worker path.
- Output/source/stdin/body size caps; docker-image reference validated to the `judge-*`
  namespace (`validation.rs:1-49`) so submissions can't pull arbitrary images.
- Idle-poll backoff, orphaned-container cleanup (`docker.rs:526-554`), dead-letter
  persistence — operational robustness that limits stuck-judging DoS.

---

## Priority-ranked hardening checklist (mapped to files/flags)

1. **(High) Make seccomp provably applied in the containerized topology.** Bind-mount the
   profile to the host and verify daemon-side. Edit `docker-compose.production.yml`
   (judge-worker service, ~line 130) and `docker-compose.worker.yml` (~line 51) to add
   `- /etc/judge/seccomp-profile.json:/etc/judge/seccomp-profile.json:ro` AND have
   `bootstrap-instance.sh` install the profile to the host `/etc/judge/`. Add a worker
   startup self-test that runs a probe container with the profile and asserts
   `Seccomp: 2` in `/proc/self/status`. Don't rely on `should_retry_without_seccomp`
   stderr matching (`docker.rs:210-212`).
2. **(Critical-if-reached) Constrain the socket-proxy / runtime so a `create` can't be
   host-root.** Replace tecnativa proxy with one that validates `HostConfig`
   (deny Privileged/Binds/CapAdd/Devices/PidMode and require `NetworkMode=none`), or adopt
   gVisor/Kata/sysbox for the run phase. `docker-compose.*.yml` docker-proxy service.
3. **(High) Enable userns-remap (or rootless dockerd) on worker hosts.** One key in
   `/etc/docker/daemon.json`; extend `install-crun-runtime.sh` to set it.
4. **(High) Bind the runner HTTP server to 127.0.0.1 in production**
   (`docker-compose.production.yml:142` sets `RUNNER_HOST=0.0.0.0`; change to 127.0.0.1
   or keep it off the shared compose network) and document `/docker/*` as
   never-network-exposed.
5. **(Medium-High) Cut compile resource ceilings.** `executor.rs:13-14`: drop
   `COMPILATION_TIMEOUT_MS` to ~90 s default with per-language overrides; consider a
   separate, lower compile concurrency cap.
6. **(Medium) Lower judge-path output cap.** `docker.rs:356` `MAX_OUTPUT_BYTES` — a few
   MiB for graded I/O instead of 128 MiB; bounds worker RAM under concurrency.
7. **(Medium) Quota / size-cap the writable workspace.** `/judge-workspaces` on XFS
   prjquota or per-submission tmpfs; the compile phase workspace is currently unbounded
   on host disk (`executor.rs:404` writable mount, no quota).
8. **(Low-Medium) Fail closed on chown failure in production.** `executor.rs:291-305`:
   don't silently fall back to `0o777`; gate the fallback behind a dev-only flag.
9. **(Low-Medium) Re-enable `noexec /tmp` for the 7 `needs_exec_tmp` languages where
   possible**, or document precisely which runtimes require it; `docker.rs:10,284`,
   `languages.rs` (7 entries).
10. **(Low) Verify the crun binary checksum** in `install-crun-runtime.sh:62-69`.
11. **(Defense-in-depth) For high-stakes contests, independently re-judge a random sample
    and/or sign result reports per-worker** — mitigates the full-trust verdict model
    (`verdict.ts`, `poll/route.ts`).

---

## Suggested live PoCs to confirm SUSPECTED items (run on a disposable worker)

- A1: submit any program; `docker inspect` the resulting `oj-*` container (or have the
  program read `/proc/self/status` and print `Seccomp:` / `Seccomp_filters:` — but note
  stdout cap). If `Seccomp: 0`, the custom profile is not applied. Also try a syscall the
  custom profile blocks but default allows (e.g. `ptrace(PTRACE_TRACEME)`) and observe
  ENOSYS/EPERM vs success.
- A3: from inside a sandbox, read `/proc/self/uid_map`; a 1:1 map to a real host uid (no
  userns offset) confirms no remap.
- D4: a compile command that `dd if=/dev/zero of=/workspace/big bs=1M count=4096` and
  observe host `/judge-workspaces` free space.
- D5: a run that prints >128 MiB and watch worker RSS.
