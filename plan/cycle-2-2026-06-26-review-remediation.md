# Cycle 2 (2026-06-26) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (2026-06-26 cycle 2, head `ad543e14`).
Supersedes the Phase B/C backlog of `plan/cycle-1-2026-06-26-review-remediation.md` (kept for provenance; its Phase A is 100% done and verified).

Repo rules honored: semantic commits + gitmoji, GPG-signed, fine-grained (one fix per commit), every commit includes relevant tests (`.context/development/conventions.md`, AGENTS.md "Testing Rules (MANDATORY)"), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT silently dropped (CLAUDE.md "Secrets & Credentials"; AGENTS.md testing rules).

This is cycle 2 of an iterated loop. **Phase A is implemented this cycle (PROMPT 3).** Phase B records the carry-forward backlog with provenance (deferred, not dropped). Phase C records low-severity deferrals.

---

## Phase A — Implement this cycle (cycle 2)

All items below are CONFIRMED by the orchestrator reading the cited code (see aggregate "VALIDATED THIS CYCLE"). Ordered by severity.

### A1. C2-C1 / NEW-C1 — import.ts: don't truncate tables absent from the export (CRITICAL, data-loss)
- File: `src/lib/db/import.ts:125-148`
- Do: in the truncate loop, skip `tx.delete(table)` when `data.tables[tableName]` is absent; push a `missingTable:<name>` notice into `result.errors` (non-fatal) so the operator sees it. Preserve partial-export intent without wiping untouched tables.
- Tests: unit test `tests/unit/db/import-*.test.ts` — export missing `examSessions` → after import, the table is NOT truncated (mock `tx.delete` not called for it) and `errors` contains the notice; full export still truncates all.
- Exit: a backup that omits a known table no longer empties it.

### A2. C2-H1 / NEW-H1 — api-keys DELETE role gate (HIGH)
- File: `src/app/api/v1/admin/api-keys/[id]/route.ts:110-132`
- Do: select `existing.role`; apply `canManageRoleAsync(user.role, existing.role) || user.role === existing.role` mirroring PATCH (L86-90); 403 otherwise.
- Tests: negative-authz test — manager deleting a super_admin key → 403; same-role delete → 200.
- Exit: no admin can delete a higher-privilege key without role authority.

### A3. C2-H3 / NEW-H3 — snapshot-null aborts destructive import (HIGH)
- Files: `src/app/api/v1/admin/restore/route.ts:149-151`; `src/app/api/v1/admin/migrate/import/route.ts:109-110,210-211`
- Do: after `takePreRestoreSnapshot`, if it returns `null`, return 500 `preRestoreSnapshotFailed` BEFORE calling `importDatabase`. Keep a break-glass opt-in flag `ALLOW_UNSNAPSHOTTED_RESTORE` (default off) for the disk-full recovery case, documented.
- Tests: mock `takePreRestoreSnapshot → null` → assert 500 and `importDatabase` NOT called; happy path still imports.
- Exit: a failed snapshot never precedes a destructive import.

### A4. C2-H4 / NEW-H4 — language dockerImage allowlist (HIGH, RCE surface)
- Files: `src/app/api/v1/admin/languages/route.ts:16,71` (POST); `src/app/api/v1/admin/languages/[language]/route.ts` (PATCH)
- Do: validate `body.dockerImage` with `isAllowedJudgeDockerImage` + `isLocalJudgeDockerImage` (from `src/lib/judge/docker-image-validation.ts`); reject non-`judge-*` tags with 422. Apply on POST and PATCH.
- Tests: POST/PATCH with `attacker-registry/pwn:latest` → 422; `judge-python:3.12` → accepted.
- Exit: arbitrary registry images cannot be stored for worker pull.

### A5. C2-H2 / NEW-H2 — assignments accessCode projection (HIGH)
- Files: `src/app/api/v1/groups/[id]/assignments/route.ts:54-68`; `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:25-44`
- Do: add a top-level `columns` projection omitting `accessCode` (and `freezeLeaderboardAt`) for non-managers; include them when `canManageGroupResourcesAsync` returns true.
- Tests: enrolled student GET → response has no `accessCode` key; instructor manager GET → has it.
- Exit: `accessCode` never reaches enrolled non-managers.

### A6. C2-H5 / NEW-H6 — editorial thread access (HIGH)
- File: `src/app/(public)/community/threads/[id]/page.tsx:83` (+ `generateMetadata` L26)
- Do: change the scope gate to include `"editorial"`: `scopeType === "problem" || "solution" || "editorial"` in both the page and `generateMetadata`.
- Tests: unit test over `canReadProblemDiscussion` for an editorial-scoped thread → denied without problem access. (If a page-level test is impractical, test the helper + a route-level guard.)
- Exit: editorial threads require problem access.

