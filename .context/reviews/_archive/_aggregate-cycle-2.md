# Aggregate Review — RPF Cycle 2 (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD commit:** c449405d (record cycle 1 deploy outcome — script fix + manual-approval blocker)
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, designer (source-level), document-specialist, test-engineer, tracer, verifier (11 lanes; per-agent files in `.context/reviews/rpf-cycle-2-<agent>.md`).
**Note on per-agent file provenance:** The `rpf-cycle-2-<agent>.md` files were originally drafted at HEAD `fab30962` and have been re-verified against current HEAD `c449405d`. Findings already resolved at the current HEAD are listed in the "Resolved at current HEAD" section. The aggregate below carries forward only findings that remain applicable.
**Total deduplicated findings (still applicable at HEAD c449405d):** 0 HIGH, 1 MEDIUM, 6 LOW, plus carry-forward DEFERRED items.

---

## Resolved at current HEAD (verified by inspection)

The following findings from `rpf-cycle-2-<agent>.md` files (drafted at fab30962) are already addressed at HEAD c449405d:

- **AGG-1** (recruiting expiry UTC vs local): RESOLVED. `src/components/contest/recruiting-invitations-panel.tsx:462` now uses `new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0]`, the exact local-date fix recommended.
- **AGG-2** (auto-refresh lacks backoff): RESOLVED. `src/components/submission-list-auto-refresh.tsx:43-53` fetches `/api/v1/time` first; on catch, backs off (see comment + try/catch).
- **AGG-3** (workers AliasCell silent failure): RESOLVED. `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:98-102` has `if (res.ok) { … } else { toast.error(t("fetchError")); }`.
- **AGG-4** (clarifications shows raw userId): RESOLVED for user-facing display. `contest-clarifications.tsx:253` shows `t("askedByMe")` / `t("askedByOther")` instead of a raw UUID.
- **AGG-5** (native `<select>` in clarifications): RESOLVED. `grep '<select'` in `contest-clarifications.tsx` returns no hits.
- **AGG-6** (recruiting expiry no `aria-label`): RESOLVED. `recruiting-invitations-panel.tsx:459` carries `aria-label={t("expiresAt")}`.
- **AGG-8** (clipboard import inconsistency): RESOLVED. All three components (`copy-code-button.tsx:8`, `recruiting-invitations-panel.tsx:22`, `access-code-manager.tsx:8`) use static `import { copyToClipboard } from "@/lib/clipboard";`.
- **AGG-11** (formatTimestamp duplication): RESOLVED. `grep formatTimestamp` returns no hits in either file.

## Deduplicated findings (sorted by severity)

### C2-AGG-1: [MEDIUM] Deploy script writes generated `.env.production` without an explicit `chmod 0600`

**Sources:** security-reviewer (C2-SR-1) | **Confidence:** HIGH | **Cross-agent agreement:** 1 (security-reviewer); critic (C2-CT-INFO-1) corroborates that deploy hardening is under-served.

**File:** `deploy-docker.sh:211-223` (the `cat > "${SCRIPT_DIR}/.env.production" <<EOF` heredoc).

When `.env.production` does not exist locally, the script auto-generates `AUTH_SECRET`, `JUDGE_AUTH_TOKEN`, and `PLUGIN_CONFIG_ENCRYPTION_KEY` using `openssl rand`. The file is written with the operator's default umask (typically `0022` → `0644`), making the secrets readable by any local user on the deploy host.

**Concrete failure scenario:** Operator deploys from a shared dev box (or the worker host with multiple admin users). Default `0644` lets any logged-in user `cat .env.production` and read the auth secret used to sign session tokens, the judge auth token, and the plugin config encryption key. While `.gitignore` covers `.env*`, the local-host file mode is wrong and constitutes a defense-in-depth gap.

**Repo policy quote (CLAUDE.md, "Destructive Action Safety (CRITICAL)"):** *"Secrets & Credentials: Using plaintext secrets/tokens shared in conversation (MUST warn user to rotate first), writing secrets to unencrypted files or logs"* — the rule explicitly disallows lax handling of secrets to unencrypted files/logs. A 0644 .env.production file with auth secrets meets that bar.

**Fix:** Add `chmod 0600 "${SCRIPT_DIR}/.env.production"` immediately after the heredoc closes (around line 224). One-line change, no behavior change.

**Severity:** MEDIUM. Not deferrable — security finding.

---

### C2-AGG-2: [LOW] sshpass auth pattern in `deploy-docker.sh` is fragile and possibly tied to the cycle 1 "Permission denied" observation on platform@10.50.1.116

