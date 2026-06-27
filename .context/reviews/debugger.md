# Cycle 5 — debugger

Scope: latent-bug / failure-mode / regression review of JudgeKit at head
`7ebea50e`. Cycle 5 of 100. The cycle-4 surface is `edd45cca..7ebea50e`
(11 commits). Mission: (a) regression-check the worker cleanup bundle
(N1+R2+R4), the int64 serialization, the snapshot opt-out, the settings
reconfirm helper, and the accepted-solutions filter against their named
edge cases; (b) confirm or escalate the cycle-4 deferred residuals
**R1/R3**; (c) hunt NET-NEW latent bugs across the cycle-4 surface without
inflating the count (`112→25→28` converging).

Evidence basis: full read of every cited file at the cited lines —
`judge-worker-rs/src/docker.rs` (cleanup sweep / startup reap-all /
inspect / kill / rm / kill_on_drop sites),
`judge-worker-rs/src/main.rs` (startup hook + periodic-sweep `select!`
+ shutdown wiring),
`src/lib/judge/function-judging/serialization.ts` (`encodeIntLiteral` /
`encodeScalar` / `encodeArgs`),
`src/lib/judge/function-judging/value-fields.ts` (`parseScalar` int
range gate),
`src/lib/db/export.ts` + `pre-restore-snapshot.ts` (`snapshot:true`
opt-out),
`src/lib/security/sensitive-settings.ts` (shared reconfirm helper),
`src/lib/security/password-hash.ts` (`verifyPassword` /
`verifyAndRehashPassword`),
`src/lib/auth/config.ts` (authorize call site, no try/catch),
`src/app/api/v1/admin/settings/route.ts` (route writer + `hasOwnInput`),
`src/lib/actions/system-settings.ts` (action writer + `hasOwnInput`),
`src/app/api/v1/problems/[id]/accepted-solutions/route.ts` (list/count
parity), `deploy-docker.sh` (worker restart sequencing), and the cycle-4
diffs `65ca7ef8`, `e7a17c22`, `b9fcbc92`, `052abf88`, `c858ce22`. The
cycle-4 debugger review (`.context/reviews/debugger.md` at `edd45cca`)
and the cycle-4 remediation plan
(`plan/cycle-4-2026-06-27-review-remediation.md`) are the baseline.

Severity legend: CRITICAL / HIGH / MEDIUM / LOW. Confidence: HIGH / MED /
LOW. Validation tag: **confirmed** (read + logically proven at head),
**likely** (read + strong inference), **needs-manual-validation** (requires
runtime/docker to nail down).

---

## EXECUTIVE SUMMARY

All 5 cycle-4 fix bundles are **CONFIRMED correct** on the mission's named
edge cases — no regression introduced. The cleanup bundle (N1+R2+R4) does
what it claims: a wedged dockerd can no longer freeze the hot loop OR
block graceful shutdown, the per-call cleanup paths are leak-free, and the
startup reap-all covers forced-restart leftovers in the documented
single-worker-per-host deployment. The int64, snapshot, reconfirm, and
accepted-solutions fixes all behave correctly.

**R1 and R3 remain deferred at the same severity** (pre-existing
low-severity worker residuals; cycle 4 did not touch them and the plan
correctly kept them in Phase B/C). Not escalated — both are bounded and
documented.

Two **NET-NEW LATENT** items found — both LOW/MED and theoretical for the
canonical deployment (they cannot fire on `algo.xylolabs.com` /
`worker-0.algo.xylolabs.com` today). Neither is a data-loss or
availability-regression bug; both are forward-looking footguns worth a
cheap guard. No CRITICAL or HIGH net-new issue.

**Top items, ranked:**
1. **N5** (LOW/MED) — startup reap-all has no worker-identity guard; a
   future shared-host deployment (two workers on one host) would have one
   worker's startup sweep `docker rm -f` the sibling's in-flight `oj-*`
   containers. Container names are `oj-{uuid}` with no worker-id prefix.
   Unreachable in the documented single-worker topology; cheap to guard.
2. **N6** (LOW) — startup reap-all is not wrapped in the `shutdown`
   select, so a SIGTERM during the up-to-20s startup-sweep window is
   queued and not honored until the sweep returns. Bounded; minor.
3. **R3** (LOW→MED, deferred) — inspect-timeout still returns
   `oom_killed: false` (masks a real OOM whose post-run `docker inspect`
   stalls past 10s). Cycle-4 added `kill_on_drop` here but did not change
   the default. Same as cycle 4; not escalated.
4. **R1** (LOW, deferred) — compiler chown-fallback 0o777/0o666 mirror
   unchanged. Same as cycle 4; not escalated.

