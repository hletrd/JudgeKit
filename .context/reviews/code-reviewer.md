# Code Review — Cycle 5

**Repo:** `/Users/hletrd/flash-shared/judgekit` · **Head:** `7ebea50e` · **Cycle:** 5 (review-plan-fix loop)
**Scope:** (a) regression-check the 9 cycle-4 fixes (commits `edd45cca..7ebea50e`) · (b) re-validate the shared `sensitive-settings.ts` module · (c) net-new hunt across the cycle-4 changed surface
**Coverage:** direct read of every cycle-4 changed file + worker Rust (`docker.rs`, `main.rs`, `api.rs`, `config.rs`) + validator + 3 settings forms + authoring editor (`value-fields.ts`, `function-test-case-editor.tsx`) + per-worker auth helper

**Rigor note (per lead):** severity held tight. No CRITICAL, no HIGH. Findings trended 112→25→28→(cycle-4 MED+3 LOW)→this cycle 1 MEDIUM + 5 LOW. Every cycle-4 fix achieves its stated purpose; the net-new edges are second-order (an opt-in flag rendered moot, audit-accuracy nits, dead code from the fix itself). Nothing inflated to keep the count up.

### By Severity
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 1 (C5-N1 — `JUDGE_ALLOW_UNREGISTERED_MODE` is now a silent footgun after the shared-token removal)
- LOW: 5 (C5-N2 audit-log default misrepresentation; C5-N3 startup sweep not shutdown-wrapped; C5-N4 dead `shareAcceptedSolutions` column fetch; C5-N5 dead `secretTokenHash` conditional + misleading comment; serialize-call-site dead-column nit folded into N4)
- INFO: 2 (encodeIntLiteral throw correctly unreachable from the editor; DOCKER_CLEANUP_TIMEOUT_SECS=10 bounds the sweep)

---

## Stage 1 — Cycle-4 Regression Check (all 9 fixes VERIFIED, no production regression)