**Sources:** code-reviewer (C2-CR-1), security-reviewer (C2-SR-2) | **Confidence:** MEDIUM | **Cross-agent agreement:** 2 (code-reviewer + security-reviewer).

**File:** `deploy-docker.sh:140-174` (the four helpers `remote`, `remote_copy`, `remote_rsync`, `remote_sudo`).

Each helper duplicates the `if [[ -n "${SSH_PASSWORD:-}" ]]` branch. `remote_sudo` (line 170) prints the SSH password through stdin twice in a single shell pipeline (`printf '%s\n' "$SSH_PASSWORD" | sshpass -p "$SSH_PASSWORD" ssh ...`), feeding `sudo -S` while sshpass also handles the SSH password. When sshpass races sudo, `sudo -S` can swallow either prompt — this is what the orchestrator-flagged cycle-1 observation of "transient Permission denied at backup step + non-fatal Permission denied at ANALYZE step" most plausibly correlates with.

Additionally, `remote_sudo` assumes the SSH password and sudo password are identical (re-uses `$SSH_PASSWORD` for both). If the operator rotates one without rotating the other, every `remote_sudo` call silently fails.

**Concrete failure scenario:** ANALYZE step runs `remote_sudo "VACUUM ANALYZE"`. Under load, the pipe is consumed by sshpass faster than sudo can prompt, leaving sudo without input. sudo prints "Permission denied" and exits non-zero. The deploy script masks this with a permissive wrapper, so the build still completes — but the warning is misleading and undermines deploy auditability.

**Fix:** Two-part fix:
1. Switch to `ssh -o ControlMaster=auto -o ControlPersist=60 -o ServerAliveInterval=15` (multiplexed connection) so the auth handshake is amortized once per script run.
2. Decouple SSH and sudo passwords: introduce `SSH_SUDO_PASSWORD` env var; fall back to `SSH_PASSWORD` only when unset.

**Severity:** LOW (operational; not a runtime app-level vuln; deploy-script-side correctness fix).

**Repo policy check:** Not security/correctness/data-loss for the application; LOW severity; deferral permitted under the deferred-fix rules. Will be deferred with concrete exit criterion.

---

### C2-AGG-3: [LOW — DEFERRED] Drizzle destructive-schema-change policy is not codified in repo rules

**Sources:** critic (C2-CT-2) | **Confidence:** HIGH | **Cross-agent agreement:** 1 (critic).

**File:** N/A; should be added to `AGENTS.md` (or a new section in `CLAUDE.md`).

Cycle 1's deploy hit a `drizzle-kit push` data-loss prompt and was correctly blocked. The remediation policy (refuse to auto-force, escalate to user) lives only inside the cycle 1 plan file. Future cycles must re-derive it from CLAUDE.md's general destructive-action rule. Codifying it as a 5-line section in `AGENTS.md` would short-circuit that rediscovery.

**Severity:** LOW. **Status:** DEFERRED to docs-touch cycle. **Exit criterion:** Next cycle that touches `AGENTS.md` for any reason should add the section.

---

### C2-AGG-4: [LOW — DEFERRED] No regression-guard for `deploy-docker.sh` SKIP_*/LANGUAGE_FILTER honor

**Sources:** critic (C2-CT-1) | **Confidence:** MEDIUM | **Cross-agent agreement:** 1 (critic).