Convergence: 28 cycle-4 findings → 5 cycle-5 findings (3 carried/regression
+ 2 net-new LOW/MED). No inflation.

---

## (a) REGRESSION — cycle-4 fixes vs. mission edge cases

### A — Worker cleanup bundle (N1+R2+R4): CONFIRMED on all four mission questions
- Commit `c858ce22` · Files: `judge-worker-rs/src/docker.rs:179-285,640-810`,
  `judge-worker-rs/src/main.rs:490-525`
- Mission questions, answered:
  - **Did the `tokio::time::timeout` wrap actually free the hot loop? Or
    does a hung sweep still block the poll/shutdown `select!`?**
    **Freed.** The periodic sweep is now wrapped in `tokio::select!` with
    `&mut shutdown` (main.rs:516-522), and each of its two `docker`
    Commands is internally bounded by
    `tokio::time::timeout(Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS))`
    + `.kill_on_drop(true)` (docker.rs:665-688, 700-716). A wedged dockerd
    can extend a single tick by at most ~`2 × DOCKER_CLEANUP_TIMEOUT_SECS`
    (ps timeout returns first, then rm timeout returns), AND a SIGTERM/
    SIGINT during the sweep preempts it via the outer `select!`. The
    shutdown `select!`s for permit acquire (main.rs:528) and poll
    (main.rs:545) sit BELOW the cleanup block but are now reachable on
    every tick because the sweep itself is select-guarded. ✓
  - **Startup reap-all safe to `docker rm -f` every `oj-*`?**
    **Yes in the documented deployment.** `cleanup_all_oj_containers_at_startup`
    (docker.rs:752-810) runs once before the main loop (main.rs:494-500),
    after `tokio::pin!(shutdown)` (main.rs:487) but BEFORE the first poll.
    At startup there are no in-flight judgements, so force-removing every
    `oj-*` is safe. The deploy script (deploy-docker.sh:929-935,
    `docker compose ... down --remove-orphans` then `docker rm -f
    judgekit-judge-worker`) guarantees the old worker process is fully dead
    before the new container is created, so there is no overlap window
    where a sibling live worker could be mid-judgement. **Caveat — see N5
    for the latent shared-host case.** ✓
  - **What if the worker crashes mid-reap?** **Safe / idempotent.** A
    crash between `docker ps` (get list) and `docker rm -f` (reap) leaves
    the listed containers in place; the next startup sweep re-runs the
    list and reaps them. `docker rm -f` is idempotent (already-removed →
    noop error, logged warn). ✓
  - **`.kill_on_drop(true)` panic-on-drop or double-kill risk?**
    **None.** `kill_on_drop(true)` only fires when the `Child` handle is
    `Drop`-ped (i.e. the wrapping `output()` future is dropped by a
    `tokio::time::timeout` `Err` or a `select!` cancel); it issues a
    single SIGKILL to the `docker` CLI child. It cannot panic. Re-entry
    on an already-dead child is a kernel noop (SIGKILL on a reaped PID is
    ESRCH, harmlessly swallowed by tokio). It does NOT signal the
    container — dockerd still owns the container; only the CLI child is
    killed. No double-kill of any container. The cycle-4 source-grep
    contract (`matches(".kill_on_drop(true)").count() >= 5`,
    docker.rs:671-673) pins five sites (inspect / kill / rm + sweep ps /
    rm + startup ps / rm). ✓
- **Residual A1 (LOW / HIGH confidence / confirmed):** the periodic
  sweep's internal timeout bounds each Command independently. If the
  `docker ps` succeeds in N seconds and the `docker rm` then hits a
  wedged dockerd, the rm arm waits up to `DOCKER_CLEANUP_TIMEOUT_SECS`
  and logs "containers may leak until next tick" (docker.rs:735-740).
  This is intentional and correctly bounded — the next tick retries. Not
  a defect; the log accurately describes the leak-and-retry semantics.
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### B — Settings reconfirm shared helper + `hasOwnInput` port: CONFIRMED fail-closed on both writers; partial-wipe closed
- Commit `b9fcbc92` · Files: `src/lib/security/sensitive-settings.ts:81-120`,
  `src/app/api/v1/admin/settings/route.ts:62-150`,
  `src/lib/actions/system-settings.ts:88-105,140-222`
