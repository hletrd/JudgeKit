# Cycle 1 (2026-07-06) RPF Review Remediation Plan

Source: `.context/reviews/_rpf-2026-07-06-cycle1-aggregate.md` (consolidated multi-agent
review, including late "DB / backup-restore additions") plus per-agent provenance files
(`architect.md`, `code-reviewer.md`, `critic.md`, `document-specialist.md`, `security-reviewer.md`).

Every finding from the aggregate is either scheduled here or recorded in
`plan/cycle-1-2026-07-06-rpf-deferred.md` with citation, severity, reason, and exit
criterion. Items already tracked with valid exit criteria in
`plan/cycle-4-2026-07-03-deferred.md` / `plan/cycle-2-2026-07-02-deferred.md` are
cross-referenced there, not re-opened.

Repo constraints honored: `src/lib/auth/config.ts` untouched; no Korean letter-spacing
changes; algo stays app-server-only; GPG-signed conventional+gitmoji commits, one logical
change each.

## Phase A — CRITICAL / HIGH (data-loss, correctness, security) — must land

- [ ] A1 CQ-CRIT — Restore cascade-wipes 5 tables missing from TABLE_ORDER (CRITICAL, data-loss).
      `src/lib/db/export.ts:199-245` lacks `contestAnnouncements`, `contestClarifications`,
      `sourceDrafts`, `passwordResetTokens`, `emailVerificationTokens`; `src/lib/db/import.ts:152-171`
      truncate + FK cascade destroys them unrecoverably (pre-restore snapshot also missing them).
      Fix: add the five tables to TABLE_ORDER at correct FK level (password/email tokens after
      users [L1]; sourceDrafts after users+problems [L2]; announcements/clarifications after
      assignments [L3]). Add/extend a coverage test asserting every exported pgTable in schema
      is in TABLE_ORDER (except intentionally excluded `realtimeCoordination` — document why).
- [ ] A2 PR-H1 — Positional sparse test-case merge corrupts test data on middle-row delete (HIGH, data-correctness).
      `src/lib/problem-management.ts:83` merges by array index; client serializer
      `src/lib/problems/test-case-drafts.ts:51-60` omits content by per-draft identity.
      Fix: track `_originalIndex` in drafts; serializer sends full content whenever a draft's
      outgoing position differs from its originally-loaded position (delete/reorder), sparse
      only when positions align. Unit tests: delete-middle, reorder, edit+delete combos.
- [ ] A3 H3 — `pg-volume-safety-check.sh` unguarded `rm -rf ${NAMED_SRC}/*` under sudo (HIGH, data-loss).
      `scripts/pg-volume-safety-check.sh:286`. Fix: `[[ -n "$NAMED_SRC" && -d "$NAMED_SRC" ]] || fatal`
      immediately before the clear; also validate NAMED_SRC re-derived from `docker volume inspect`.
- [ ] A4 H2 — `docker-compose.worker.yml` judge-worker missing `user: "0:0"` override (HIGH, judging outage on dedicated workers).
      `docker-compose.worker.yml:48-56` vs `docker-compose.production.yml` (commit 8129b03f).
      Fix: add identical `user: "0:0"` + rationale comment.
- [ ] A5 H4 + L11 — Recruiting redeem deadline gates (HIGH correctness/authz).
      Initial redeem (`src/lib/assignments/recruiting-invitations.ts:769-785`) never checks
      `assignments` effective close; comment at :708-712 falsely claims it does. Re-entry path
      (:664) checks bare `deadline`, ignoring `lateDeadline`.
      Fix: initial path — gate assignment SELECT on
      `COALESCE(lateDeadline, deadline) IS NULL OR > NOW()` and add matching EXISTS predicate to
      the atomic claim UPDATE; correct the comments. Re-entry path — use COALESCE(lateDeadline,
      deadline). Unit tests for closed / late-window / open.
- [ ] A6 H1 — judge-worker `chown_recursive` follows symlinks (HIGH, host-FS chown from root worker).
      `judge-worker-rs/src/workspace.rs:32-41`. Fix: use `lchown` (no follow) via
      `std::os::unix::fs::lchown` and gate recursion on `symlink_metadata().is_dir()`;
      add symlink regression test.
- [ ] A7 CQ-M1 — SSE close() `void releaseSharedSseConnectionSlot` with no `.catch` (process-crash risk).
      `src/app/api/v1/submissions/[id]/events/route.ts:354`. Fix: attach `.catch` + warn log.
- [ ] A8 PR-M1 — Tag 23505 recovery is dead code inside aborted PG tx (MED/High).
      `src/lib/problem-management.ts:172-187`. Fix: `INSERT ... ON CONFLICT (name) DO NOTHING
      RETURNING id` (drizzle `.onConflictDoNothing()`), then re-select on empty return — no
      exception, no tx abort.