### A7. C2-H6 / A2-durability — restore + migrate audit durable, after file-restore (HIGH, 5-agent)
- Files: `src/app/api/v1/admin/restore/route.ts:168`; `src/app/api/v1/admin/migrate/import/route.ts:199`; `src/lib/audit/events.ts:275` (helper exists)
- Do: swap `recordAuditEvent({...})` → `await recordAuditEventDurable({...})`; move the restore audit to AFTER `restoreParsedBackupFiles` succeeds; past-tense summary; on file-restore failure record a second `database_restore_files_failed` durable audit.
- Tests: extend the restore audit test to (a) assert `recordAuditEventDurable` is the callee (not buffered), (b) assert audit fires after file-restore, (c) file-restore failure → failure audit present.
- Exit: restore audit survives a hard crash and reflects actual completion.

### A8. C2-H7 / A7-residual — gate X-Real-IP on trustedHops > 0 (HIGH)
- File: `src/lib/security/ip.ts:113-117`
- Do: only consult `x-real-ip` when `trustedHops > 0`. When `=0`, skip it and fall through to socket remote address / null. Update the comment.
- Tests: `TRUSTED_PROXY_HOPS=0` + spoofed `X-Real-IP` → ignored (returns socket/null); `=1` + `X-Real-IP` → respected.
- Exit: `=0` mode trusts no client-supplied IP header.

### A9. C2-M3 / AGG-20 — TS compiler workspace 0o700 (MEDIUM)
- File: `src/lib/compiler/execute.ts:735-747` (chmod 0o777/0o666 on chown-success and fallback branches)
- Do: mirror the Rust `executor.rs:331-360` 0o700/0o600 hardening.
- Tests: assert the chmod mode used (mock fs.chmod).
- Exit: no world/group-writable compiler workspace.

### A10. C2-M4 / AGG-16 — worker cleanup timeouts (MEDIUM, 3-agent)
- File: `judge-worker-rs/src/docker.rs:164,216,223` (`inspect_container_state`, `kill_container`, `remove_container`)
- Do: wrap each in `tokio::time::timeout(Duration::from_secs(10), …)`; log on timeout; best-effort skip (orphan sweep reaps).
- Tests: `cargo test` — a unit test asserting the timeout wrapper is present/used where feasible.
- Exit: cleanup calls cannot wedge the executor slot indefinitely.

### A11. C2-M5 / AGG-18 — code-similarity sidecar submission cap (MEDIUM, 4-agent, DoS)
- File: `code-similarity-rs/src/main.rs` (handler)
- Do: `const MAX_SUBMISSIONS: usize = 500; if submissions.len() > MAX_SUBMISSIONS { return (StatusCode::PAYLOAD_TOO_LARGE, ...) }` at the boundary. Keep the TS-side cap too.
- Tests: `cargo test` — payload with 501 submissions → 413.
- Exit: sidecar O(n²) is bounded at the boundary.

### A12. C2-M6 / SEC-9 + NEW-M1 — community scope centralization (MEDIUM)
- Files: `src/lib/discussions/permissions.ts` (new helper); callers `community/threads/[id]/posts/route.ts:38`, `community/votes/route.ts:62-68`, `community/threads/[id]/page.tsx:83`
- Do: one `assertProblemScopedThreadAccess`/`PROBLEM_LINKED_SCOPES = ["problem","editorial","solution"]` helper; call from all four sites (write + read + vote).
- Tests: each route denies the out-of-scope case; one Truth source.
- Exit: every community surface applies the same scope set.

### A13. designer REG-2 — problems/[id]/edit page strict gate (P1)
- File: `src/app/(dashboard)/problems/[id]/edit/page.tsx:34`
- Do: route the edit page's hidden-data visibility through strict `canManageProblem` (server-side), matching the API (A11). Strip referenceSolution/hidden testCases for non-managers in the page's data fetch.
- Tests: page-level/unit test asserting hidden data is not passed to a non-managing `problems.edit` holder.
- Exit: edit page and API agree.

