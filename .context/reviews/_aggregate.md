# Cycle 6 — Aggregated Review (streamlined single-pass — NO fan-out)

**Repo:** `/Users/hletrd/flash-shared/judgekit` · **Head:** `e89bb099` (cycle-5 close) · **Date:** 2026-06-27
**Method:** Per the orchestrator's streamlined-mode note, this cycle SKIPS the 11-agent review fan-out (structural stall in cycles 4/5). The cycle-6 author did a focused single-pass review directly: (a) regression-checked the small cycle-5 changed surface, (b) re-read the cited code for each carry-forward Phase B/C candidate to confirm it is still real, (c) picked a coherent, safely-testable subset.

**Carry-forward plans read:** `plan/cycle-{1..5}-2026-06-2{6,7}-review-remediation.md`. The cycle-5 `_aggregate.md` (7 per-agent files) is the last full fan-out and remains the authoritative severity source; this file only records the cycle-6 delta.

---

## HEADLINE

- **Cycle-5 regression check (single-pass): PASS.** Re-read the four cycle-5 code touches at HEAD:
  - `judge-worker-rs/src/main.rs:326-351` — registration failure is now always fatal (`std::process::exit(1)` in BOTH arms); the `allow_unregistered_mode=true` arm logs a FATAL explaining why unregistered mode is non-functional post-C4-2. Correct.
  - `main.rs:504-518` — startup reap-all sweep is wrapped in `tokio::select! { _ = &mut shutdown => return, _ = cleanup => {} }`. SIGTERM during the sweep is honoured. Correct.
  - `src/lib/plugins/secrets.ts:57-87` — plaintext-fallback warn-log added; `prefix` captured before the type-guard narrows; default still `true` (correctly NOT flipped — gated by audit rule). Correct.
  - `src/app/api/v1/admin/settings/route.ts` audit `details` + claim dead-conditional + accepted-solutions dead column — all as described in cycle-5 plan. No regression.
  - No code-behaviour regression observed. The cycle-5 doc regression (CSRF OR-semantics) was already fixed in `70982f76`.
- **Findings trend:** 112 → 25 → 28 → (cycle-4 MED+LOW) → 0 CRITICAL/0 HIGH-behaviour → **cycle-6: still 0 CRITICAL, 0 HIGH-behaviour.** Converging; no net-new severity escalation.
- **Cycle-6 scope (coherent security + perf + correctness subset):** NEW-M8 zip-bomb streaming cap (security OOM), AGG-41 audit-logs IN→EXISTS (perf), Designer P1 HSL→oklch (CSS correctness — vars are now `oklch(...)`, so `hsl(var(...))` is invalid CSS in 6 spots). Everything else deferred with provenance (severity preserved).

---

## STAGE 1 — Re-validated carry-forward candidates (re-read at HEAD)

Each candidate below was re-read at HEAD `e89bb099` to confirm it is still real before either implementing or deferring.

### IMPLEMENTED this cycle

- **NEW-M8 / C3-N8 — ZIP slow-path allocates full decompressed entry before the per-entry cap can fire (LOW-MED, security OOM).** `src/lib/files/validation.ts:96-107`. **Confirmed real.** The slow path does `const content = await entry.async("uint8array")` which materializes the ENTIRE decompressed payload into memory, THEN checks `content.length > MAX_SINGLE_ENTRY_DECOMPRESSED_BYTES`. A zip-bomb entry whose data-descriptor hides the size and that decompresses to gigabytes OOMs the process before line 100 runs. Fix: stream via JSZip `internalStream("uint8array")` + `on('data', ...)` with a running byte counter and early abort (`pause()` + reject) the moment the counter exceeds the cap. Perm-gated (authenticated upload) which is why this is LOW-MED not HIGH, but the fix is contained and testable. Test: synthesize a ZIP with one large deflated entry lacking metadata and assert the streaming cap rejects it without allocating the full payload.
- **AGG-41 — audit-logs instructor scope fans out to N+1 `IN`-array queries (MED perf, no correctness bug).** `src/app/api/v1/admin/audit-logs/route.ts:73-148`. **Confirmed real.** The instructor-scope branch pre-fetches `groupIds`, `assignmentIds`, `submissionIds`, `problemIds` (4 round-trips) then builds `inArray(auditEvents.resourceId, <array>)` clauses. For a teaching instructor with many groups/assignments this generates a large IN list and misses the DB's per-table selectivity. Restructure to `EXISTS` subqueries (one round-trip, DB-plannable). No behaviour change — the same rows are in-scope. Covered by the existing route tests asserting instructor scope filtering.
- **Designer P1 (HSL→oklch) — `hsl(var(...))` is now invalid CSS (LOW correctness, 6 spots).** `src/components/contest/leaderboard-table.tsx:346,349,395,414`; `src/components/ui/sidebar.tsx:473`; `src/app/(dashboard)/dashboard/admin/tags/tag-form-fields.tsx:63`. **Confirmed real and a correctness bug, not just polish.** `globals.css:52+` defines `--background`, `--foreground`, `--border`, `--sidebar-border`, `--sidebar-accent` as `oklch(...)` values. Wrapping an `oklch(...)` value in `hsl(...)` produces invalid CSS (`hsl(oklch(...))`) and the browser silently drops the declaration — the sticky-column border shadows / swatch border color are NOT being applied today. Fix: drop the `hsl()` wrapper and reference `var(--border)` etc. directly. No behavioural test (visual CSS), but `npm run lint` + `npm run build` guard the change.

