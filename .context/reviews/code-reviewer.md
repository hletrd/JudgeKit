# Code Review — Cycle 4

**Repo:** `/Users/hletrd/flash-shared/judgekit` · **Head:** `edd45cca` · **Cycle:** 4 (review-plan-fix loop)
**Scope:** (a) regression-check 13 cycle-1/2/3 fixes · (b) re-validate deferred items · (c) net-new hunt
**Coverage:** direct read of every priority-(a) file + twin server-action + schema + frontend form + cross-file sweep (`canAccessSubmission`, `onConflictDoUpdate` sites, invite/restore/migrate routes)

**Rigor note (per lead):** severity held tight. No CRITICAL. Findings trended 112→25 over cycles 1-3 and the changed surface is genuinely clean — this cycle produced 1 MEDIUM + 3 LOW, each with a concrete failure scenario. Nothing is inflated to keep the count up.

### By Severity
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 1 (C4-N1 settings PUT partial-wipe, which also defeats the cycle-3 reconfirm gate)
- LOW: 3 (C4-N2 equal-level cap-stripping residual; C4-N3 accepted-solutions pagination under-fill; C4-N4 SSE stale caps on terminal event)
- INFO: 2 (executor source-file 0o666 vs runner 0o600 divergence; A9 deploy-docker per-target sourcing still real)

---

## Stage 1 — Spec Compliance (REGRESSION CHECK)

All 13 cycle-1/2/3 changed-surface files re-read in full context. **No production regression found in any of them.** Every fix achieves its stated purpose.

| Fix | File:line | Verdict |
|---|---|---|
| Worker `catch_unwind` (AGG-15/C3-AGG-9) | `judge-worker-rs/src/main.rs:559-591`; helper `executor.rs:918-937`, `main.rs:22-29` | VERIFIED — `AssertUnwindSafe(exec_fut).catch_unwind()` traps the panic, `report_panic` emits `runtime_error`, and `active_tasks.fetch_sub(1)` runs *after* the catch (L589) so the capacity counter decrements on the panic path too. Stale-sweep is no longer the only net. |
| Worker `MAX_TIME_LIMIT_MS` clamp warn (AGG-17) | `judge-worker-rs/src/executor.rs:529-540` | VERIFIED — single `tracing::warn!` when `time_limit_ms > max_time_limit_ms()`; cheap, fires only for API/imported problems (UI caps at 10s). |
| Runner sidecar chown + 0o700 (C3-AGG-5) | `judge-worker-rs/src/runner.rs:831-881` | VERIFIED — `chown(65534:65534)` → `0o700` on success / `0o777` fallback; source file `0o600`/`0o666` (L874-881). Source-text contract test at L198-213 pins it. |
| Executor workspace chown + 0o700 (cycle-1) | `judge-worker-rs/src/executor.rs:320-360` | VERIFIED — unchanged and correct. |
| `cannotEditHigherRole` gate (C3-AGG-2) | `src/app/api/v1/admin/roles/[id]/route.ts:94-96` | VERIFIED — `if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403)` before any mutation. Blocks strictly-higher demotions. **Residual:** equal-level case still open (C4-N2). |
| `admin/settings` PUT password reconfirm (C3-AGG-7) | `src/app/api/v1/admin/settings/route.ts:91-110` | VERIFIED for explicit sensitive keys — **but** the gate is defeated for the hcaptcha/secret path by the partial-wipe bug (C4-N1). The fix is correct in isolation; the sibling wipe undermines it. |
| Community threads/votes via scoped helper (C3-AGG-4) | `community/threads/route.ts:29`; `community/votes/route.ts:83` | VERIFIED — both now call `canAccessProblemScopedThread`. Helper `discussions/permissions.ts:29-37` is the single source of truth. |
| Contest export JSON audit unconditional + durable (C3-AGG-1) | `contests/[assignmentId]/export/route.ts:117-127` | VERIFIED — `recordAuditEventDurable` moved out of the `isDownload` block; every JSON PII read audited. |
| `freezeLeaderboardAt` strip (C3-N6) | `groups/[id]/assignments/route.ts:85` | VERIFIED — stripped alongside `accessCode` for non-managers. |
| accepted-solutions `total` WHERE filter (C3-N7) | `problems/[id]/accepted-solutions/route.ts:51-56` | VERIFIED for the **count** — **but** the list SELECT was not updated (C4-N3). |
| SSE re-auth re-runs `canAccessSubmission` (C3-AGG-6) | `submissions/[id]/events/route.ts:475-482` | VERIFIED — re-fetches the row and re-runs `canAccessSubmission`; `canAccessSubmission` signature (`permissions.ts:292`) takes `{userId, assignmentId}` which the refreshed row satisfies. **Residual:** stale `caps` on the terminal event (C4-N4). |
| Recruiting metadata tx + `FOR UPDATE` (C3-AGG-3) | `src/lib/assignments/recruiting-invitations.ts:396-434` | VERIFIED — SELECT … `.for("update")` inside `db.transaction`; `_sys.*` keys preserved from the locked row; serializes against `jsonb_set` increments. |