| Fix | File:line | Verdict |
|---|---|---|
| **C4-N1** settings PUT partial-wipe | `src/app/api/v1/admin/settings/route.ts:110-164` | **VERIFIED FIXED.** Every field write is now guarded by `hasOwnInput(key)`; `baseValues` starts empty (`{ updatedAt }`) and only carries supplied keys. `PUT {siteTitle:"x"}` no longer wipes `hcaptchaSecret`/`publicSignupEnabled`/`platformMode`. The reconfirm gate is no longer bypassable by a side-effect wipe. |
| **C4-N3** accepted-solutions list filter | `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:90` | **VERIFIED FIXED.** List SELECT WHERE now carries `eq(users.shareAcceptedSolutions, true)` (L90), matching the count query (L55). The redundant JS `.filter` at the old L92 is gone. `total` is now consistent with the paged list. Residual: dead column fetch (C5-N4). |
| **C4-2 P1** workerId required on /claim + /poll | `src/app/api/v1/judge/claim/route.ts:106-128,177-180`; `poll/route.ts:74-80` | **VERIFIED.** Shared-token fallback removed from both routes; per-worker auth (`isJudgeAuthorizedForWorker`) is the only path. Schema superRefine requires `workerId`+`workerSecret`. Poll rejects any submission lacking `judgeWorkerId` with 401. **Caveat → C5-N1:** the worker-side `JUDGE_ALLOW_UNREGISTERED_MODE` flag is now functionally dead (a worker in that mode can never clear `/claim`). |
| **C4-2 P2** strict IP allowlist opt-in | `src/lib/judge/ip-allowlist.ts:20-22,182-210` | **VERIFIED.** Opt-in via `JUDGE_STRICT_IP_ALLOWLIST=1` fails-closed when `JUDGE_ALLOWED_IPS` unset; default preserves unset==allow-all with a one-time `logger.warn`. `resetIpAllowlistCache` also resets the warn flag, so tests are deterministic. No default flip — no repeat of `23851d69`. |
| **C4-1** snapshot `snapshot:true` opt-out | `src/lib/db/export.ts:72,111-115`; `pre-restore-snapshot.ts:87-90` | **VERIFIED.** `snapshot:true` sets `activeRedactionMap = {}`, bypassing `EXPORT_ALWAYS_REDACT_COLUMNS`. The snapshot retains `passwordHash`/`sessionToken`/API-key ciphertext/hCaptcha+SMTP secrets. Only `takePreRestoreSnapshot` passes `snapshot:true`; regular export/backup/migrate keep the always-redact set. At-rest 0o600 file + 0o700 dir unchanged. Docstring (L34-42) matches code. |
| **F1** int64 verbatim serialization | `serialization.ts:16-31`; `cpp.ts:42-51`; `java.ts:78-86`; `csharp.ts:78-90` | **VERIFIED.** `encodeIntLiteral` emits bigint/string verbatim, accepts safe-integer `number`, throws loudly on unsafe number/non-int. Adapters use `strtoll`/`Long.parseLong(integerToken())`/`long.Parse(IntegerToken(), InvariantCulture)` over sign+digits-only tokens (no `.`/`e`/`E`). **Edge case the lead asked about:** an unsafe `number` throws cleanly with a precise message — and the only hot caller (`function-test-case-editor.tsx:154-161`) pre-validates via `parseFieldValue`, which rejects unsafe ints BEFORE encode, so the throw is correctly unreachable from the UI (defensive guard only). **Caveat → C5-OQ2:** the editor still caps UI-authored ints at 2^53, so F1's end-to-end exit criterion is only partially met. |
| **C4-3** sensitive-key expansion | `src/lib/security/sensitive-settings.ts:19-54` | **VERIFIED.** Shared list includes exam-mode toggles + the four `uploadMax*` DoS ceilings + rate-limit/session ceilings. Both writers gate the same set. |
| **ARCH-1** shared reconfirm on BOTH writers | `sensitive-settings.ts:81-121`; `route.ts:72-77`; `system-settings.ts:100-103` | **VERIFIED.** Single `requireSettingsReconfirm` helper, single `SENSITIVE_SETTINGS_KEYS` source of truth. Route maps via `settingsReconfirmToResponse`; action maps via `{ success:false, error }`. Gate runs before any mutation. **Caveat → C5-OQ1:** passwordless (OAuth-only) admins are now locked out of sensitive-settings changes. |
| **A6** worker cleanup bundle (N1+R2+R4) | `docker.rs:172-279,673-809`; `main.rs:498,515-524` | **VERIFIED.** Every cleanup `docker` Command is `tokio::time::timeout`-wrapped + `.kill_on_drop(true)` (≥5 sites). Periodic sweep uses `status=exited`; startup reap-all (`cleanup_all_oj_containers_at_startup`) removes every `oj-*` regardless of status. Periodic sweep is shutdown-select-wrapped (L515-524). **Caveat → C5-N3:** the STARTUP sweep is awaited bare (no shutdown select). |

---

## Stage 2 — Shared `sensitive-settings.ts` Module Review

The new module is a clean SRP extraction and the right shape:

- **Single source of truth.** `SENSITIVE_SETTINGS_KEYS` (L19-54) is a `const ... as const` array; both writers import it. Adding a key is now a one-line change that propagates to both gates — the drift class from cycle 3 (C3-AGG-7 undermined by C4-N1) is structurally closed.
- **Clean helper API.** `requireSettingsReconfirm(input, user)` returns a typed discriminated union (`{ok:true}` | `{ok:false, status, error}`); the route uses `settingsReconfirmToResponse` to map to `NextResponse`, the action maps via `{success, error}`. Both call sites are 3 lines. Good DRY without over-abstraction.
- **No remaining duplication.** The two writers' field-write blocks (`route.ts:113-164` vs `system-settings.ts:152-235`) still mirror each other — but that is the partial-update shape, not the gate. Collapsing the two write blocks into one `applySystemSettings` core is the ARCH-4 carry-forward (Phase C), correctly out of scope for this cycle's security fix.
- **Consistency check.** `touchesSensitiveSettingsKey` reads `(input as Record)[key] !== undefined` — matches `hasOwnInput` semantics (key present with any value). Both writers pass the raw input object (route: parsed `body`; action: raw `input`), so `currentPassword` is visible to the helper but filtered out before DB write by `allowedConfigKeys`/non-overlap with columns. Correct.

**One asymmetry worth noting (LOW, not blocking):** the route's `allowedConfigKeys` (L85-97) and the action's `CONFIG_KEYS` (L23-46) are duplicated arrays that must be kept in sync by hand. They currently match (both include the 4 `uploadMax*` keys + rate limits + session). This is the same hand-sync hazard that `SENSITIVE_SETTINGS_KEYS` just centralized for the gate; the config-key list is a candidate for the same treatment next cycle. Not a regression — pre-existing.