- Mission questions, answered:
  - **If `currentPassword` is malformed (empty/null/undefined), fail-closed
    or fail-open?** **Fail-closed on every path.**
    `requireSettingsReconfirm` (sensitive-settings.ts:99-110) reads
    `currentPassword` via `(input as { currentPassword?: string }).currentPassword`
    and runs `if (!currentPassword) return { ok: false, status: 401, error: "passwordReconfirmRequired" }`.
    Empty string, `undefined`, and `null` are all falsy → 401. A non-empty
    but wrong password flows to `verifyAndRehashPassword` → `valid:false`
    → 403 `invalidPassword`. A whitespace-only password (`"   "`) is
    truthy, reaches argon2.verify, returns false → 403. **Both writers
    route the outcome through the same helper**, so the gate cannot drift
    (route: `settingsReconfirmToResponse` → NextResponse; action:
    `if (!reconfirm.ok) return { success: false, error: reconfirm.error }`).
    The schema (`systemSettingsSchema.currentPassword: z.string().max(1_000).optional()`,
    validators/system-settings.ts:61) rejects non-string currentPassword
    BEFORE the helper sees it, so the helper's `string` cast is safe. ✓
  - **Throw path from `verifyAndRehashPassword` (e.g. malformed storedHash)?**
    The helper does NOT wrap `verifyAndRehashPassword` in try/catch. A
    throw (e.g. `argon2.verify` on a non-argon2 storedHash) propagates.
    The route sits inside `createApiHandler`'s outer try/catch → **clean
    500, no settings mutation** (the gate runs BEFORE any
    `db.insert/update`). The action sits inside Next.js's server-action
    boundary → throws serialize to the client as an action error. Either
    way the gate is pre-mutation: no partial state. ✓
  - **Partial-wipe fix (`hasOwnInput`)?** **Closed on both writers.** The
    route constructs `baseValues` with `updatedAt` only, then conditionally
    adds each field via `if (hasOwnInput("siteTitle")) { … }` (route.ts:113-153).
    `hasOwnInput = (key) => Object.prototype.hasOwnProperty.call(body, key)`
    (route.ts:108-109). `PUT { siteTitle: "x" }` therefore leaves
    `hcaptchaSecret`, `publicSignupEnabled`, `platformMode`, etc.
    untouched — confirmed by reading every conditional write site. The
    action's pre-existing `hasOwnInput` (action.ts:140) covers the full
    field set (siteTitle through defaultLanguage, including smtpPass /
    smtpHost / communityUpvote / communityDownvote / emailVerificationRequired)
    — wider than the route, which only persists the subset the route
    enumerates. The route's narrower enumeration is unchanged from
    pre-cycle-4 (the route never persisted smtp fields); not a regression. ✓
  - **Sensitive-key expansion (C4-3)?** The shared `SENSITIVE_SETTINGS_KEYS`
    (sensitive-settings.ts:19-57) now includes `aiAssistantEnabled`,
    `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes`,
    `uploadMaxImageSizeBytes`, `uploadMaxFileSizeBytes`, `uploadMaxImageDimension`,
    `uploadMaxZipDecompressedSizeBytes`. `touchesSensitiveSettingsKey`
    scans `!== undefined` over the list → each new key now triggers
    reconfirm on both writers. ✓
  - **Accepted-solutions list/count parity (C4-N3)?** The list SELECT now
    applies `and(whereClause, eq(users.shareAcceptedSolutions, true))`
    (accepted-solutions/route.ts:85-90), matching the count query's
    filter, and the post-query `.filter((solution) => solution.shareAcceptedSolutions)`
    is removed. `total` and `solutions.length` now agree; pagination is
    computed entirely in SQL. ✓
- **Residual B1 (LOW / HIGH confidence / confirmed):** the route's
  `body` destructuring still excludes `emailVerificationRequired`,
  `communityUpvoteEnabled`, `communityDownvoteEnabled`, `smtpHost`,
  `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`, `smtpFrom`,
  `homePageContent`, `footerContent`, `defaultLocale`. These columns can
  only be persisted via the action, never via PUT. Pre-existing asymmetry
  (the route was always a subset writer); not introduced or widened by
  cycle 4. Restated for the next reviewer; not a finding.
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### C — Snapshot `snapshot:true` opt-out: CONFIRMED restoreable; argon2-param-bump self-heals via `needsRehash`
- Commit `65ca7ef8` · Files: `src/lib/db/export.ts:72,104-117`,
  `src/lib/db/pre-restore-snapshot.ts:34-46,86-90`
