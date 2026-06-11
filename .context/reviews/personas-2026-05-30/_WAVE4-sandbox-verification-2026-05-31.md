# Wave 4 — Sandbox infra hardening: VERIFIED assessment (2026-05-31)

Follow-up to the two highest-severity items in `security-sandbox-perspective.md`.
Investigated against the real production worker (`worker-0.algo.xylolabs.com`)
with read-only probes. Conclusion: **the scariest finding is a false positive;
the other two are architectural decisions, not blind-fixable config tweaks.**

---

## 1. "Likely silent seccomp bypass" (was: High, SUSPECTED) → ❌ FALSE POSITIVE

**Claim:** containers launch via `DOCKER_HOST=tcp://docker-proxy:2375`, so
`--security-opt=seccomp=/etc/judge/seccomp-profile.json` resolves on the *host*
filesystem (where `/etc/judge` doesn't exist), so the default-deny profile isn't
applied.

**Reality (verified, empirical + code):**
- The worker shells out to the `docker` CLI (`docker.rs:317`). The CLI form
  `--security-opt seccomp=<file>` reads the file **client-side** (in the worker
  container) and transmits the profile *content* to the daemon. `DOCKER_HOST`
  being a tcp daemon does **not** change this.
- The profile **exists in the worker container** at `/etc/judge/seccomp-profile.json`
  (6692 bytes; baked in by `Dockerfile.judge-worker:34`), so the client read
  succeeds.
- **Empirical proof on the prod worker:** running the worker's exact invocation
  (`--security-opt=seccomp=/etc/judge/seccomp-profile.json`) on a probe container
  **changed behavior** — the daemon enforced the profile and denied `capset`
  during container init (`OCI runtime create failed: capset: Operation not
  permitted`). The same container under Docker's *default* seccomp behaved
  differently. If the custom profile were silently not applied, both runs would
  be identical. They weren't → **the custom default-deny profile IS enforced on
  judged containers.** (The `capset` error is only because the probe omitted
  `--cap-drop=ALL`; real judge runs include it, which is why prod judging works.)
- The profile itself is a real default-deny: `defaultAction: SCMP_ACT_ERRNO`,
  255 allowed syscalls, denying ptrace/mount/keyctl/clone3/unshare/getcpu/bpf.

**Action: none.** Do NOT bind-mount the profile to the host or otherwise "fix"
this — it is working as intended, and changing it risks breaking it. This is the
key result of Wave 4: it prevents shipping a wrong/harmful change.

---

## 2. docker-socket-proxy = full container-create (Critical-IF-reached) → 🟠 REAL, architectural

**Confirmed:** the worker's `judgekit-worker-docker-proxy` runs with
`CONTAINERS=1, IMAGES=1, POST=1, DELETE=1, ALLOW_START=1, ALLOW_STOP=1`
(`docker-compose.production.yml`). tecnativa/docker-socket-proxy does **not**
validate `HostConfig`, so a worker that could craft API calls can create a
`--privileged` / `-v /:/host` container = host root.

**Why it's not a simple fix:** the worker *fundamentally needs* container
create/start/delete to run and clean up judge containers — those permissions
can't just be turned off (they were, once, and every `docker run` 403'd and got
mis-recorded as `compile_error`; the compose comment documents this).

**Residual-risk reality / mitigations already present:**
- The proxy is only reachable on the worker's compose network — not exposed
  externally. The attack requires compromising the **worker process itself**
  (RCE in the Rust worker / runner API), not just submitting malicious code.
- Judged code is sandboxed (`--network none`, `--cap-drop=ALL`, `--read-only`,
  non-root, pids/mem limits, **and the now-confirmed default-deny seccomp**), so
  escaping to the worker process is hard.

**Proper remediation (needs your decision — an infra project, not a tweak):**
- Strongest: run judged containers under a stronger runtime (gVisor/`runsc`,
  Sysbox, or Kata) so a container escape doesn't reach the host kernel/socket.
- Or: replace the proxy with one that validates/denies `HostConfig` (privileged,
  host bind-mounts, host PID/net) — tecnativa can't do this.
- Either must be validated on a **disposable worker** before prod.

---

## 3. No user-namespace remap (High) → 🟠 REAL hardening, risky to apply blind

**Confirmed:** in-container uid 65534 maps to real host uid 65534; there is no
`userns-remap`. With #1 confirmed working, seccomp + cap-drop are the kernel
boundary; userns-remap would add defense-in-depth (a container-uid-0, if ever
reached, wouldn't be host-uid-0).

**Why not blind-applied:** `userns-remap` is a host dockerd daemon setting
(`/etc/docker/daemon.json`) that re-maps all containers and can break existing
volume ownership and some images. It must be enabled + soak-tested on a
**disposable worker**, then rolled out — not pushed to prod without validation.

---

## Bottom line for Wave 4

- **#1 (seccomp): resolved — false positive, verified. No change.**
- **#2 (socket-proxy) and #3 (userns): real residual risks that require an
  architectural choice (stronger runtime / validating proxy / userns-remap) and
  disposable-worker validation — NOT a config edit to push to prod blind.**

Recommended next step if you want to act on #2/#3: stand up a throwaway worker
host, evaluate Sysbox or gVisor for the judge run-phase (and userns-remap), and
measure judge correctness + overhead before changing the production worker.