### DEFERRED this cycle (provenance preserved, severity held)

- **C4-4 / AGG-10 (plaintext-decryption default flip) + NEW-B (`enc:v1:` key-version prefix + keyring) — MED, crypto hardening, PAIRED.** `src/lib/plugins/secrets.ts:61`; `src/lib/security/encryption.ts:78`. **Deferred under quoted repo rule `src/lib/security/encryption.ts:18-22`:** *"Hard removal of the fallback is DEFERRED until ... a dedicated audit cycle confirms all encrypted columns contain only enc:-prefixed values. Do NOT silently drop the fallback; preserve the warn-log audit trail."* Cycle-5 (`da8e6b1f`) just shipped the warn-log audit trail that IS the prerequisite for this review. The default-flip + re-encryption migration must wait for a production-logs review cycle confirming zero plaintext-fallback warns. NEW-B (versioned key format + keyring for zero-downtime rotation) is the natural companion to the default-flip and carries production-data risk if shipped without the migration. **Exit criterion:** after one deploy cycle with the warn-log ships and a review confirms zero plaintext-fallback warns in production logs, schedule a dedicated cycle to: (a) flip `decryptPluginSecret` default to `false`, (b) add `enc:v1:` versioned format to `encryption.ts` with backward-compat decrypt of legacy `enc:` values, (c) ship a re-encrypt migration. Both items are security-relevant; deferral is authorized by the quoted repo rule.
- **AGG-1 — Restore DB↔files atomicity (MED, design).** `src/app/api/v1/admin/restore/route.ts:178-200`. The DB transaction commits before the file-write loop; if files fail post-commit the DB references uploads that do not exist on disk. **Mitigations in place:** cycle-2 durable failure audit (`recordAuditEventDurable` at :189) + cycle-4 faithful pre-restore snapshot. **Exit criterion:** full staging-then-rename design (write files to a staging dir, then atomically rename into place after DB commit, with a janitor that reconciles orphaned staging dirs). This is design work beyond a single contained change and is deferred to a dedicated cycle. Mitigations keep this from being a silent data-loss vector today.
- **F-1 — `canManageProblem` fast-path + AsyncLocalStorage memoize (MED perf).** `src/lib/auth/permissions.ts:186-217`. Memoizing per-request via AsyncLocalStorage is a cross-cutting change (every capability resolver would need to opt in) and risks subtle bugs if the ALS context isn't propagated to a worker/deferred path. The simpler author/`groups.view_all` short-circuits are already in place (:192, :201). **Exit criterion:** introduce a request-scoped capability memoization helper with a focused test suite, then apply to `canManageProblem` and its peers together. Deferred to avoid half-applying a cross-cutting pattern in this cycle.
- **NEW-M8's companion debugger-N5** — startup reap-all worker-identity guard (LOW/MED, future topology only). `judge-worker-rs/src/docker.rs`. Single-worker-per-host is the documented topology; the guard only matters for a shared-host topology that does not exist today. Defer with provenance.
- **Test-gap batch (A8):** C4-A6 main.rs `active_tasks.fetch_sub` exactly-once accounting (the accounting is embedded in a `tokio::spawn` closure inside `main()` and is not unit-testable without a refactor extracting the task body — defer until that refactor); A11a migrate/import mirror tests (restore twin has 4); C4-N1-test auth-token lifecycle; C5-A3 snapshot output-byte behavioural test. All test-only, HIGH-ROI, zero prod risk — deferred only because they exceed this cycle's coherent subset. Severity preserved.
- **Designer P1 (h2→h1 page titles, 27 pages + 5 error.tsx)** — churn-heavy across 32 files for an a11y ranking fix. Defer to a dedicated a11y pass to avoid bloating this cycle's diff. Severity preserved (LOW a11y).
- **LOW Phase C backlog (unchanged):** C4-6 roles PATCH TOCTOU; C4-7 recruiting metadata clobber; C4-N2 lateral cap-strip; C4-8 executor.rs source 0o666; R3 inspect-timeout OOM-mask; R1 chown-fallback (accepted-by-design); AGG-12/SEC-12 postcss (next `next` bump); ARCH-2/3/4; tracer-N1/N2/N3; UI-16; SEC-16/17/20/21; ARCH-6/8; NEW-M9; C3-N9; feature-dev NEW-2. `AGENTS.md:438` permits deferral of LOW-severity defense-in-depth/observability polish.

---

## RECOMMENDED CYCLE-6 SCOPE (priority order, implemented this cycle)

1. **NEW-M8** — ZIP slow-path streaming cap with running-byte counter + early abort (security OOM). Test included.
2. **AGG-41** — audit-logs instructor-scope `IN`-array → `EXISTS` subqueries (perf, no behaviour change). Existing route tests guard scope semantics.
3. **Designer P1 (HSL→oklch)** — drop `hsl()` wrapper on 6 spots in 3 files (CSS correctness; the vars are now oklch).
4. **Defer with provenance:** C4-4/AGG-10+NEW-B (audit-rule-gated), AGG-1 (design work), F-1 (cross-cutting ALS), test-gap batch, h2→h1 batch, LOW Phase C.