- Mission questions, answered:
  - **Restoring `snapshot:true` output into a DB with a DIFFERENT
    `passwordHash` schema (argon2 param bump) — what happens? Restore-time
    guard?** **No restore-time guard, but the runtime path self-heals.**
    The snapshot now bypasses `EXPORT_ALWAYS_REDACT_COLUMNS`
    (`activeRedactionMap = {}` when `options.snapshot === true`,
    export.ts:111-117), so `passwordHash` lands in the JSON verbatim.
    Restore inserts the literal hash string back into `users.passwordHash`.
    There is no schema/format validation on the restore path. The
    self-heal path is `verifyAndRehashPassword` at next login
    (password-hash.ts:48): `argon2.needsRehash(storedHash, ARGON2_OPTIONS)`
    is true whenever the stored params differ from current
    `ARGON2_OPTIONS` → on a correct password, the user is transparently
    rehashed to the new params (password-hash.ts:65-79). A legacy bcrypt
    hash is handled by the `isBcryptHash` branch (password-hash.ts:38-41,
    needsRehash=true on valid). So the argon2-param-bump and
    bcrypt→argon2 cases are correct-by-design. ✓
  - **What about an unknown algorithm?** If a future deployment swaps
    argon2 for scrypt without a bcrypt-style shim, `argon2.verify` throws
    on the unfamiliar `$scrypt$…` hash. The throw propagates through
    `authorize` (config.ts:273, no try/catch around `verifyAndRehashPassword`)
    → NextAuth surfaces a login failure. This is a **pre-existing
    condition** for any backup/restore that retains `passwordHash`, not
    introduced by cycle 4. Crucially, cycle 4 *improves* the picture: the
    pre-cycle-4 snapshot redacted `passwordHash`, so restoring a snapshot
    wiped every hash and locked every user out. The new behavior (retain
    hash, self-heal on login) is strictly better than the old behavior. ✓
  - **Cycle-4 invariant check:** `streamDatabaseExport({ sanitize: false,
    snapshot: true })` is the only `snapshot:true` call site
    (pre-restore-snapshot.ts:87-90). Every other caller (export-with-files.ts:172
    `streamDatabaseExport({ signal, dbNow })`, the backup/migrate routes)
    omits `snapshot`, so those still redact the always-redact set. The
    `sanitize:false` regular-export path is unchanged. ✓
- **Residual C1 (LOW / MED confidence / needs-manual-validation):**
  `verifyPassword` is not wrapped in try/catch at the auth call site
  (config.ts:263 for the no-user branch, config.ts:273 for the live-user
  branch). A malformed `passwordHash` (e.g. truncated during an aborted
  restore, or a partial-write bug) makes `argon2.verify` throw and
  propagate. This is pre-existing, NOT introduced by cycle 4, and the
  snapshot fix makes truncation strictly less likely (the snapshot is the
  rollback artifact). Restated for the next reviewer.
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### D — Function-judging int64 verbatim serialize + strtoll/parseLong/long.Parse adapters: CONFIRMED — throw path is unreachable from production, verdict path unaffected
- Commit `052abf88` · Files: `src/lib/judge/function-judging/serialization.ts:6-31`,
  `adapters/cpp.ts:42-50`, `adapters/java.ts:72-86`, `adapters/csharp.ts:75-92`