**Phase-B side-effect re-confirm:** `redeemRecruitingToken` atomic claim (L768-800) and the brute-force counter paths (L96-144) remain textbook-correct.

---

## Stage 2 — Deferred Items Re-validation

| Item | Status | Evidence |
|---|---|---|
| **A9** deploy-docker per-target env sourcing | STILL REAL (LOW, deferred ok) | `deploy-docker.sh:119-123` sources only `.env.deploy`. No `--target=` block sources `.env.deploy.algo/.worv/.auraedu`. Bare invocation still defaults `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`, `SKIP_LANGUAGES=false`, contradicting CLAUDE.md for the algo app server. Operator workaround (env vars / `--no-worker --skip-worker-build --skip-languages`) exists, so bounded. |
| **A11a** migrate-import 0 snapshot/audit tests | STILL REAL (test gap — **test-engineer lane**) | `admin/migrate/import/route.ts` code is correct: reconfirm (L68/L180), snapshot gate (L102/L215), durable post-commit audit (L123/L233). The gap is coverage, not logic. Cross-agent overlap: test-engineer. |
| **C4-N1** (this cycle) | The settings PUT reconfirm gate (C3-AGG-7) is undermined — see net-new. | `admin/settings/route.ts:136-169` |
| AGG-1 / AGG-10 / NEW-M8 / AGG-41 / AGG-43/45 / AGG-54/55 | Not re-opened this cycle | Design-heavy; remain tracked in the cycle-3 aggregate. No line-level change since cycle 3 that would close them. |

---

## Stage 3 — Net-New Findings

### MEDIUM

**[MEDIUM] C4-N1 — `PUT /api/v1/admin/settings` partial update wipes every unspecified field, silently disabling hCaptcha / public signup and bypassing the cycle-3 reconfirm gate**
- Files: `src/app/api/v1/admin/settings/route.ts:136-169` (the wipe); contrast correct twin `src/lib/actions/system-settings.ts:139-222`.
- Confidence: HIGH (confirmed by reading both code paths)
- Status: confirmed

**Why it's a problem.** The route handler builds `baseValues` **unconditionally**, defaulting every core field, then upserts with `onConflictDoUpdate({ set: baseValues })`:
```ts
const baseValues = {
  siteTitle: siteTitle ?? null,
  platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
  publicSignupEnabled: publicSignupEnabled ?? false,
  signupHcaptchaEnabled: signupHcaptchaEnabled ?? false,
  hcaptchaSiteKey: hcaptchaSiteKey ?? null,
  hcaptchaSecret: hcaptchaSecret ? encrypt(hcaptchaSecret) : null,   // ← wipes the stored secret
  ...
};
```
Numeric config keys and `allowedHosts` *are* guarded (only written if provided) — but the boolean/string/secret fields above are written on every call. A PUT that supplies only `{ siteTitle: "x" }` overwrites `hcaptchaSecret → null`, `signupHcaptchaEnabled → false`, `publicSignupEnabled → false`, `platformMode → default`, etc.