### A14. Phase-A side-effect cleanup (LOWs — ride along)
- A14a C2-L1 / LOW-1: bump `tests/unit/infra/migration-drift-cleanup.test.ts` `testTimeout` to 120000.
- A14b C2-L2 / LOW-2: cast in `tests/unit/compiler/execute-implementation.test.ts:68` (`(process.env as Record<string,string|undefined>)`) so `tsc --noEmit` is clean.
- A14c C2-L3 / LOW-4: add `defaultLanguage` to `problems/[id]/export/route.ts` SELECT + round-trip test.
- A14d C2-L4 / LOW-3: rewrite the `tools.ts:68-74` comment to match the actual manual-coercion + `context.userId` scoping pattern (no false Zod claim), OR add per-tool Zod schemas. Prefer the comment fix (smaller, accurate); schemas tracked as a Phase B hardening.

### A15. Docs (small)
- A15a C2-D1 / AGG-53: rewrite `judge-worker-rs/src/validation.rs:84-86` docstring to match accept-when-trusted-list-non-empty behavior.
- A15b C2-D2: extend `AGENTS.md:427` deploy-hardening note to state all `.env*` files are 0600 + production startup guard (A1).
- A15c C2-D3 / AGG-51: `docs/api.md` CSRF section — document `Sec-Fetch-Site` + `Origin`/`Host` enforcement.
- A15d C2-D4 / AGG-52: AGENTS.md push-scan wording — align with `die()` behavior.

