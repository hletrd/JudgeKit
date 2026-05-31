# Judge worker: gVisor (runsc) sandbox runtime

_Status: enabling code shipped, **disabled by default**. Production rollout is
gated on the disposable-worker validation below._

## Why

Judged code is already locked down (`--network none`, `--cap-drop=ALL`,
`--read-only`, non-root, pids/memory limits, `--no-new-privileges`, and a custom
default-deny seccomp profile). The residual risk (see
`.context/reviews/personas-2026-05-30/_WAVE4-sandbox-verification-2026-05-31.md`
and `docs/threat-model.md`) is that the worker reaches the Docker daemon through
`tecnativa/docker-socket-proxy`, which does **not** validate `HostConfig`. If the
worker process itself were ever compromised — or a container escaped to it — the
boundary to the host kernel is `runc` + seccomp.

gVisor's `runsc` runtime intercepts container syscalls in a user-space kernel, so
a container/kernel escape lands in gVisor rather than the host kernel. It is
defense in depth **under** the existing controls, not a replacement for them.

## How it is wired

- `JUDGE_OCI_RUNTIME` (worker env). Unset/empty → the Docker daemon default
  (`runc`); current behavior, no change. Set to `runsc` → the worker adds
  `--runtime=runsc` to every judged `docker run` (`judge-worker-rs/src/docker.rs`,
  `oci_runtime()`).
- The runtime must exist on the **host docker daemon**, not in the worker
  container: judged containers are spawned on the host via the socket-proxy.
  `scripts/install-gvisor.sh` installs + registers it there.
- The custom seccomp profile (`--security-opt=seccomp=…`) is still passed; under
  gVisor the profile is applied by gVisor's sandbox. **Confirm this empirically**
  during validation (step 2) — do not assume it behaves identically to runc.

## Install (on a disposable worker first)

```bash
sudo scripts/install-gvisor.sh          # latest gVisor release
# or pin:  sudo GVISOR_RELEASE=YYYYMMDD scripts/install-gvisor.sh
```

The script checksum-verifies the `runsc` binary, backs up `/etc/docker/daemon.json`,
runs `runsc install`, reloads docker, and smoke-tests `docker run --runtime=runsc`.

## Validation protocol (MUST pass before production)

Stand up a **disposable worker** (throwaway host/VM you can break), install
gVisor, set `JUDGE_OCI_RUNTIME=runsc`, restart the worker, and verify:

1. **Judge correctness across the language matrix.** Run a known submission set
   (AC / WA / TLE / MLE / RE / CE) for every supported language and assert the
   verdicts match a `runc` baseline. gVisor's syscall coverage is broad but not
   total — compiled languages, JIT/VM runtimes (JVM, .NET, BEAM), and anything
   doing exotic syscalls are the likely break points.
2. **Custom seccomp still enforced.** Repeat the Wave-4 probe under `runsc`:
   confirm a denied syscall (e.g. `ptrace`, `mount`, `keyctl`) is still rejected,
   and that a normal judged run is unaffected. Record the result — gVisor + a
   client-supplied seccomp profile is the interaction most likely to surprise.
3. **Performance overhead.** Measure judge wall-clock and peak memory for
   representative problems (tight-loop CPU, heavy I/O, large allocation, threaded
   VM languages) vs the `runc` baseline. gVisor adds syscall-interception
   overhead; quantify it and decide whether time/memory limits need adjusting so
   legitimate solutions don't start TLE/MLE-ing. **This is the most common reason
   to not roll out** — a 1.5–2× syscall-heavy slowdown can fail honest solutions.
4. **Edge cases.** Compiler-bomb limits (`JUDGE_COMPILE_*`), output cap
   (`JUDGE_MAX_OUTPUT_BYTES`), `/proc` and `/tmp` behavior, and OOM accounting all
   still behave (gVisor reports cgroup/OOM differently — verify MLE detection).
5. **Soak.** Run the worker under load for a sustained period; watch for leaked
   `runsc` sandbox processes or fd/memory growth on the host.

## Go / no-go

Roll out to production **only if**: verdicts match the runc baseline across all
languages (step 1), the custom seccomp is still enforced (step 2), and the
measured overhead (step 3) keeps legitimate solutions within limits (adjust
limits first if needed, then re-validate). Otherwise keep `runc` and revisit —
gVisor correctness/perf for a competitive-programming judge is workload-specific.

## Rollback

Unset `JUDGE_OCI_RUNTIME` (or set it empty) and restart the worker — judged
containers immediately revert to `runc`. No image rebuild required. To remove the
runtime entirely, restore the `daemon.json` backup the install script made and
reload docker.

## Alternatives considered

- **userns-remap** (host daemon): lighter-weight (container-uid-0 ≠ host-uid-0)
  but re-maps all containers and can break volume ownership; soak-test separately.
- **Validating socket-proxy**: reject `--privileged` / host bind-mounts / host
  PID/net at the API layer (tecnativa cannot; needs a custom/alternative proxy).
  Narrower blast-radius reduction than a stronger runtime.