---

## Stage 3 — Net-New Findings

### MEDIUM

**[MEDIUM] C5-N1 — `JUDGE_ALLOW_UNREGISTERED_MODE` is now a silent footgun: a worker that opts in can never claim work post-C4-2**
- Files: `judge-worker-rs/src/main.rs:326-341,552`; `judge-worker-rs/src/config.rs:270-274`; claim gate `src/app/api/v1/judge/claim/route.ts:106-128`.
- Confidence: HIGH · Status: confirmed (code path read end-to-end)

**Why it's a problem.** C4-2 Part 1 removed the shared-token fallback from `/claim` (correctly). But the worker binary still honours `JUDGE_ALLOW_UNREGISTERED_MODE`: if registration fails and the flag is set, the worker continues with `worker_id = None`, `worker_secret = None` (main.rs:332) and enters the poll loop. At main.rs:552 it calls `client.poll(None, None)`, which POSTs `{worker_id:null, worker_secret:null}` to `/claim`. The new `claimRequestSchema` superRefine rejects the missing `workerId` with `workerIdRequired` → 400. The poll error path (main.rs:556-561) logs `"Poll failed"` at ERROR and treats it as "no work". The worker therefore spins forever, never claiming, while submissions pile up unjudged.

Pre-C4-2 this flag was an intentional resilience escape hatch (survive an app-server registration outage via shared-token claims). Post-C4-2 the flag no longer has any valid function — unregistered workers cannot authenticate to `/claim` under any path — but the binary still lets operators enable it, and the failure is silent at the business level (the worker is "up").

**Failure scenario:** operator sets `JUDGE_ALLOW_UNREGISTERED_MODE=true` for resilience during a flaky app-server upgrade; the worker's registration fails once; it then runs indefinitely doing no judging; the queue grows; the only signal is repeated `Poll failed: 400 ... workerIdRequired` lines in the worker log.

**Fix (pick one):**
1. Remove the flag and its config plumbing entirely — its sole use case (shared-token claim) is gone.
2. If the flag must remain as a build/dev escape, make the worker `std::process::exit(1)` (or refuse to enter the poll loop) when unregistered, since claiming is now impossible — fail loud, not silent.
3. At minimum, downgrade the poll error log to a one-time fatal `error!` that says "unregistered mode is incompatible with workerId-required /claim; exiting" and break the loop.

**Negative test:** worker with registration failing + flag=true → no infinite poll-400 loop (exits or never claims).

---

### LOW

**[LOW] C5-N2 — settings PUT audit `details` records default values for OMITTED fields, misrepresenting the DB change**
- File: `src/app/api/v1/admin/settings/route.ts:184-194`
- Confidence: HIGH · Status: confirmed

After the C4-N1 `hasOwnInput` fix, omitted fields are no longer written to the DB. But the audit `details` object still records `platformMode ?? DEFAULT_PLATFORM_MODE`, `aiAssistantEnabled ?? true`, `publicSignupEnabled ?? false`, etc. — i.e. the destructured default-applied value, NOT what was actually written. So a `PUT {siteTitle:"x"}` writes only `siteTitle`, yet the audit row claims `platformMode:"homework"`, `publicSignupEnabled:false`, etc. An auditor reviewing "did this PUT change platformMode?" gets a false positive.

**Failure scenario:** forensic review of the audit trail concludes an admin flipped `publicSignupEnabled` when in fact the field was untouched.

**Fix:** record what was actually written — only include a key in `details` when `hasOwnInput(key)`, mirroring `baseValues`. Or snapshot `baseValues` (keys actually written) into the audit `details` instead of the destructured-with-defaults set.

---

**[LOW] C5-N3 — startup reap-all sweep is awaited bare, so it can delay graceful shutdown / risk SIGKILL during deploy**
- File: `judge-worker-rs/src/main.rs:498`
- Confidence: HIGH · Status: confirmed (bounded)