The server action `updateSystemSettings` does this correctly — it guards **every** field with `hasOwnInput(key)` (`system-settings.ts:144-218`) so omitted fields are preserved. The dashboard form calls the server action, so the UI path is safe. The **public REST endpoint** is the one that is broken, and it is reachable by any `system.settings`-capable session.

**Failure scenario (two flavors):**
1. *Data loss:* an admin (or script/external integration) hits `PUT /api/v1/admin/settings` to tweak one numeric limit and silently destroys the stored hCaptcha secret, site title, platform mode, and signup flags.
2. *Reconfirm-gate bypass (security-posture):* the cycle-3 reconfirm gate (C3-AGG-7) only triggers when an **explicit** sensitive key is in the payload (`touchesSensitiveKey`, L91-93). A stolen admin session cookie sending `{ siteTitle: "x" }` passes no sensitive key → no `currentPassword` required → yet the wipe clears `hcaptchaSecret` and flips `signupHcaptchaEnabled`/`publicSignupEnabled` as a side effect. The password-reconfirm protection that was supposed to gate security-posture changes is bypassed without the password.

**Fix.** Mirror the server action: only write a field when it was actually supplied. Either (a) replace the unconditional `baseValues` with `hasOwnInput(key)`-guarded assignments exactly like `system-settings.ts:144-222`, or (b) for the API path, build `updateData` from defined fields and use a dynamic update set. The route should also destructure/handle `smtpPass`, `emailVerificationRequired`, `communityUpvoteEnabled`, `communityDownvoteEnabled`, `homePageContent`, `footerContent`, `defaultLocale` — currently they are dropped by the `allowedConfigKeys` whitelist and can never be set via the API (the route is a partial implementation of the settings schema).

**Negative test:** `PUT { siteTitle: "x" }` (no sensitive key, no currentPassword) → stored `hcaptchaSecret`/`publicSignupEnabled` unchanged.

---

### LOW

**[LOW] C4-N2 — roles PATCH still permits equal-level peer cap-stripping**
- File: `src/app/api/v1/admin/roles/[id]/route.ts:94-109`
- Confidence: HIGH (code does this) · Status: confirmed

The new `cannotEditHigherRole` gate (L94) compares `role.level > creatorLevel`, so it blocks only *strictly-higher* targets. A peer admin at the same level can still strip capabilities they do not hold from an equal-level custom role: existing caps `{a,b,c,d}`, PATCH `{capabilities:[a,b]}` — `added` filter (L104) is empty (nothing new), so the `ungrantable` check passes; `c,d` are silently removed by an actor who never had them. The capability-add guard's stated rationale ("capabilities already on the role may remain") does not cover *removal* of caps the actor lacks.

**Failure scenario:** an admin weakens another admin's custom role at the same level (removal-only; cannot elevate). Blast radius is bounded — no level raise, no cap add — so LOW.

**Fix:** also gate removals — e.g. `const removed = existingCaps.filter(c => !newSet.has(c)); if (removed.some(c => !caps.has(c))) return apiError("cannotRemoveCapabilityYouLack", 403);` — or tighten the policy to "target capabilities must be a subset of the actor's resolved caps" if the deployment intends peer roles to be fully mutually-isolated.

---

**[LOW] C4-N3 — accepted-solutions list query does not filter `shareAcceptedSolutions` in SQL, so pages under-fill (C3-N7 fix was half-applied)**
- File: `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:51-56` (count, fixed) vs `83-88` + `91-106` (list, not fixed)
- Confidence: HIGH · Status: confirmed

Cycle-3 added `eq(users.shareAcceptedSolutions, true)` to the **count** query's WHERE (L55) so `total` matches the rendered set. The **list** SELECT (L83-88) still uses the unfiltered `whereClause`, then JS-filters at L92. Result: non-sharing authors' rows consume `pageSize`/`offset` slots and are then discarded, so a page can render fewer than `pageSize` solutions even when more sharing solutions exist beyond the offset (and `total` overstates what is reachable).

