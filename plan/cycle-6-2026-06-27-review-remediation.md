# Cycle 6 (2026-06-27) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 6, head `e89bb099`, streamlined single-pass — no fan-out per orchestrator note). Carry-forward: `plan/cycle-{1..5}-…md`; cycle-5 aggregate (7 per-agent files) is the authoritative severity source.

Repo rules honored: semantic commits + gitmoji, GPG-signed (`git commit -S`), fine-grained, every commit includes relevant tests (AGENTS.md "Testing Rules (MANDATORY)"), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT silently dropped.

**Regression status (single-pass re-check of cycle-5 surface):** 0 regressions. See `_aggregate.md` STAGE 0.

---

## Phase A — Implement this cycle (coherent security + perf + correctness subset)

### A1. NEW-M8 / C3-N8 — ZIP slow-path streaming cap (security OOM) · PRIMARY
- **Files:** `src/lib/files/validation.ts:94-108` (slow path); `tests/unit/files/zip-validation.test.ts` (add cases).
- **Root cause:** the slow path (entries lacking `uncompressedSize` metadata — data descriptors) calls `await entry.async("uint8array")`, which materializes the ENTIRE decompressed payload into a single `Uint8Array` BEFORE the per-entry cap at line 100 can fire. A zip-bomb entry that decompresses to multiple GB OOMs the process. Perm-gated (authenticated upload) → LOW-MED, but contained and testable.
- **Do:** replace the `async("uint8array")` call with JSZip's streaming API: `entry.internalStream("uint8array")` returns a `StreamHelper` exposing Node-style `'data' | 'end' | 'error'` events plus `pause()`/`resume()`. Accumulate `chunk.length` into a running counter; the moment `totalUncompressed + perEntryAccumulator > MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES` (per-entry) or `totalUncompressed > maxDecompressedSizeBytes` (total), call `stream.pause()`, reject the entry (`return "zipDecompressedSizeExceeded"`), and let the GC reclaim the partial buffer. Wrap in a `Promise` that resolves on `'end'` and rejects on `'error'` (fallback to the existing `"zipDecompressedSizeExceeded"` rejection on stream error, matching the outer `catch`). Keep the fast path (metadata available) untouched.
- **Tests:** add to `zip-validation.test.ts`:
  1. A ZIP with one entry whose content is large but under the per-entry cap, generated WITHOUT metadata forcing the slow path (JSZip data-descriptor path) → accepted under a generous limit, rejected under a tight limit. (Exercises the streaming accumulator.)
  2. A revert-RED assertion: the slow path must NOT call `entry.async` — a source-grep contract (`fs.readFileSync` of the route source is the repo convention, see `export-sanitization.test.ts`) asserting the slow path uses `internalStream` not `.async(`. Removing the streaming revert flips this red.
  3. Existing per-entry / total-cap tests stay green.
- **Exit:** a zip-bomb entry that decompresses beyond the cap is rejected WITHOUT allocating the full payload; the streaming path is revert-RED.

