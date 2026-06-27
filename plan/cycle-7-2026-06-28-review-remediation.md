# Cycle 7 (2026-06-28) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 7, head `66112bb6`, streamlined single-pass — no fan-out per orchestrator note). Carry-forward: `plan/cycle-{4,5,6}-…md`; cycle-5 full fan-out (7 per-agent files) is the authoritative severity source.

Repo rules honored: semantic commits + gitmoji, GPG-signed (`git commit -S`), fine-grained (one fix per commit), every commit includes relevant tests (`.context/development/conventions.md`, AGENTS.md "Testing Rules (MANDATORY)"), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT silently dropped.

**Regression status (single-pass re-check of cycle-6 surface):** 0 regressions. See `_aggregate.md` STAGE 0.

---

## Phase A — Implement this cycle (user-selected batch)

### A1. Crypto hardening — C4-4/AGG-10 default flip (plugin) + NEW-B versioning+keyring (main) · PRIMARY

Two independent commits — the plugin and main paths are at different maturity (see aggregate STAGE 1 A1).

#### A1a. C4-4 / AGG-10 — flip `decryptPluginSecret` plaintext-fallback default `true`→`false`
- **File:** `src/lib/plugins/secrets.ts:61`.
- **Root cause:** `const allowPlaintext = options?.allowPlaintextFallback ?? true` still defaults the plaintext-readable fallback ON in production. An attacker who can write plaintext to a plugin secret column bypasses the GCM auth tag. The warn-log audit trail (the prerequisite) shipped in cycle 5 (`da8e6b1f`) and has now deployed in cycles 5 AND 6.
- **Do:** flip the default to `false`. Keep the fallback CODE available via explicit `{ allowPlaintextFallback: true }` opt-in; keep the warn-log path. The contained failure mode (`decryptPluginConfigForUse:176-181` catches the throw → logs + sets `""`) means the worst case is a non-functional plugin secret, NOT a process crash or lockout. Update the `decryptPluginSecret` docstring (lines 52-56) to reflect that the default is now `false` and the fallback is explicit-opt-in only.
- **Tests:** extend the plugin secrets test — `decryptPluginSecret("plaintext")` with NO options now THROWS (default false); `decryptPluginSecret("plaintext", { allowPlaintextFallback: true })` still returns plaintext + warns in production. The encrypted path is unchanged. Revert-RED: removing the `?? false` flip makes the no-options throw test fail.
- **Exit:** the plugin-path plaintext fallback is no longer default-on; explicit opt-in + warn preserved (consistent with `encryption.ts:18-22` — not silently dropped).

#### A1b. NEW-B — `enc:v1:` version prefix + keyring for the main `encryption.ts` path
- **File:** `src/lib/security/encryption.ts` (full rewrite of `encrypt`/`decrypt` internals + a keyring helper).
- **Root cause:** the main path emits `enc:iv:ciphertext:authTag` (4 parts, no version) and decrypts with a single key. There is no way to rotate the key without invalidating every existing ciphertext, because the format carries no version and there is no keyring to try alternate keys.
- **Do (writer):** emit `enc:v1:iv:ciphertext:authTag` (5 parts) — add `const ENCRYPTION_VERSION = "v1"` and a `VERSIONED_PREFIX = "enc:v1:"`. The current key is v1.
- **Do (reader — BACKWARD-COMPAT, the load-bearing part):**
  - If `encoded.startsWith("enc:v1:")` → split 5 parts, take `[, , ivHex, cipherHex, tagHex]`.
  - Else if `encoded.startsWith("enc:")` → LEGACY (no version) → split 4 parts, take `[, ivHex, cipherHex, tagHex]`. Treat unversioned as v1/current. **This branch is what keeps every existing `enc:`-prefixed secret readable.**
  - Else → plaintext-fallback path (unchanged, default `false` + warn).
  - Both enc paths feed a shared `decryptWithKeyring(iv, ciphertext, authTag)` helper that tries each key in the keyring and returns the first that authenticates (GCM tag verifies), else throws.