- [ ] A9 PR-M2 — Duplicate-after-trim tags abort mutation on `pt_problem_tag_idx` (MED/High).
      `src/lib/problem-management.ts:156-190,199-202`. Fix: dedupe trimmed names + returned ids
      (Set) in `resolveTagIdsWithExecutor`/`syncProblemTags`.
- [ ] A10 SR-M5 — Vulnerable Rust deps (RUSTSEC-2026-0098/0099/0049/0104/0185; unsound anyhow/rand).
      Workspace root lockfile + per-crate lockfiles (docker standalone builds). Fix:
      `cargo update -p rustls-webpki -p quinn-proto -p anyhow -p rand` (and parents as needed)
      for the workspace and each of `judge-worker-rs`, `rate-limiter-rs`, `code-similarity-rs`
      standalone lockfiles until advisories clear; `cargo test --workspace` green.

## Phase B — User-injected TODOs

- [ ] B1 U1 — Remove `worv` / test.worv.ai from the active deploy-target roster.
      `deploy-docker.sh:145` known-target list + FATAL message + any worv branch logic;
      `docs/deployment.md` and `docs/deployment-automation.md` target tables;
      `.github/workflows/cd.yml` worv refs; `AGENTS.md` active-target refs.
      Historical incident notes may keep worv mentions. `deploy-test-backends.sh` /
      `docker-compose.test-backends.yml` remain in-tree but are NOT a live deploy target.
      DO NOT delete untracked local secrets `.env.deploy.worv` / `.env.worv` (user removes
      manually; they may hold unrecoverable credentials). Never deploy to test.worv.ai.