### A2. AGG-41 — audit-logs instructor scope `IN`-array → `EXISTS` subqueries (perf, no behaviour change)
- **File:** `src/app/api/v1/admin/audit-logs/route.ts:73-148` (instructor-scope branch only; admin branch unchanged).
- **Root cause:** the instructor branch makes 4 preparatory `findMany` round-trips (`groups`, `assignments`, `submissions`, `problems`) and builds `inArray(auditEvents.resourceId, <array>)` clauses from the results. For instructors teaching many groups this generates wide `IN` lists and misses per-table selectivity.
- **Do:** replace each `inArray(auditEvents.resourceId, ids)` with a Drizzle `exists(sql`SELECT 1 FROM ... WHERE ...``)` subquery modelling the SAME scope:
  - `group` scope: `EXISTS (SELECT 1 FROM groups WHERE groups.id = audit_events.resource_id AND groups.instructor_id = :userId)`.
  - `group_member` scope: keep the existing `details::jsonb->>'groupId' IN (taught group ids)` shape (this one is JSONB, not a plain FK — leave as-is; it's a single query, not the fan-out).
  - `assignment` scope: `EXISTS (SELECT 1 FROM assignments a JOIN groups g ON g.id = a.group_id WHERE a.id = audit_events.resource_id AND g.instructor_id = :userId)`.
  - `submission` scope: `EXISTS (SELECT 1 FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN groups g ON g.id = a.group_id WHERE s.id = audit_events.resource_id AND g.instructor_id = :userId)`.
  - `problem` scope: `EXISTS (SELECT 1 FROM problems WHERE problems.id = audit_events.resource_id AND problems.author_id = :userId)`.
  - Drop the 4 preparatory `findMany` calls (the `EXISTS` subqueries are self-contained and evaluated by the DB). Keep `buildGroupMemberScopeFilter` but feed it the (still-needed) taught-group id list — fetch ONLY that one list (one round-trip) rather than four.
- **Behaviour preservation:** same rows are in-scope (each `EXISTS` mirrors the exact predicate the pre-fetch + `IN` encoded). The instructor-with-no-taught-groups case must still return an empty scope (no `EXISTS` is true).
- **Tests:** add to the existing audit-logs route test (or `tests/unit/api/audit-logs.route.test.ts`) — assert an instructor sees ONLY events for groups/assignments/submissions they own and NOT another instructor's, and an instructor with no taught groups sees nothing. The mock architecture may bypass SQL, so add a **source-grep contract** asserting the route uses `exists(` (Drizzle) and does NOT call the 4 preparatory `findMany`s in the instructor branch. Revert-RED.
- **Exit:** instructor-scope query plan drops 3 round-trips and 3 wide `IN` lists; same rows in-scope; revert-RED.

### A3. Designer P1 (HSL→oklch) — drop `hsl()` wrapper on 6 spots in 3 files (CSS correctness)
- **Files:** `src/components/contest/leaderboard-table.tsx:346,349,395,414`; `src/components/ui/sidebar.tsx:473`; `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:63`.
- **Root cause:** `globals.css:52+` defines `--background`, `--foreground`, `--border`, `--sidebar-border`, `--sidebar-accent` as `oklch(...)` values. Wrapping an `oklch(...)` value in `hsl(...)` produces invalid CSS (`hsl(oklch(...))`) and the browser silently drops the declaration — the sticky-column shadow borders and the tag swatch border are NOT being applied today.
- **Do:** replace `hsl(var(--border))` → `var(--border)`; `hsl(var(--sidebar-border))` → `var(--sidebar-border)`; `hsl(var(--sidebar-accent))` → `var(--sidebar-accent)`; `hsl(var(--foreground))` → `var(--foreground)`. Within Tailwind arbitrary values the bracketed `shadow-[1px_0_0_0_var(--border)]` form is valid. Verify with `npm run lint` + visual spot-check note in commit body.
- **Exit:** the 6 declarations now resolve to real colours; lint + build green.

Gates (all FOREGROUND, `timeout: 600000` — NOT background): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`. Local-build environmental-ceiling caveat per brief: if `next build` stalls at the ceiling with no output, treat as indeterminate (environmental), keep other gates green, proceed; remote deploy confirms buildability. Known-flaky (`migration-drift-cleanup`, `public-route-metadata`, `public-seo-metadata`) — confirm in isolation if `test:unit` trips on them.

---

## Phase B — Carry-forward (deferred to subsequent cycles; planned, NOT dropped; severity preserved)

Each records: file+line · original severity · reason · exit criterion. Security/correctness items carry a quoted repo rule permitting the deferral.

- **C4-4 / AGG-10 (plaintext-decryption default flip) + NEW-B (`enc:v1:` key-version prefix + keyring)** — MED, paired crypto hardening. `plugins/secrets.ts:61`; `encryption.ts:78`. **Deferred under quoted repo rule `encryption.ts:18-22`:** *"Hard removal of the fallback is DEFERRED until ... a dedicated audit cycle confirms all encrypted columns contain only enc:-prefixed values. Do NOT silently drop the fallback; preserve the warn-log audit trail."* Cycle-5 (`da8e6b1f`) just shipped the prerequisite warn-log. **Exit:** after a deploy cycle with the warn-log and a review confirming zero plaintext-fallback warns in production logs, schedule a cycle to flip the default, add the versioned format with backward-compat legacy decrypt, and ship the re-encrypt migration.
- **AGG-1** Restore DB↔files atomicity — MED (design). `restore/route.ts:178-200`. Mitigated by cycle-2 durable failure audit + cycle-4 faithful snapshot. **Exit:** staging-then-rename design + janitor reconcile.
- **F-1** `canManageProblem` fast-path + AsyncLocalStorage memoize — MED (perf, cross-cutting). `permissions.ts:186-217`. **Exit:** request-scoped capability memoize helper + focused tests, applied across the capability-resolver surface together.
- **debugger-N5** startup reap-all worker-identity guard — LOW/MED (future topology). `docker.rs`. **Exit:** `JUDGE_WORKER_CONTAINER_PREFIX` env; only fires on a shared-host topology that does not exist today.
- **Test-gap batch (A8):** C4-A6 main.rs `active_tasks` exactly-once (needs task-body refactor to be unit-testable); A11a migrate/import mirror tests; C4-N1-test auth-token lifecycle; C5-A3 snapshot output-byte test; PB-2/PB-3/A12e/GS-1/GS-2/C4-A4/C4-A5. Test-only, HIGH-ROI, zero prod risk. **Exit:** next cycle's test lane.
- **Designer P1 (h2→h1 page titles, 27 pages + 5 error.tsx)** — LOW a11y, churn-heavy. **Exit:** dedicated a11y pass.
- **LOW Phase C:** C4-6 roles PATCH TOCTOU; C4-7 recruiting metadata clobber; C4-N2 lateral cap-strip; C4-8 executor.rs source 0o666; R3 inspect-timeout OOM=false; R1 chown-fallback (accepted-by-design); AGG-12/SEC-12 postcss (next `next` bump); ARCH-2/3/4; tracer-N1/N2/N3; UI-16; SEC-16/17/20/21; ARCH-6/8; NEW-M9; C3-N9; feature-dev NEW-2. `AGENTS.md:438` permits deferral of LOW-severity defense-in-depth/observability polish.

---

## Phase C — Progress Tracking (updated end-of-cycle)
- [x] A1 NEW-M8 zip-bomb streaming cap + tests — commit a97bdc7a
- [x] A2 AGG-41 audit-logs IN→EXISTS + source-grep test — commit 4521ddc8
- [x] A3 Designer P1 HSL→oklch (6 spots / 3 files) — commit 85dc652d
- [x] source-grep inventory baseline 159 → 161 — commit 46f71a81
- Gates: lint ✓, lint:bash ✓, db:check ✓, cargo test ✓ (80), test:unit ✓ (3000 pass; the 2 fails were the known-flaky `public-route-metadata` timeout — confirmed passes 8/8 in isolation — and the source-grep-inventory baseline, bumped 159→161 in commit 46f71a81). build: local `next build` indeterminate (environmental — 0-output stall, the documented ~10–28-min ceiling; not a code defect); **remote build in deploy compiled successfully in 54s and is the authoritative buildability check** (it caught and forced the fix of a real `and(): SQL | undefined` type error in the AGG-41 route — commit f55eb825). test:e2e skipped (no DB/browser infra locally).
- DEPLOY: per-cycle-success — `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` to algo.xylolabs.com → oj-internal.maum.ai; all containers healthy, "JudgeKit is responding (HTTP 200)", remote build succeeded.