`docker::cleanup_all_oj_containers_at_startup().await` runs before the main loop. Unlike the periodic sweep (L515-524, which is `tokio::select!`-wrapped against `&mut shutdown`), the startup sweep is awaited directly. Each internal `docker` call is bounded by `DOCKER_CLEANUP_TIMEOUT_SECS = 10`, so worst case ≈ 20 s (ps + rm). If a deploy SIGTERM lands during the startup sweep, the worker cannot honour it until the sweep finishes; with a typical 10-30 s SIGTERM grace period the worker may be SIGKILLed mid-startup. Functionally safe (next startup re-runs the same idempotent sweep), but operationally noisy.

**Failure scenario:** rolling deploy SIGTERMs the worker during its startup sweep; the sweep is mid-`docker rm -f`; shutdown is delayed past the grace period; the container is SIGKILLed and restarts, running the sweep again.

**Fix:** wrap the startup sweep in the same `tokio::select! { _ = &mut shutdown => break, _ = cleanup_all_oj_containers_at_startup() => {} }` shape used for the periodic sweep. The functions are already internally timeout-bounded, so the outer select only adds shutdown responsiveness.

---

**[LOW] C5-N4 — accepted-solutions list SELECT still fetches `shareAcceptedSolutions` but never uses it after C4-N3**
- File: `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:80`
- Confidence: HIGH · Status: confirmed

After the C4-N3 fix, the WHERE clause filters `shareAcceptedSolutions` in SQL and the `.map` (L96-109) no longer references `solution.shareAcceptedSolutions` — only `acceptedSolutionsAnonymous` is used. The column is still in the SELECT list (L80), so every row carries an unused field. Pure dead fetch; no behaviour impact.

**Fix:** drop `shareAcceptedSolutions: users.shareAcceptedSolutions` from the select list (L80). (`acceptedSolutionsAnonymous` must stay — it drives the `isAnonymous`/`userId`/`username` masking.)

---

**[LOW] C5-N5 — claim route defense-in-depth `if (worker.secretTokenHash)` is now unreachable; the adjacent comment is misleading**
- File: `src/app/api/v1/judge/claim/route.ts:198-208`
- Confidence: HIGH · Status: confirmed

The block at L201 (`if (worker.secretTokenHash) { … safeTokenCompare(hashToken(workerSecret), secretTokenHash) … }`) is reached only after `isJudgeAuthorizedForWorker` returned `authorized:true` at L177-180. But `isJudgeAuthorizedForWorker` (auth.ts:78-96) already rejects any worker lacking `secretTokenHash` with `workerSecretNotMigrated`. Therefore by the time control reaches L201 the worker is guaranteed to have a hash, the `if` is always-true, and the implicit else (no hash) is dead. The comment "Plaintext fallback is gone — workers registered before the hash rollout must re-register" reads as if hashless workers are handled here, but they are actually rejected one call earlier.

**Failure scenario:** none at runtime (the check is harmless redundancy). Cost is maintainability — a future reader may "fix" the dead else branch or believe the gate is the primary enforcement point.

**Fix:** either delete the now-redundant inner hash check (the primary `isJudgeAuthorizedForWorker` call already enforces it) OR rewrite the comment to say "defense-in-depth: re-confirms the body `workerSecret` against the hash that `isJudgeAuthorizedForWorker` already verified via the Bearer token" and drop the `if` so the body always reads as a flat assertion.

---

### INFO (no action required, recorded for completeness)

- **I-1** `serialization.ts:16-31` `encodeIntLiteral` throw is correctly unreachable from the authoring UI. `parseFieldValue` (`value-fields.ts:73-76`) rejects int values > 2^53 via `Number`+`isSafeInteger` BEFORE encode, so the editor call site (`function-test-case-editor.tsx:154-161`) never passes an unsafe number to `encodeArgs`/`encodeValue`. The throw remains the correct fail-loud guard for DB/API callers that bypass the editor. Good defensive design.
- **I-2** `DOCKER_CLEANUP_TIMEOUT_SECS = 10` (`docker.rs:12`). Each docker call in the periodic and startup sweeps is individually bounded; worst-case total sweep ≈ 20 s. Acceptable for a background sweep; the only residual is C5-N3 (shutdown responsiveness of the startup sweep).

---

## Open Questions (low-confidence / surfaced, not blocking)