- **Do (keyring):** add `getKeyring(): Buffer[]` = `[getKey(), ...previousKeys]` where previous keys come from optional env `NODE_ENCRYPTION_KEY_PREVIOUS` (comma-separated list of 64-char hex). When unset (the default today), the keyring is just `[currentKey]` — identical behaviour to today, just future-proofed. Old `enc:` values decrypt via the same keyring (legacy reader + keyring compose cleanly).
- **Tests (round-trip + backward-compat + rotation, all unit, no DB):**
  1. Round-trip: `encrypt(x)` → starts with `enc:v1:` and `decrypt(...)` === x.
  2. **Legacy backward-compat:** synthesise a legacy 4-part value `enc:<ivHex>:<cipherHex>:<tagHex>` using the SAME key (call the internal GCM primitives directly, or capture a value encrypted before the change) → `decrypt()` returns the original plaintext. **This is the test that proves existing secrets stay readable.**
  3. Rotation: set `NODE_ENCRYPTION_KEY_PREVIOUS` to the old key + change `NODE_ENCRYPTION_KEY` to a new key → a value encrypted under the OLD key (legacy `enc:` or `enc:v1:`) still decrypts; new `encrypt()` output decrypts under the new key.
  4. Tamper detection preserved (flip a byte → throws).
  5. Update the existing `encryption.test.ts` assertions that encode the old 4-part shape: the regex `/^enc:...$/` (line 57) → `/^enc:v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/`; the `parts[3]` tamper index (line 83) → `parts[4]` (authTag is now the 5th segment).
- **Exit:** new writes are versioned; legacy `enc:` values remain readable; key rotation works via the keyring env; zero-downtime rotation is possible (deploy with PREVIOUS set → new writes use new key → old values still readable). Existing secrets NOT broken.

### A2. F-1 — `canManageProblem` capability fast-path + per-request ALS memoize (perf)
- **Files:** `src/lib/auth/permissions.ts:186-217` (fast-path + memo consult); new `src/lib/auth/permission-cache.ts` (ALS store + `withPermissionCache`); `src/lib/api/handler.ts:109` (wire `withPermissionCache` inside `withRecruitingContextCache`).
- **Root cause:** `canManageProblem` makes 2 DB round-trips unconditionally, including for roles that lack both `problems.edit` and `problems.delete` (zero manage capability). It is also called multiple times per request on some paths (e.g. problem detail + edit), recomputing the same scope each time.
- **Do (fast-path):** after the `groups.view_all` short-circuit, add `if (!caps.has("problems.edit") && !caps.has("problems.delete")) return false;`. `resolveCapabilities` is in-memory cached, so the check is free. Defense-in-depth + perf.
- **Do (ALS memoize — graceful degradation):** create `permission-cache.ts` mirroring the proven `recruiting/request-cache.ts` pattern — an `AsyncLocalStorage<Map<string, boolean>>`, `withPermissionCache(fn)` that runs `fn` inside a fresh `Map`, and `getCachedPermission(key)`/`setCachedPermission(key, val)` that no-op when no store is active. In `canManageProblem`, key = `manage:${userId}:${problemId}`; consult before the 2 DB hits, store after. Wire `withPermissionCache` INSIDE `withRecruitingContextCache` in `handler.ts:109` so every API request gets a memo. RSC page callers run without the memo (correct, just uncached — graceful degradation). Do NOT memoize across requests (the Map is per-run).
- **Tests:** extend `tests/unit/auth/permissions.test.ts` —
  1. Fast-path: a role whose caps lack both `problems.edit` and `problems.delete` → returns `false` WITHOUT touching the DB query mocks (assert `db.select` / `getAssignedTeachingGroupIds` NOT called). A role with `problems.edit` → existing behaviour unchanged.
  2. Memo: wrap two consecutive `canManageProblem(id, user, role)` calls in `withPermissionCache` → the DB-backed mocks fire EXACTLY ONCE (second call is a cache hit). Without the wrapper, they fire twice (graceful degradation — correctness unchanged).
- **Exit:** unauthorized roles skip 2 DB hits; same-request repeat calls hit the memo; result always correct (memo or not).