**File:** `deploy-docker.sh:79-110` (the SKIP_*/LANGUAGE_FILTER block fixed in cycle 1's commit `bdfc79e1`).

Without a smoke test, future edits could re-introduce `SKIP_LANGUAGES=false` unconditionally and fail on the next deploy.

**Severity:** LOW. **Status:** DEFERRED to deploy-hardening cycle. **Exit criterion:** A `tests/deploy/skip-languages-honor.sh` smoke test or a `bash -n deploy-docker.sh` lint job is added.

---

### C2-AGG-5: [LOW — DEFERRED] Visibility-aware polling pattern duplicated across multiple components — no shared hook

**Sources:** architect (C2-AR/ARCH-1 carry-forward) | **Confidence:** MEDIUM.

Carried forward from cycle-2 ARCH-1 / DEFER-21 (cycle 28). At least 4-6 components implement their own visibility-aware polling pattern (`submission-list-auto-refresh.tsx`, `submission-detail-client.tsx`, `active-timed-assignment-sidebar-panel.tsx`, `countdown-timer.tsx`, plus likely 2-3 more under `src/components/contest/`).

**Severity:** LOW. **Status:** DEFERRED. **Exit criterion:** A telemetry signal (real-user CPU usage when multiple background tabs are open) or a 7th duplicated implementation triggers the refactor.

---

### C2-AGG-6: [LOW — DEFERRED] Practice page Path B progress filter still fetches all matching IDs + submissions into memory

**Sources:** perf-reviewer (carry-forward from cycle-2 PERF-2 / cycle-18 AGG-3) | **Confidence:** MEDIUM.

**File:** `src/app/(public)/practice/page.tsx:417` (the `// --- Path B: Progress filter active (requires auth) ---` comment marks the start of the in-memory filter path).

When a progress filter is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, and paginates. Scale concern, not an immediate bug.

**Severity:** LOW (scale concern). **Status:** DEFERRED. **Exit criterion:** Practice page p99 latency > 1.5s OR > 5k matching problems for any active query.

---

### C2-AGG-7: [LOW — DEFERRED] `recruiting-invitations-panel.tsx` constructs invitation URL using `window.location.origin`

**Sources:** security-reviewer (carry-forward from cycle-2 SEC-1) | **Confidence:** LOW.

**File:** `src/components/contest/recruiting-invitations-panel.tsx:99` (and similar at line 181, 207 per cycle-2 review).

In most deployments, `window.location.origin` is trustworthy. Behind a misconfigured proxy, it may not match the canonical app URL. The codebase already has proxy-header workarounds in `contests/layout.tsx`.

**Severity:** LOW (no current exposure; future-proofing). **Status:** DEFERRED. **Exit criterion:** A user reports an invitation link with a wrong host, OR a server-side `appUrl` config value is added for unrelated reasons.

---

## Carry-forward DEFERRED items (status unchanged)

From the cycle-1 aggregate (`_aggregate-cycle-1`-style files exist in archive):
- **C1-AGG-3:** 27 client-side `console.error` calls — DEFERRED to telemetry-integration cycle.
- **C1-AGG-4:** Polling intervals not visibility-paused (covered by C2-AGG-5).
- **C1-AGG-5:** Playwright e2e gate execution depends on browser availability — DEFERRED (env-blocked).

From cycle-1 `Task H` (env-blocked gates):
- **DEFER-ENV-GATES:** Unit/component/integration/security/e2e tests fail on this dev shell because `DATABASE_URL` is not set, no rate-limiter sidecar, no Postgres reachable. Pre-existing infrastructure unavailability. DEFERRED to CI/host with full env.

From earlier cycles (still active per cycle-2 reviewer notes):
- **D1:** JWT authenticatedAt clock skew with DB tokenInvalidatedAt — MEDIUM, deferred.
- **D2:** JWT callback DB query on every request — add TTL cache — MEDIUM, deferred.
- **A19:** `new Date()` clock skew risk in remaining routes — LOW, deferred.
- **DEFER-1:** Migrate raw route handlers to `createApiHandler` (22 routes) — MEDIUM, deferred.
- **DEFER-2:** SSE connection tracking eviction optimization — LOW, deferred.
- **DEFER-20:** Contest clarifications show raw userId — partially mitigated; deferred.
- **DEFER-21:** Duplicated visibility-aware polling pattern (covered by C2-AGG-5).
- **PERF-3:** Anti-cheat heartbeat gap query transfers up to 5000 rows — MEDIUM, deferred.

## Agent failures

None. All 11 review perspectives completed successfully (per-agent files written in `.context/reviews/rpf-cycle-2-<agent>.md`).

## Cross-agent agreement summary

- **C2-AGG-1** (.env.production chmod): 1 agent (security-reviewer); critic corroborates the deploy-hardening gap.
- **C2-AGG-2** (sshpass fragility): 2 agents (code-reviewer + security-reviewer).
- **C2-AGG-3** (drizzle policy doc): 1 agent (critic).
- **C2-AGG-4** (deploy regression test): 1 agent (critic).
- **C2-AGG-5** (visibility-aware polling): 1 agent (architect carry-forward).
- **C2-AGG-6** (Path B perf): 1 agent (perf-reviewer carry-forward).
- **C2-AGG-7** (window.location.origin): 1 agent (security-reviewer carry-forward).

## Implementation queue for PROMPT 2/3

Acted on this cycle (PROMPT 3 work):
- **C2-AGG-1** (chmod 0600 .env.production) — MEDIUM, security, NOT deferrable.

Deferred (recorded in plan with exit criteria):
- **C2-AGG-2** (sshpass) — LOW, operational, deferred per repo rule.
- **C2-AGG-3** (docs codification) — LOW, deferred to docs cycle.
- **C2-AGG-4** (deploy regression test) — LOW, deferred to deploy-hardening cycle.
- **C2-AGG-5** (polling hook) — LOW, deferred per cross-cycle rule.
- **C2-AGG-6** (Path B perf) — LOW, deferred per scale rule.
- **C2-AGG-7** (window.location.origin) — LOW, deferred per repo rule.