- [ ] B2 U2 — Disk-usage watch around deploy (procedural, this cycle's deploy step).
      `df -h` locally + oj.auraedu.me, algo.xylolabs.com, worker-0.algo.xylolabs.com
      (key `~/.ssh/xylolabs-algo.pem`, user ubuntu) before AND after DEPLOY_CMD; if any host
      >85% before deploy, free space per AGENTS.md pruning policy (repo post-deploy prune only;
      never `docker system prune --volumes`, never `image prune -a` on worker hosts). Do not set
      SKIP_POST_DEPLOY_PRUNE. Report before/after numbers per host.

## Phase C — MEDIUM correctness/security (land this cycle)

- [ ] C1 M1 — compile-timeout clamp panics when `JUDGE_COMPILE_TIMEOUT_MS` < 30000.
      `judge-worker-rs/src/executor.rs:65`. Fix: `.clamp(MIN, compilation_timeout_ms().max(MIN))`;
      unit test with low env value.
- [ ] C2 M2 — seccomp-init-failure detection matches submission-controlled stderr → false env-error verdicts.
      `judge-worker-rs/src/docker.rs:564-573`. Fix: only treat as seccomp init failure when the
      docker run itself failed to start the container (docker CLI exit 125/inspect start failure),
      never on captured container stderr alone; regression test with adversarial stderr.
- [ ] C3 M7 — PGPASSWORD in argv via `docker exec -e PGPASSWORD="$PG_PASS"` (visible in /proc cmdline).
      `deploy-docker.sh:1177,1337,1343,1356,1366`, `deploy.sh:179`, `scripts/backup-db.sh:41`,
      `scripts/pg-volume-safety-check.sh:255`. Fix: `export PGPASSWORD` in subshell + pass by
      name (`-e PGPASSWORD`), matching the existing docker-run pattern at :1418.
- [ ] C4 M6 — Unpinned deploy-time `npm install --no-save drizzle-kit drizzle-orm nanoid` on prod-DB migration path.
      `deploy-docker.sh:1420`, `deploy-test-backends.sh:251`. Fix: pin exact versions from
      package-lock.json.
- [ ] C5 M9 — Generated nginx lacks default_server catch-all; stale contradictory X-Forwarded-Host comment.
      `deploy-docker.sh:1630-1807`. Fix: emit `listen ... default_server` catch-alls returning
      444/421 (mirroring `scripts/online-judge.nginx.conf:11-16,26-37`); rewrite the stale
      comment at :1679 to reflect the July-5 AUTH_TRUST_HOST fix (X-Forwarded-Host = $host is
      required).
- [ ] C6 SR-M6 — Anti-cheat heartbeat Origin check NODE_ENV-gated.
      `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79`. Fix: remove the
      NODE_ENV gate so the Origin/Referer check always runs (uaHash JWT verification recorded as
      deferred hardening, see deferred D-SR-M6b).
- [ ] C7 SR-M7 — Recruiting candidate with deadline-less assignment can log in indefinitely.
      `src/lib/recruiting/access.ts:152-155`. Fix: when no effective cutoff exists, treat access
      as stale N days (default 30) after `redeemedAt`; keep existing cutoff behavior otherwise.
- [ ] C8 M10 — ICPC score-distribution histogram meaningless.
      `src/lib/assignments/contest-analytics.ts:106-122`. Fix: branch on scoringModel; ICPC
      distribution over problems-solved counts.
- [ ] C9 M11 — ICPC live-rank over-counts vs board tie definition.
      `src/lib/assignments/leaderboard.ts:182-186`. Fix: drop `last_ac_at`/`user_id`
      discriminators from the rank count.
- [ ] C10 M12 — IOI live-rank drops score overrides on unsubmitted problems.
      `src/lib/assignments/leaderboard.ts:220-235`. Fix: source per-problem set from
      score_overrides too (UNION/FULL JOIN + COALESCE).
- [ ] C11 M13 — participant-timeline IOI first-AC units mismatch (pct vs points).
      `src/lib/assignments/participant-timeline.ts:222-225`. Fix: compare `score >= 100`.
- [ ] C12 CQ-M2 — similarity representative ORDER BY score DESC is NULLS FIRST; no terminal-status filter.
      `src/lib/assignments/code-similarity.ts:335`. Fix: `score DESC NULLS LAST` + terminal
      status filter.
- [ ] C13 PR-M3 — `syncGroupAccessRows` check-then-act race loses access rows.
      `src/lib/problem-sets/management.ts:56-81`. Fix: `pg_advisory_xact_lock(hashtext(groupId))`
      at the top of the tx (or ON CONFLICT DO NOTHING + in-tx delete).
- [ ] C14 PR-M4 — Statement parser fence-unaware; `#` inside code fences parsed as headings.
      `src/lib/problem-statement.ts:57-58`. Fix: track ``` fence state; skip heading detection
      inside fences. Unit test.
- [ ] C15 M5 — seccomp-weakening env vars not fail-closed in production.
      `judge-worker-rs/src/config.rs:172-200`. Fix: refuse to start (or hard-ignore with error
      log) when weakening vars set and production mode detected.

## Phase D — LOW / hygiene batch (land as cycle time allows; anything not landed moves to deferred doc with record)

- [ ] D1 L2 — rate-limiter unchecked `block_ms * multiplier` / window add overflow.
      `rate-limiter-rs/src/main.rs:325,242,312`. Fix: saturating_mul/checked_add + clamp.
- [ ] D2 L3 — comparator trims only ` \t\r\n` (diverges from JS trim: VT/FF).
      `judge-worker-rs/src/comparator.rs:8,75-77`. Fix: include 0x0B/0x0C in trim set + test.
- [ ] D3 L7 — legacy route-group cleanup can hard-abort deploy under set -e.
      `deploy-docker.sh:965-978`. Fix: `|| warn`.
- [ ] D4 L10 — heartbeat throttle doc/comment says 60s, code is 30s.
      `docs/exam-integrity-model.md:52`, `src/lib/assignments/submissions.ts:52` vs
      `src/components/exam/anti-cheat-monitor.tsx:33`. Fix: correct doc + comment to 30s.
- [ ] D5 L13 — ICPC live-rank penalty uses absolute epoch minutes, no null-start guard.
      `src/lib/assignments/leaderboard.ts:166-170`. Fix: minutes-from-start + guard (with C9).
- [ ] D6 L14 — analytics first-AC/progression omit TERMINAL_SUBMISSION_STATUSES filter.
      `src/lib/assignments/contest-analytics.ts:185-190,262-268`. Fix: add terminal filter.
- [ ] D7 L15 — windowed getContestStatus ignores lateDeadline.
      `src/lib/assignments/contests.ts:53-56`. Fix: include lateDeadline in ContestEntry +
      status computation.
- [ ] D8 L16 — invalidateRankingCache deletes in-flight `_refreshingKeys`.
      `src/lib/assignments/contest-scoring.ts:88-92`. Fix: don't clear refreshing-keys marker on
      invalidate (only cache entries).
- [ ] D9 PR-L2 — public problem-set search case-sensitive LIKE.
      `src/lib/problem-sets/public.ts:74`. Fix: ILIKE with escape.
- [ ] D10 PR-L3 — catalog-number window lacks deterministic tiebreaker.
      `src/lib/problems/catalog-numbers.ts:45`. Fix: append `problems.id asc`.
- [ ] D11 PR-L5 — listPublicProblemSets paginates by createdAt only.
      `src/lib/problem-sets/public.ts:127-129`. Fix: `desc(problemSets.id)` tiebreaker.
- [ ] D12 SR-L9 — reset-password rate-limit key uses 8-char token prefix.
      `src/app/api/v1/auth/reset-password/route.ts:33`. Fix: key on full hashToken(token).
- [ ] D13 CQ-L2 — computeJsonLength ignores JSON string escaping → details collapse.
      `src/lib/audit/events.ts:56-76`. Fix: use JSON.stringify(value).length for strings.
- [ ] D14 L12 — lock-free RMW of invitation `metadata` clobbers brute-force counter.
      `src/lib/assignments/recruiting-invitations.ts:462-510`. Fix: row lock (`FOR UPDATE`)
      around read-modify-write inside a tx.
- [ ] D15 SR-L10 — postcss moderate advisory (GHSA-qx2v-qp2m-jg93) transitive via next.
      Fix: `npm audit fix` / overrides bump if non-breaking.

## Progress log

(updated during implementation)