### A3. AGG-1 — restore post-write file-consistency verification (SAFE PARTIAL)
- **Files:** `src/lib/db/export-with-files.ts:351-360` (`restoreParsedBackupFiles`); `tests/unit/db/export-with-files.test.ts` (add cases).
- **Root cause:** `restoreParsedBackupFiles` writes files in a loop and returns the count, but does NOT verify the final on-disk state. A silent partial write (intermittent I/O error leaves some files short without throwing) would let the route return `success: true` while the DB references missing blobs. The full atomicity fix (staging-then-rename) reorders the destructive restore path and is deferred (safety rationale in aggregate STAGE 2).
- **Do (partial):** after the write loop in `restoreParsedBackupFiles`, verify each expected `storedName` exists on disk (`uploadedFileExists` from `storage.ts`). Collect any missing. If any are missing, throw a structured error `fileRestoreIncomplete` whose message lists the missing names (the route's existing catch at `restore/route.ts:181-201` records a durable audit + returns `restoreFailed` with the snapshot path — the failure surface is already correct; this just makes the detection faithful). Log the missing count at error level.
- **Tests:** extend `export-with-files.test.ts` — happy path (all files present after write → returns count, no throw); partial-write path (mock `uploadedFileExists` to return false for one file → throws `fileRestoreIncomplete` and the error message names the missing file). The mock scaffold (`writeUploadedFileMock`, `accessMock`) already exists; add an `uploadedFileExistsMock`.
- **Exit:** a silent partial write is detected and named on the existing durable-audit + clear-error surface; the route no longer returns `success: true` while files are missing.

Gates (all FOREGROUND, `timeout: 600000` — NOT background): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`. Local-build environmental-ceiling caveat per brief: if `next build` stalls at the ceiling with no output, treat as indeterminate (environmental), keep lint/lint:bash/db:check/cargo test/test:unit green, proceed; remote deploy confirms buildability. Known-flaky (`migration-drift-cleanup`, `public-route-metadata`, `public-seo-metadata`) — confirm in isolation if `test:unit` trips on them.

---

## Phase B — Carry-forward (deferred to subsequent cycles; planned, NOT dropped; severity preserved)

Each records: file+line · original severity · reason · exit criterion. Security/correctness items carry a quoted repo rule or a quoted safety rationale permitting the partial.

- **AGG-1 full staging-then-rename** — MED (data-loss design). `restore/route.ts:163,178-202`. **Partial landed this cycle** (A3 post-write verification). **Safety rationale:** the full fix reorders the destructive flow + adds staging-dir lifecycle; without a restore integration test (test:e2e cannot run locally) it does not meet the "not untested on the data-loss surface" bar. The partial converts the worst case from UNDETECTED silent partial write to DETECTED + named on the existing durable-audit surface, fully unit-tested. **Exit:** ship staging-then-rename (`uploads/.restore-staging-<id>/` → verify → DB commit → atomic rename → janitor) in a cycle that can run the restore integration test.
- **NEW-B companion: re-encrypt migration (main path)** — LATENT. Old `enc:` values stay readable via the legacy reader; never auto-rewritten. **Exit:** lazy re-encrypt on next write, or a one-shot sweep. Low urgency.
- **debugger-N5** startup reap-all worker-identity guard — LOW/MED (future topology). `docker.rs`. **Exit:** `JUDGE_WORKER_CONTAINER_PREFIX` env; shared-host topology does not exist today.
- **Test-gap batch (A8):** C4-A6 main.rs `active_tasks` exactly-once (needs task-body refactor); A11a migrate/import mirror tests; C4-N1-test auth-token lifecycle; C5-A3 snapshot output-byte behavioural test; PB-2/PB-3/A12e/GS-1/GS-2/C4-A4/C4-A5. Test-only, HIGH-ROI, zero prod risk. **Exit:** next cycle's test lane.
- **Designer P1 (h2→h1 page titles, 27 pages + 5 error.tsx)** — LOW a11y, churn-heavy. **Exit:** dedicated a11y pass.
- **LOW Phase C:** C4-6 roles PATCH TOCTOU; C4-7 recruiting metadata clobber; C4-N2 lateral cap-strip; C4-8 executor.rs source 0o666; R3 inspect-timeout OOM=false; R1 chown-fallback (accepted-by-design); AGG-12/SEC-12 postcss (next `next` bump); ARCH-2/3/4; tracer-N1/N2/N3; UI-16; SEC-16/17/20/21; ARCH-6/8; NEW-M9; C3-N9; feature-dev NEW-2. `AGENTS.md:438` permits deferral of LOW-severity defense-in-depth/observability polish.

---

## Phase C — Progress Tracking (updated end-of-cycle)
- [ ] A1a C4-4 plugin default flip
- [ ] A1b NEW-B main-path enc:v1 versioning + keyring
- [ ] A2 F-1 canManageProblem fast-path + ALS memoize
- [ ] A3 AGG-1 post-write consistency verification (partial)
- Gates: (pending)
- DEPLOY: (pending)