**Failure scenario:** a "newest" page of 10 returns 4 solutions because 6 slots were taken by opt-out authors; "X results" never reconciles with what is paged through.

**Fix:** add `eq(users.shareAcceptedSolutions, true)` to `whereClause` (or a separate list WHERE) and drop the now-redundant `.filter` at L92 so pagination is computed entirely in SQL.

---

**[LOW] C4-N4 — SSE terminal-result event is sanitized with stale capabilities**
- File: `src/app/api/v1/submissions/[id]/events/route.ts:344` (caps resolved once) + `405-429` (`sendTerminalResult` uses captured `caps`)
- Confidence: MEDIUM (defense-in-depth) · Status: likely

`caps` is resolved once at stream open (L344) and captured into the `sendTerminalResult` closure (L410). The re-auth IIFE correctly re-runs `canAccessSubmission` (C3-AGG-6, L475-482), but if the viewer is *downgraded* mid-stream (loses `submissions.view_all` or a detail-revealing capability) yet still passes `canAccessSubmission` (e.g. remains the owner), the final `result` event is sanitized with the pre-downgrade capability set, potentially exposing more detail than the post-downgrade role permits.

**Failure scenario:** instructor downgraded to student mid-judging still owns the submission → `canAccessSubmission` stays true → terminal result sanitized with instructor caps (e.g. `showDetailedResults`/`showRuntimeErrors` framing) for one final event.

**Fix:** in `sendTerminalResult`, re-resolve caps (`await resolveCapabilities(reAuthUser.role)`) when invoked from the re-auth path, or pass a `caps` override into the helper from the IIFE. Bounded by the access re-check, so LOW.

---

### INFO (no action required, recorded for completeness)

- **I-1** `judge-worker-rs/src/executor.rs:392-410` sets the source file to `0o666` unconditionally while `runner.rs:874-881` uses conditional `0o600`/`0o666`. Not a vulnerability — the executor workspace dir is chowned to `65534` then `0o700`, so only uid `65534` can traverse into it regardless of the file mode. Worth a one-line comment cross-reference if you want the two paths to read identically.
- **I-2** A9 deploy-docker per-target sourcing (see Stage 2) — still real, operator-workaround exists, LOW.

---

## Open Questions (surfaced, not blocking)

- **Is `PUT /api/v1/admin/settings` intentionally a public REST surface, or is it superseded by the server action?** If only the dashboard is supposed to mutate settings, consider deprecating/gating the route (or aligning it with `hasOwnInput`). If it must stay, C4-N1 is a ship-blocker for any non-dashboard caller. Needs product intent confirmation.

## Cross-Agent Overlap

- **C4-N1** — logic/data-integrity finding unique to code-reviewer; the *security* angle (reconfirm-gate bypass) likely overlaps with **security-reviewer**. Flag for aggregation.
- **A11a** — owned by **test-engineer** (coverage gap, not a code defect).
- **A9** — operational/topology; overlaps **architect** and **document-specialist** (docs batch).
- C4-N2/N3/N4 — residual edges of cycle-3 fixes; no other agent expected to surface these.

## Positive Observations

- The **server action** `updateSystemSettings` is a clean reference implementation of partial-update semantics — the API route just needs to match it.
- `redeemRecruitingToken` and the brute-force counter are textbook atomic SQL; the new `updateRecruitingInvitation` lock-merge composes correctly with them.
- The SSE re-auth re-fetch + `canAccessSubmission` re-run is the right shape; C4-N4 is a caps-freshness nit, not a structural flaw.
- All 13 cycle-1/2/3 changed-surface fixes verified with no regression — the loop is converging on the intended invariants.

## Recommendation

**COMMENT.** No CRITICAL, no HIGH. Schedule C4-N1 (the only MEDIUM) — it is a small, mechanical fix (copy the `hasOwnInput` pattern from the server action twin) with a concrete data-loss + security-posture failure scenario, and it closes a gap in the cycle-3 reconfirm gate. C4-N2/N3/N4 are cheap ride-alongs.