Gates (run after Phase A, all foreground): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`.

---

## Phase B — Carry-forward backlog (deferred to subsequent cycles; planned, NOT silently dropped)

Each is a security/correctness/data-loss or larger-design item with a concrete exit criterion. None are silently dropped; they are picked up in later cycles of this loop.

- **C2-M1 / AGG-1** Restore DB↔files atomicity (staging-then-rename). Design specified by architect PHB-1 (stage sibling dir → DB tx → atomic rename → old-reference sweep). Exit: post-commit FS failure cannot leave the DB referencing absent blobs.
- **C2-M2 / AGG-2** Snapshot/full-fidelity redaction bypass. Design per architect PHB-2: `mode:"snapshot"` + at-rest encryption + stricter capability + audit differentiation + retention. Couples to DOC-2/DOC-3 doc fixes. Exit: snapshots are faithfully restoreable (passwordHash/sessionToken present) without creating a secret-exfiltration path.
- **AGG-10 / SEC-4** Plaintext-decryption fallback default flip + one-shot re-encryption migration (rollback for unwrappable keys scoped). Exit: `allowPlaintext` defaults false; explicit opt-in.
- **AGG-14 / ARCH-2** Deploy topology defaults invert CLAUDE.md (`deploy-docker.sh:184-187` + source `.env.deploy.<target>`). Candidate for a near cycle (small). Exit: bare `./deploy-docker.sh` is safe-by-default per CLAUDE.md.
- **AGG-15 / FDR-1** Worker executor `catch_unwind` (defense-in-depth; staleness sweep is the net). Exit: panic reports `runtime_error` verdict.
- **AGG-17 / FDR-2** `MAX_TIME_LIMIT_MS` clamp — raise default and/or warn/reject at authoring. Exit: no silent TLE from clamp.
- **NEW-H5** Judge `/claim` shared-token fallback + default-open IP allowlist. Exit: claim requires registered `workerId` + per-worker hash; default-deny when no allowlist.
- **NEW-M2 / AGG-28** SSE re-auth must re-run `canAccessSubmission`. Exit: revoked group access closes the stream.
- **NEW-M3** Contest export JSON audit (`?download=1` omission). Exit: every PII export audited.
- **NEW-M4** Require `backup-manifest.json` for ZIP restore. Exit: manifest-less ZIPs rejected.
- **NEW-M5** `admin/settings` PUT password re-confirmation for privilege-affecting fields. Exit: stolen session cannot silently weaken posture.
- **NEW-M6 / AGG-25** `roles` PATCH actor-vs-target-current-level + full-cap re-validation. Exit: no lateral demotion/stripping of higher-priv custom roles.
- **NEW-M7** Recruiting-token brute-force race (move increment into tx + `FOR UPDATE` / atomic conditional UPDATE). Exit: concurrent attempts serialize.
- **NEW-M8** ZIP-bomb streaming decompression with incremental cap. Exit: OOM-before-cap impossible.
- **NEW-M9 / AGG-29** Anti-cheat Origin fail-closed when `AUTH_URL` unset in production. Exit: no Origin bypass.
- **AGG-21..24** Backup streaming + missing-file reporting + concurrent-restore advisory lock + upload snapshot.
- **AGG-26** Group ownership-transfer target validation; **AGG-30** anti-cheat IP rate framing; **AGG-31..35** crypto/config (key rotation, AUTH_SECRET entropy, CSRF Origin-required, hCaptcha throw).
- **AGG-36..40** Realtime/perf (SSE sharded lock, rankings ISR, announcements/clarifications pagination + SQL predicate, submissions global-count placement, audit IN-array → EXISTS). **F-1** canManageProblem per-request DB hit (fast-path students / memoize).
- **AGG-41 (bulk)** Convert the 117 fire-and-forget `recordAuditEvent` security-critical sites to durable (sub-cycle; flagship A7 lands this cycle). **AGG-43** crash-buffer durability.
- **AGG-43 / AGG-45** function-judging C++ family registry breadth (cpp17/20/26/clang_*). **AGG-54** migration journal duplicate-prefix regeneration. **AGG-55** orphaned `min_password_length` column drop.
- **AGG-63 / PB-1** user-deletion order assertion; **AGG-67 / PB-2** restore FK runtime test; **AGG-68 / PB-3** poll stale-token coverage.
- **Designer P1 batch:** AGG-58 (h1), AGG-59 (leaderboard hsl→oklch), AGG-60 (recruit form/aria-live), AGG-61 (loading/error states), UI-1 (composite opacity contrast), UI-2 (sidebar invalid color), UI-3 (tag swatch border), UI-4 (`<html nonce>` invalid), UI-5..10.
- **N2** Wall-clock total-judging cap (immutable `judgeClaimStartedAt`).

---

## Phase C — Deferred low-severity (with provenance)

Each records: file+line · original severity/confidence (NOT downgraded) · reason · exit criterion. None are security/correctness/data-loss. Repo rule permitting deferral of low-priority polish: AGENTS.md:438 ("Outstanding deferred deploy-script polish items ... LOW-severity defense-in-depth and observability improvements, all with concrete exit criteria").

- **AGG-44 / CR-29** rate-limiter overflow — **RESOLVED THIS CYCLE as non-issue** (`MAX_CONSECUTIVE_BLOCKS_EXP = 4`). Close.
- **SEC-16** `DUMMY_PASSWORD_HASH` constant. `src/lib/auth/config.ts:51-52`. LOW/HIGH. Cosmetic; timing-parity test is the safeguard. Exit: next Argon2 param change.
- **SEC-17** Session cookie `SameSite=Lax`. `src/lib/auth/config.ts:163`. LOW/HIGH. Theoretical. Exit: when a state-changing top-level-GET admin route is added.
- **SEC-20** `AUTH_TRUST_HOST=true` doc gap. `src/lib/security/env.ts`. LOW/MED. Docs. Exit: next runbook update.
- **SEC-21** API-key DB equality non-timing-safe. `src/lib/api/api-key-auth.ts:56-67`. LOW/LOW. 160-bit secret. Exit: if entropy reduced.
- **ARCH-6** gVisor promotion. docker-compose.*. MED/MED. Ops decision. Exit: after gVisor validation pass.
- **ARCH-8** Settings cache process-local drift. MED/MED. Single-instance targets. Exit: `APP_INSTANCE_COUNT > 1`.
- **ARCH-9** `judgeClaimToken` partial unique index. LOW/HIGH. nanoid suffices. Exit: next schema batch.
- **ARCH-10** Redundant `secret_token` drop paths. LOW/HIGH. Cross-ref. Exit: next migration cleanup.
- **AGG-12 / SEC-12** `postcss` XSS via `next`. MED/HIGH. Build-time, bundled. Exit: next `next` bump.
- **LOW-5..8** (A1 first-file-only check, CSV `#` row, health endpoint version leak, server-action missing-Origin dev bypass). LOW. Exit: batched hygiene cycle.
- **Designer P2** (D-11, D-16..D-32 minus the P1 promoted items). LOW. Exit: UX polish cycle.

## Progress Tracking (Phase A)
- [ ] A1 import skip-truncate absent tables
- [ ] A2 api-keys DELETE role gate
- [ ] A3 snapshot-null abort
- [ ] A4 language dockerImage allowlist
- [ ] A5 assignments accessCode projection
- [ ] A6 editorial thread access
- [ ] A7 restore+migrate durable audit after file-restore
- [ ] A8 X-Real-IP gate on trustedHops>0
- [ ] A9 TS compiler 0o700
- [ ] A10 worker cleanup timeouts
- [ ] A11 code-similarity sidecar cap
- [ ] A12 community scope centralization
- [ ] A13 problems/[id]/edit page strict gate
- [ ] A14 Phase-A side-effect LOWs (test timeout, tsc cast, defaultLanguage, tools comment)
- [ ] A15 Docs (validation.rs, AGENTS.md env, CSRF, push-scan)