- **C5-OQ1 — Are passwordless (OAuth-only) admin accounts a supported deployment shape?** `requireSettingsReconfirm` (`sensitive-settings.ts:94-102`) returns `authenticationFailed` when `passwordHash` is null. ARCH-1 (this cycle) applied the gate to the server action AND all 3 settings forms mark `currentPassword` as an HTML `required` attribute (`allowed-hosts-form.tsx:125`, `config-settings-form.tsx`, `system-settings-form.tsx`). Net effect: an admin who authenticates solely via OAuth (no password set) can no longer change ANY sensitive setting through the dashboard — the form will not submit without a password they do not have, and even via the API the gate returns 403. This is the correct security tradeoff (reconfirm inherently requires a password; allowing passwordless skip would defeat the gate for any OAuth-account takeover), but it is a behaviour change from cycle 3 (the action had no gate) and may lock out real admins. Needs product intent + a doc note. If passwordless admins must be supported, the path is re-auth via fresh OAuth flow rather than password.

- **C5-OQ2 — Is F1's end-to-end int64 exit criterion intended to cover the authoring UI?** The plan's exit ("an int/long > 2^53 round-trips byte-identical … author enters `9223372036854775807`") is met for the encode (`encodeIntLiteral` bigint/string paths) and adapter (`strtoll`/`parseLong`/`long.Parse`) layers, and for values inserted via API/DB as string or bigint. But the authoring UI cannot INPUT such a value: `parseFieldValue` (`value-fields.ts:73-76`) parses int fields with `Number` and rejects `!isSafeInteger`, so an author typing LLONG_MAX gets a field-level `intRangeError` and can never create the test case. The BigInt rework is explicitly deferred (`value-fields.ts:27` "BigInt rework is deferred (out of v1 scope)"). If full UI-authored int64 IS in scope, the follow-up is to parse int fields to `bigint` in `parseFieldValue` (then `encodeIntLiteral`'s bigint path handles it). If it is out of scope, the F1 exit criterion should be re-worded to "encode + adapter + API/DB path" and the UI cap documented.

---

## Cross-Agent Overlap

- **C5-N1** — logic/operational finding unique to code-reviewer; may overlap **security-reviewer** (silent failure mode) and **architect** (flag-removal is a small design decision). Flag for aggregation.
- **C5-OQ1** — overlaps **security-reviewer** (auth posture) and **document-specialist** (doc note for passwordless admins). Needs product input.
- **C5-OQ2** — overlaps **test-engineer** (UI bigint authoring test) and **feature-dev** (F1 follow-through).
- **C5-N2..N5** — residual edges of cycle-4 fixes; no other agent expected to surface these.
- **Deferred Phase B/C items** from cycle 4 (AGG-1, C4-4/AGG-10, NEW-M8, AGG-41, C4-N2, C4-N4, C4-6/7/8, ARCH-2/3/4) — not re-opened; no line-level change this cycle closes them. Carry forward verbatim.

---

## Positive Observations

- **`sensitive-settings.ts` is a textbook SRP extraction** — one key list, one helper, two thin adapters. The drift class that produced the C3-AGG-7 ↔ C4-N1 bypass is now structurally impossible. Cleanest fix of the cycle.
- **`encodeIntLiteral` fail-loud design** is exactly right: bigint/string pass through, safe-integer passes, unsafe throws with a precise message. Pairing it with `parseFieldValue` pre-validation means the throw is a defense-in-depth guard, not a live crash path.
- **Startup reap-all (`cleanup_all_oj_containers_at_startup`)** is the correct R2 shape — idempotent, force-remove every `oj-*`, no `status=exited` filter, only runs when no judgements are in flight.
- **accepted-solutions count/list symmetry** is fully restored — both queries carry the identical `and(whereClause, eq(users.shareAcceptedSolutions, true))`.
- **Cycle-4 produced zero production regressions** across all 9 fixes; the net-new findings are second-order consequences (an opt-in flag rendered moot by the fix, audit-accuracy nits, dead code from the fix itself). The loop is converging on the intended invariants.

---

## Recommendation

**COMMENT.** No CRITICAL, no HIGH at HIGH confidence. Schedule **C5-N1** (the only MEDIUM) — it is a small, mechanical fix (remove the `JUDGE_ALLOW_UNREGISTERED_MODE` flag OR make the worker exit instead of entering a dead poll loop) with a concrete silent-failure scenario for any operator that opts in. **C5-N2..N5** are cheap ride-alongs (audit accuracy, shutdown responsiveness, dead column, dead conditional). **C5-OQ1/OQ2** need product intent before they become action items. All 9 cycle-4 fixes verified with no production regression.