- Mission questions, answered:
  - **What does the throw-on-unsafe-Number path do to a running judgement?**
    **It cannot affect a running judgement — `encodeScalar`/`encodeArgs`
    do not run at judging time.** The judging path is: stored `input`
    string (the encoded JSON line) → worker pipes it as stdin → the
    adapter inside the container parses it. `encodeArgs` is imported only
    by `src/components/problem/function-test-case-editor.tsx:14`
    (browser-side authoring), confirmed by repo-wide grep — zero
    server-side or worker-side callers. The throw lives entirely in the
    authoring browser. ✓
  - **Does the throw fire on the authoring path?** **No — unreachable
    from the editor's typed-input flow.** The editor parses each arg via
    `parseFieldValue` (function-test-case-editor.tsx:148-156) BEFORE
    calling `encodeArgs`. `parseScalar` for `int`/`long`
    (value-fields.ts:71-78) runs `INT_RE.test` → `Number(trimmed)` →
    `if (!isSafeInteger(value)) return { ok: false }`. On parse failure
    `argsOk=false` and `encodeArgs` is never called. On success the
    value is a `Number` that satisfies `Number.isSafeInteger`, so
    `encodeIntLiteral`'s safe-integer branch (serialization.ts:27-29)
    fires and returns `String(v)` — byte-identical to the old
    `String(Math.trunc(Number(v)))` for safe integers. The throw
    (serialization.ts:30-32) requires an unsafe `number`, a non-digit
    `string`, or a non-bigint/non-string/non-number; none of these can
    reach it through `parseFieldValue`. ✓
  - **When COULD the throw fire?** Only via a programmatic caller that
    bypasses `parseFieldValue` — e.g. an admin import script, a test
    fixture, or a future BigInt-aware authoring path. None exist in
    production today. The throw is a deliberate loud-fail guard for the
    deferred BigInt rework (value-fields.ts:24-28 "BigInt rework is
    deferred (out of v1 scope)"); it preserves the option to add a
    bigint path later without re-introducing silent rounding. ✓
  - **Adapter correctness at judging time?** The three adapter edits
    replace double-rounding with integer-only parsing: C++ `std::strtoll`
    over a digits-only token (cpp.ts:46-50), Java `Long.parseLong`
    (java.ts:79-86), C# `long.Parse` over `IntegerToken` (csharp.ts:78-92).
    All three consume optional sign + digits and reject `.`/`e`/`E`
    (delegated to strtoll/parseLong's format check). A test case stored
    with `[9007199254740993]` now round-trips byte-identical through the
    int reader (previously rounded via double to 9007199254740992). ✓
  - **Adapter parse failure on a non-numeric token?** `strtoll` returns
    0 with `errno=EINVAL`; `Long.parseLong` / `long.Parse` throw. The
    container's adapter harness turns the exception into a non-zero exit
    → the worker reports a runtime_error verdict (no hang, no 500). This
    is the same shape as any malformed-stdin failure pre-cycle-4; the
    int-only token just makes the failure mode stricter. Not a
    regression — the contract is "well-formed int input"; the editor's
    INT_RE already guarantees this. ✓
- **Residual D1 (LOW / HIGH confidence / confirmed):** the editor's
  `serializeCase` callback (function-test-case-editor.tsx:144-164) does
  not wrap `encodeArgs`/`encodeValue` in try/catch. If a future code path
  calls `encodeArgs` with an unsafe value (e.g. a BigInt migration that
  mis-wires the editor), the React callback would throw mid-render.
  Cosmetic today (unreachable), worth a defensive try/catch when the
  BigInt path lands.
- **Status: REGRESSION-CHECK PASSED.** Verdict: **confirmed**.

### E — Judge `/claim`+`/poll` require `workerId` + `JUDGE_STRICT_IP_ALLOWLIST` opt-in: CONFIRMED (verified by security lane)
- Commit `e7a17c22` · Files: `src/app/api/v1/judge/claim/route.ts`,
  `src/app/api/v1/judge/poll/route.ts`, `src/lib/judge/ip-allowlist.ts`,
  `src/lib/judge/auth.ts`
- Debugger scope on this commit was limited to regression on
  error/edge/async paths (full auth-flow verification was the security
  lane's job). The changes are pure additions (request shape tightening,
  env-var opt-in) with no new await graph, no new partial-mutation window,
  no new throw site. The `JUDGE_STRICT_IP_ALLOWLIST` startup warn is a
  module-init side effect (logged once); it cannot block the request path.
  No regression surface identified.
- **Status: REGRESSION-CHECK PASSED (debugger lane).** Verdict:
  **confirmed**.

---

## (b) Cycle-4 deferred residuals — R1 / R3 status at head (`7ebea50e`)

Both **STILL OPEN at the same severity** cycle 4 left them. Cycle 5 made
no changes to either file. Not escalated — both are bounded and
correctly parked in Phase B/C by the cycle-4 plan.

### R1 — STILL OPEN (LOW / HIGH confidence / confirmed)
- `src/lib/compiler/execute.ts:748-757`. The chown-failure `catch` still
  sets `chmod(workspaceDir, 0o777)` + `chmod(sourcePath, 0o666)`. This
  is the **intentional mirror** of the Rust fallback
  (`executor.rs:342` `target_mode = if chown_ok { 0o700 } else { 0o777 }`)
  — on a host without `CAP_CHOWN` there is no other way to grant uid-65534
  write access. **DBG-4 remains accepted-by-design, documented.** The
  partial-chown sub-case (chown workspace succeeds, chown source fails,
  inner chmod EPERMs on the now-65534-owned dir) is also unchanged.
- **Reason for deferral:** zero deployments run the worker non-root
  without CAP_CHOWN today; runner mirrors executor. Exit: when the
  deployment matrix changes.

### R3 — STILL OPEN (LOW→MED / HIGH confidence / confirmed)
- `judge-worker-rs/src/docker.rs:188-198`. On inspect timeout the
  function still returns `ContainerInspect { oom_killed: false,
  duration_ms: None, memory_peak_kb: None }` (docker.rs:193-197). Cycle 4
  added `kill_on_drop(true)` to the inspect Command (docker.rs:185) —
  which closes R4 for this site — but did NOT change the `oom_killed:
  false` default. The success-arm (docker.rs:504-516) and timeout-arm
  (docker.rs:527-538) callers continue to report `oom_killed: false`,
  masking a genuine OOM whose post-run `docker inspect` stalls past
  `DOCKER_CLEANUP_TIMEOUT_SECS`. Duration falls back to wall-clock
  (`unwrap_or(wall)`) which is still correct; only the OOM signal is lost.
- **Fix (minimal, deferred):** emit a distinct `warn!` ("oom/peak
  unknown: inspect timeout") and treat `oom_killed` as unknown
  (`Option<bool>`) so the verdict can pick a conservative label instead
  of asserting not-OOM. Same fix as cycle 4 proposed; same severity.
- **Reason for deferral:** bounded (caller still reports a verdict;
  wall-clock duration is correct), narrow trigger (inspect must stall
  past the timeout, which requires a wedged dockerd at the precise
  post-run moment). Exit: pair with a future verdict-label refinement.

### Cycle-4 R2/R4 — CLOSED by `c858ce22`
- **R2** (HIGH, "orphan sweep filters `status=exited` only, running
  `oj-*` never reaped") — closed by `cleanup_all_oj_containers_at_startup`
  which force-removes every `oj-*` regardless of status at startup
  (docker.rs:752-810). The periodic sweep keeps its `status=exited`
  filter (correct — reaping `running` mid-loop would race in-flight
  judgements); the startup sweep covers the leak class R2 named.
- **R4** (LOW, "no `kill_on_drop(true)` on cleanup Commands") — closed
  at all five cleanup sites (inspect/kill/rm + sweep ps/rm + startup
  ps/rm), pinned by the source-grep contract at docker.rs:671-673.

---

## (c) NET-NEW latent bugs

### N5 — startup reap-all has no worker-identity guard; shared-host deploy would nuke a sibling worker's in-flight containers (LOW/MED / HIGH confidence / likely)
- Files: `judge-worker-rs/src/docker.rs:752-810` (startup sweep body),
  `judge-worker-rs/src/docker.rs:318` (`let container_name = format!("oj-{}", Uuid::new_v4())`)
- The startup sweep matches `--filter name=oj-` and force-removes every
  match. Container names are `oj-{uuid4}` — **no worker-id prefix**.
  In the documented single-worker-per-host topology
  (`worker-0.algo.xylolabs.com` per CLAUDE.md), this is safe and is the
  whole point of the sweep. But if a future deployment ever puts two
  workers on the same docker host (debugging pair, capacity burst,
  shared-staging), worker B's startup sweep will `docker rm -f` worker
  A's in-flight `oj-abc` container — silently killing A's active
  judgement mid-execution. Worker A would then observe container
  disappear (`No such container`) and report a runtime_error verdict.
- **Failure scenario:**
  1. Host H runs worker A (canonical, processing a submission in
     container `oj-abc`).
  2. Operator starts worker B on H for debugging or capacity.
  3. Worker B's `cleanup_all_oj_containers_at_startup` lists every
     `oj-*` (including `oj-abc`), force-removes all.
  4. Worker A's stdin-write / inspect / kill paths hit `No such container`
     → runtime_error verdict for the user; the submission is misjudged.
- **Why this is a footgun, not a current bug:** the deploy script
  (deploy-docker.sh:929-935) `docker compose down --remove-orphans`
  guarantees the old worker is fully gone before the new one starts, so
  the canonical deploy has no overlap. CLAUDE.md documents worker-0 as
  "the dedicated judge worker." `oj-` producers are restricted to the
  Rust worker (grep confirms no TS-side producers). The risk is
  exclusively a future shared-host topology.
- **Fix (minimal, future-proof):** prefix the container name with a
  worker identifier sourced from env/config — `format!("oj{}-{}", worker_prefix, Uuid::new_v4())`
  where `worker_prefix` defaults to empty (back-compat) and the startup
  sweep filter matches `name=oj{worker_prefix}-`. Document the
  single-worker-per-host invariant in CLAUDE.md / AGENTS.md. Cheaper
  alternative: add a `JUDGE_WORKER_CONTAINER_PREFIX` env var read by
  both the spawn site (docker.rs:318) and both sweep filters
  (docker.rs:680, 756); default to `oj-`. No behavior change in the
  default deployment.
- **Confidence: HIGH** that the bug exists in code as written;
  **MED** that it will ever fire (depends on a deployment that does not
  exist today). Net severity LOW/MED.

### N6 — startup reap-all is not wrapped in `shutdown` select; SIGTERM during startup sweep is queued up to ~20s (LOW / HIGH confidence / confirmed)
- Files: `judge-worker-rs/src/main.rs:494-500` (call site)
- `cleanup_all_oj_containers_at_startup().await` runs as a bare await
  AFTER `tokio::pin!(shutdown)` (main.rs:487) but is NOT wrapped in a
  `tokio::select!` over `&mut shutdown`. Each internal Command is
  bounded by `DOCKER_CLEANUP_TIMEOUT_SECS`, so worst case is
  `~2 × DOCKER_CLEANUP_TIMEOUT_SECS` (ps timeout + rm timeout in
  sequence). If a deploy sends SIGTERM during this window (e.g.
  orchestrator grace-period expiry, fast successive restarts), the
  signal is queued and only honored once the sweep returns and the main
  loop's first `select!` (main.rs:516) polls the shutdown future.
- **Failure scenario:** SIGTERM arrives T=2s into a 10s `docker ps`
  timeout against a wedged dockerd; the worker doesn't begin draining
  until T=10s+rm-timeout. In-flight claims are not actively cancelled
  (though they may complete naturally during the wait). Bounded — no
  indefinite hang, no leaked tasks (executor tasks are awaited at
  main.rs:632-634 during the post-loop drain).
- **Fix (minimal):** wrap the startup sweep in the same `tokio::select!`
  pattern used for the periodic sweep:
  ```
  tokio::select! {
      _ = &mut shutdown => { tracing::info!("Shutdown during startup sweep"); return; }
      _ = docker::cleanup_all_oj_containers_at_startup() => {}
  }
  ```
  (~5 lines, no behavior change in the no-signal case).
- **Why LOW:** bounded by per-Command timeouts; deploy sequencing
  (`compose down`) typically sends SIGTERM to the OLD container before
  starting the new one, so SIGTERM-during-startup-sweep is rare in
  practice. Worth fixing opportunistically alongside any future
  startup-path edit.

### N7 — periodic sweep `tokio::select!` cancel can leave `docker rm` half-done dockerd-side; manifest as a log inconsistency, not a leak (LOW / HIGH confidence / confirmed, accepted)
- Files: `judge-worker-rs/src/docker.rs:700-716` (sweep rm arm),
  `judge-worker-rs/src/main.rs:516-522` (select cancel)
- When the periodic sweep's `docker rm` arm is cancelled mid-flight by
  the outer shutdown `select!`, `kill_on_drop(true)` SIGKILLs the CLI
  child, but dockerd may have already begun removing containers
  server-side and continues to completion asynchronously. The next
  startup sweep reaps any stragglers, so no permanent leak. The only
  observable artifact is a possible mismatch between the "Cleaned up
  orphaned containers" debug log (which fires only on `Ok(Ok(_))`) and
  the actual dockerd state.
- **Not a defect** — this is the correct failure-mode for a
  cancellation-safe sweep. Restated only to document the cancellation
  semantics for future maintainers. No fix recommended.

---

## (d) FINAL SWEEP

- **No new `unwrap()`/`expect()`/`panic!`** in production code from the
  cycle-4 commits. The five `kill_on_drop(true)` additions are tokio
  Command-builder chain calls (return `&mut Command`, cannot panic).
  `cleanup_all_oj_containers_at_startup` and the rewritten
  `cleanup_orphaned_containers` use `match` over `Result<Output, io::Error>`
  and `Result<Output, _Elapsed>` with explicit warn-and-return branches.
- **Async / cancellation safety:** `tokio::select!` over `&mut shutdown`
  is sound (shutdown is `tokio::pin!`-ed once at main.rs:487 and reused
  across all four select sites by mutable borrow). Dropping the sweep
  future mid-await drops the inner `output()` future; `kill_on_drop(true)`
  ensures the docker CLI child is reaped. The `_permit` RAII guard
  (main.rs:562) is untouched by cycle 4 and remains correct on every
  task exit path (Ok, panic, double-panic, cancel).
- **Integer / shift arithmetic:** no new arithmetic in cycle 4's worker
  surface. `DOCKER_CLEANUP_TIMEOUT_SECS` is consumed only by
  `Duration::from_secs` and `tracing::warn` field interpolation.
- **Schema validation:** `systemSettingsSchema.currentPassword`
  (`z.string().max(1_000).optional()`) gates the reconfirm input before
  the shared helper sees it on BOTH writers; non-string / over-long
  currentPassword fails safeParse and never reaches the gate.
- **Settings partial-wipe:** both writers' `hasOwnInput` covers every
  sensitive key. Pre-existing asymmetry (route's narrower enumeration
  vs action's full enumeration) is unchanged; not widened by cycle 4.
- **Snapshot redaction invariant:** `snapshot:true` is the only call
  site that bypasses `EXPORT_ALWAYS_REDACT_COLUMNS`; all other callers
  (export, backup, migrate) keep the always-redact set. Pinned by the
  cycle-4 test additions.
- **Acceptable throw paths:** every throw site introduced or widened by
  cycle 4 (`encodeIntLiteral`, `requireSettingsReconfirm` →
  `verifyAndRehashPassword`) is either unreachable from production
  (encodeIntLiteral) or pre-mutation + fail-closed (reconfirm). No
  partial state, no 500-on-success.

---

## References

- `judge-worker-rs/src/main.rs:487,494-500,516-525` — startup sweep call
  site (N6) and periodic-sweep shutdown `select!` (A pass)
- `judge-worker-rs/src/docker.rs:179-285` — per-call inspect/kill/rm
  with `kill_on_drop(true)` (R4 closed)
- `judge-worker-rs/src/docker.rs:318` — `oj-{uuid}` container name
  producer (N5 root)
- `judge-worker-rs/src/docker.rs:660-740` — periodic sweep (N1 closed,
  timeout-wrapped + kill_on_drop)
- `judge-worker-rs/src/docker.rs:752-810` — startup reap-all (R2 closed,
  N5 unguarded)
- `src/lib/judge/function-judging/serialization.ts:6-32` —
  `encodeIntLiteral` throw branch (D pass, unreachable from production)
- `src/lib/judge/function-judging/value-fields.ts:71-78` — `parseScalar`
  int safe-integer gate (makes D's throw unreachable)
- `src/lib/db/export.ts:104-117` — `snapshot:true` opt-out (C pass)
- `src/lib/db/pre-restore-snapshot.ts:86-90` — only `snapshot:true`
  caller (C invariant)
- `src/lib/security/password-hash.ts:35-50,63-83` — `verifyPassword` /
  `verifyAndRehashPassword` self-heal path (C argon2 bump)
- `src/lib/auth/config.ts:263,273` — no try/catch around verify
  (pre-existing residual C1, not a cycle-4 regression)
- `src/lib/security/sensitive-settings.ts:81-120` — shared reconfirm
  helper (B pass, fail-closed)
- `src/app/api/v1/admin/settings/route.ts:62-150` — route `hasOwnInput`
  port (B partial-wipe closed)
- `src/lib/actions/system-settings.ts:88-105,140-222` — action reconfirm
  gate + full `hasOwnInput` (B pass)
- `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:85-92` —
  list/count parity (C4-N3 closed)
- `deploy-docker.sh:929-935` — worker restart sequencing (A pass /
  N5 not triggered today)
- `src/lib/compiler/execute.ts:748-757` — R1 still open (deferred)
- `judge-worker-rs/src/docker.rs:188-198` — R3 still open (deferred)

---

## Bug Report (summary)

**Symptom (highest-ROI net-new):** A future deployment that runs two
judge workers on the same docker host would see one worker's startup
sweep silently `docker rm -f` the other worker's in-flight `oj-*`
container, producing a spurious runtime_error verdict for the user.

**Root Cause:** `judge-worker-rs/src/docker.rs:318` names containers
`oj-{uuid4}` with no worker-id prefix, and
`cleanup_all_oj_containers_at_startup` (docker.rs:752-810) matches
`--filter name=oj-` globally. There is no per-worker scope.

**Reproduction:** (requires a non-canonical shared-host deploy; cannot
fire on `worker-0.algo.xylolabs.com` today)
1. Start worker A on host H; submit a problem so A is mid-judgement in
   container `oj-abc`.
2. Start worker B on host H.
3. Observe worker B's startup log: "Startup sweep: reaped leftover oj-*
   containers count=1".
4. Worker A's next docker call against `oj-abc` returns "No such
   container" → runtime_error verdict.

**Fix (minimal):** introduce a `JUDGE_WORKER_CONTAINER_PREFIX` env var
(default `oj-`) read at docker.rs:318 and at the two sweep filters
(docker.rs:680, 756). Each worker uses its own prefix; the startup
sweep only reaps own-prefix containers. No behavior change in the
default deployment.

**Verification:** with the env var unset, both sweeps still match every
`oj-*` (back-compat). With `JUDGE_WORKER_CONTAINER_PREFIX=oj-a` set on
worker A and `=oj-b` on worker B, B's startup sweep leaves A's
`oj-a-*` containers alone (integration test asserting the filter
value).

**Similar Issues:** none — `oj-` is produced only by the Rust worker
(grep-confirmed), so no sibling code path is affected.

**Overall verdict:** cycle 4 ships clean. No regression on the 5 named
fix areas; the two net-new items are forward-looking footguns for a
deployment topology that does not exist today. Recommend landing N5's
cheap env-var guard opportunistically; N6's `select!` wrap is optional
polish. R1/R3 carry forward at the same severity.
