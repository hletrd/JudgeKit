# Cycle 5 — document-specialist

Repo: `/Users/hletrd/flash-shared/judgekit` · Head: `7ebea50e` · Scope: (a) VERIFY every claim of the cycle-4 docs batch (commit `2c224ab0`) against current code; (b) net-new doc drift introduced by cycle-4 code changes (C4-1 snapshot, C4-2 workerId, F1 int64, ARCH-1 settings reconfirm); (c) status of deferred doc items; (d) docstring audit on changed files.

Read-only review. Every cited line read at HEAD `7ebea50e`.

---

## (a) VERIFY cycle-4 docs batch (commit `2c224ab0`) — 7 claims

The commit message claims: AGG-51/52, C3-D1/D2, C4-9, C4-D5, A9, NEW-1. Reality:

| Claim | Status | Detail |
|---|---|---|
| **AGG-52** push-scan `die` wording | ✅ DONE & correct | `AGENTS.md:379` now says "aborts the deploy via `die`"; example block at L385 uses `[FATAL]`. Matches `deploy-docker.sh:1078-1079` `die "drizzle-kit push detected a destructive schema change…"`. |
| **C3-D2** AGENTS.md line cite | ✅ DONE & correct | `AGENTS.md:407` now references "the `# Step 5b: Pre-drop secret_token backfill` block, near line 941" — marker-based, no brittle line range. Marker exists at `deploy-docker.sh:941`. |
| **C3-D1** .env.example security vars | ✅ DONE (partial — see C5-DOC-8) | `.env.example:171-195` has all 6 vars with accurate `0`/unset semantics. BUT `.env.production.example` was named in the plan too and got none of the missing 5. |
| **C4-9** CSV durable audit | ✅ DONE & correct | `contests/[assignmentId]/export/route.ts:185` uses `recordAuditEventDurable` on the CSV branch, matching the JSON branch at L117. |
| **A9** per-target deploy env | ✅ DONE & correct | `deploy-docker.sh:127-136` sources `.env.deploy.${DEPLOY_TARGET}` with caller-override restoration after. Comment is accurate. `.env.deploy.{algo,worv,auraedu}` exist. |
| **DOC-2/DOC-3** snapshot prose (folded into A3, commit `65ca7ef8`) | ✅ DONE & correct | `data-retention-policy.md:48` and `admin-security-operations.md:65` both reworded; `pre-restore-snapshot.ts:34-48` docstring matches the `snapshot:true` bypass reality. |
| **AGG-51** CSRF doc | ❌ **REGRESSION — see C5-DOC-1** | Doc + docstring now make a FALSE "any one passing is sufficient" claim. |
| **C4-D5** settings PUT `currentPassword` | ❌ **CLAIMED BUT NOT DONE — see C5-DOC-2** | The commit `2c224ab0` api.md diff contains ONLY the CSRF section. No settings PUT change landed. |
| **NEW-1** language sizes | ❌ **HALF-DONE — see C5-DOC-5** | AGENTS.md reconciled; `docs/languages.md` left stale. |

---

## (b) FINDINGS

### C5-DOC-1 — CSRF doc claims "any one passing is sufficient"; the code makes `X-Requested-With` MANDATORY (HIGH, regression) · CONFIDENCE: High
- **Doc:** `docs/api.md:80-82` — *"enforce **three** layered checks … (any one passing is sufficient on same-origin browsers; failures return 403)"*. Item 1 at L83-84 frames `X-Requested-With` as one of three alternatives.
- **Docstring:** `src/lib/security/csrf.ts:20-23` repeats the same false claim — *"via THREE layered checks (any one passing is sufficient)"*.
- **Code:** `src/lib/security/csrf.ts:42-47` — `if (xRequestedWith !== "XMLHttpRequest") return NextResponse.json({ error: "csrfValidationFailed" }, { status: 403 })`. This is an **unconditional early return**. If the header is missing or not exactly `XMLHttpRequest`, the request is rejected BEFORE the `Sec-Fetch-Site` (L49-56) and `Origin` (L58-73) checks are even evaluated. The latter two are *additional* gates that fire on top, not alternatives — and each only fires when its header is present.
- **Mismatch:** The real boolean is AND, not OR. `X-Requested-With: XMLHttpRequest` is **required** with no fallback; `Sec-Fetch-Site` (when present) must be same-origin/same-site/none; `Origin` (when present + AUTH_URL resolvable) must match. An integrator who believed the doc and sent only a correct `Sec-Fetch-Site` (no `X-Requested-With`) would get 403 on every mutation.
- **Severity / provenance:** **HIGH.** This mismatch was *introduced* by the cycle-4 fix batch (commit `2c224ab0`). The prior doc (`requires the custom header X-Requested-With`) was accurate about XRW being mandatory — it merely understated the other two checks. The new doc overcorrected into a false OR claim, which is worse than the original understatement because it teaches the wrong mental model.
- **Fix (text-only):** Reword `docs/api.md:80-84` and the `csrf.ts:20-23` docstring to: *"enforce three layered checks — **all** applicable checks must pass (403 on any failure). (1) `X-Requested-With: XMLHttpRequest` is **required** (HTML forms cannot set custom headers). (2) When `Sec-Fetch-Site` is present, it must be `same-origin`, `same-site`, or `none`. (3) When `Origin` is present and `AUTH_URL` is configured, the origin host must match."*

### C5-DOC-2 — `PUT /api/v1/admin/settings` doc STILL omits `currentPassword` + sensitive-key gate; commit `2c224ab0` message falsely claims C4-D5 done (MEDIUM) · CONFIDENCE: High
- **Doc:** `docs/api.md:1380-1395` — request body lists only `siteTitle`, `siteDescription`, `timeZone`, `aiAssistantEnabled`, `allowedHosts`; no `currentPassword`, no sensitive-key note.
- **Code:** `src/lib/security/sensitive-settings.ts:23-52` (`SENSITIVE_SETTINGS_KEYS` — 28 keys spanning platformMode, allowedHosts, hcaptcha/SMTP secrets, exam-mode toggles, upload ceilings, rate limits, session lifetime); `src/app/api/v1/admin/settings/route.ts` consumes `requireSettingsReconfirm` (shared helper); `src/lib/actions/system-settings.ts:100` also calls it (ARCH-1 — both writers gate).
- **Mismatch:** Identical to the cycle-4 pre-fix state. C4-D5 was listed in commit `2c224ab0`'s subject (`…C4-D5…`) but the diff contains zero settings-PUT changes — only the CSRF section. The work was never done.
- **Fix (text-only):** Document `currentPassword` (required when any of `SENSITIVE_SETTINGS_KEYS` is present; verified via `verifyAndRehashPassword`; 401 `passwordReconfirmRequired` on miss/403 `invalidPassword` on wrong value). Note cosmetic-only edits (`siteTitle`, `siteDescription`, `defaultLanguage`, branding) remain editable without reconfirm. Reference the shared-helper contract so the doc stays in sync with the single source of truth.

### C5-DOC-3 — `PATCH /api/v1/admin/roles/:id` doc STILL omits `cannotEditHigherRole` gate (MEDIUM, deferred from cycle 4) · CONFIDENCE: High
- **Doc:** `docs/api.md:1432-1434` — *"Update a role. Cannot reduce `super_admin` capabilities or change built-in role levels."*
- **Code:** `src/app/api/v1/admin/roles/[id]/route.ts:94-95` — `if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403)` (the lateral cap-stripping gate from cycle-3 A2).
- **Mismatch:** Unchanged since cycle 4. The gate is undocumented; an integrator automating role edits as a non-super admin would hit an unexpected 403.
- **Fix (text-only):** Add: *"Returns 403 `cannotEditHigherRole` if the role's current level exceeds the actor's (prevents lateral cap-stripping). Target `level` must also be ≤ the actor's level."*

### C5-DOC-4 — `POST /api/v1/judge/claim` now REQUIRES `workerId`+`workerSecret`; docs show no request body at all (MEDIUM, net-new drift from C4-2) · CONFIDENCE: High
- **Doc:** `docs/api.md:1287-1291` — *"Claim a pending submission for judging. Uses atomic SQL… **Response:** Full submission object…"*. No request body documented.
- **Code:** `src/app/api/v1/judge/claim/route.ts:106-127` — `claimRequestSchema` makes `workerId` required via `superRefine` (`workerIdRequired` if absent) and `workerSecret` required when `workerId` is present. L162-165 re-rejects if either is missing. The shared `JUDGE_AUTH_TOKEN` is no longer accepted on `/claim` (bootstrap-only, `/register`-only since C4-2 Part 1).
- **Mismatch:** The C4-2 security hardening — requiring a registered worker credential to claim work — is invisible in the API docs. A worker integrator following the docs would not know to send `workerId`/`workerSecret`.
- **Note on siblings:** `/poll` derives `workerId` from the submission's `judgeWorkerId` and authorizes via `isJudgeAuthorizedForWorker` (`poll/route.ts:77`), so its body genuinely need not carry `workerId` — the poll doc body is technically consistent. `/heartbeat` and `/deregister` correctly document `workerId`/`workerSecret` in body. Only `/claim` is the gap.
- **Fix (text-only):** Add a request body table for `/claim` with `workerId` (required) + `workerSecret` (required) and a note that the shared `JUDGE_AUTH_TOKEN` is registration-only.

### C5-DOC-5 — `docs/languages.md` language sizes still stale (NEW-1 half-reconciled) (MEDIUM) · CONFIDENCE: High
- **Doc A (fixed):** `AGENTS.md:375` — `core (~1.2 GB), popular (~4 GB), extended (~12 GB), all (~30 GB)` — matches `deploy-docker.sh:223-226` `--help`.
- **Doc B (stale):** `docs/languages.md:216-218` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB)`. Only `all (~30 GB)` at L219 was updated.
- **Code (source of truth):** `deploy-docker.sh:223-226` — `core (~1.2 GB), popular (~4 GB), extended (~12 GB)`.
- **Mismatch:** The cycle-4 plan scoped NEW-1 as "AGENTS.md language-preset sizes — reconcile" and only touched AGENTS.md. `docs/languages.md` was missed. The `core`/`popular`/`extended` figures there are now ~33-50% low.
- **Fix (text-only):** Update `docs/languages.md:216-218` to the deploy-script figures. (Optional: drop the prose pointer to "empirical figures from `deploy-docker.sh --help`" that AGENTS.md:375 already carries, or mirror it.)

### C5-DOC-6 — `GET /api/v1/problems/:id/export` STILL undocumented (MEDIUM, deferred twice) · CONFIDENCE: High
- **Doc:** `docs/api.md` — grep for `problems/:id/export` / `problems/.*export` → 0 hits.
- **Code:** `src/app/api/v1/problems/[id]/export/route.ts` exists (SELECTs `problemType`/`functionSpec`/`referenceSolution`; strict `canManageProblem` gate per cycle-1 A9).
- **Status:** Was in cycle-4 A7 list ("NEW-2/3 docs/api.md — document…"). Not done. Second deferral.

### C5-DOC-7 — `POST /api/v1/groups/:id/instructors` STILL undocumented (MEDIUM, deferred twice) · CONFIDENCE: High
- **Doc:** `docs/api.md` — grep for `instructors` → 0 hits.
- **Code:** `src/app/api/v1/groups/[id]/instructors/route.ts` exists.
- **Status:** Same as C5-DOC-6. Second deferral.

### C5-DOC-8 (LOW bundle) — `.env.production.example` partial + trivial prose · CONFIDENCE: High
- **`.env.production.example`** — the cycle-4 plan A7 explicitly named *both* files: *"C3-D1 `.env.example` + `.env.production.example` — add the 6 missing security-relevant env vars."* Only `.env.example` got all 6. `.env.production.example` still has only `TRUSTED_DOCKER_REGISTRIES` (L54, commented) and is missing `TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `JUDGE_STRICT_IP_ALLOWLIST`, `SANDBOX_ALLOW_UNVERIFIED_EMAIL`, `ALLOW_UNSNAPSHOTTED_RESTORE`, `JUDGE_PRODUCTION_MODE`. These are arguably *more* relevant in a production example than a dev one.
- **`docs/api.md:1242`** — *"These endpoints are authenticated via judge authorization (not user sessions)."* Accurate but vague; does not state that `/register` takes the shared `JUDGE_AUTH_TOKEN` (Authorization header) while all other judge endpoints require the per-worker `workerSecret`. Pre-existing, LOW. (Folded here because it collides with C5-DOC-4's fix — address both in one pass.)

---

## (c) CHANGED-FILE DOCSTRING AUDIT (cycle-4 code) — all CLEAN

| File | Verdict |
|---|---|
| `src/lib/judge/function-judging/serialization.ts:5-19` | ✅ Accurately describes the F1 fix: bigint/string verbatim, safe-int-only `number`, throw on unsafe. Matches `encodeIntLiteral` L21-35. |
| `src/lib/judge/function-judging/adapters/cpp.ts:47-50` | ✅ `strtoll` over integer-only token; references F1; explains why `llround(stod(...))` was wrong. |
| `adapters/java.ts:75-85` | ✅ `Long.parseLong(integerToken())`; F1-referenced. |
| `adapters/csharp.ts:78-89` | ✅ `long.Parse(IntegerToken(), InvariantCulture)`; F1-referenced. |
| `src/lib/judge/ip-allowlist.ts:6-16` | ✅ Accurately describes C4-2 Part 2: unset==allow-all preserved, `JUDGE_STRICT_IP_ALLOWLIST=1` opt-in, references the cycle-2 revert `23851d69` as the cautionary precedent. Matches `isStrictIpAllowlistOptedIn` L19. |
| `src/lib/db/export.ts:84-92` | ✅ Accurately describes `snapshot:true` bypass of `EXPORT_ALWAYS_REDACT_COLUMNS`; distinguishes snapshot from regular exports/backup/migrate. Matches L93-97 ternary. |
| `src/lib/db/pre-restore-snapshot.ts:34-48` | ✅ Accurately describes the snapshot as full-fidelity via `snapshot:true`, lists the retained auth columns, justifies `0o600`/`0o700` for the *correct* reason (live secrets now present). Matches the call site at L84-86. |
| `src/lib/security/sensitive-settings.ts:23-52,62-80` | ✅ `SENSITIVE_SETTINGS_KEYS` docstring + `requireSettingsReconfirm` parity claim ("Mirrors the restore/backup/migrate `verifyAndRehashPassword` gate") — verified: restore L59, backup L63, migrate L68/L180 all call it. SINGLE-source-of-truth claim accurate (route + action both import). |
| `src/lib/security/csrf.ts:19-31` | ❌ See C5-DOC-1 — the "any one passing is sufficient" line is false. |

---

## (d) EXTERNAL LIBRARY / API CURRENCY — no drift, no re-check needed this cycle

No dependency versions changed in cycle 4. The table from the cycle-4 review (next `^16.2.9`, react `19.2.5`, next-auth `5.0.0-beta.31`, drizzle-orm `0.45.2`, drizzle-kit `^0.31.9`, argon2 `^0.44.0`, vitest `^4.1.5`, @playwright/test `^1.59.1`, typescript `5.9.3`) remains current. No deprecated/removed SDK usage. No external-library findings.

---

## FINAL SWEEP (clean / re-confirmed)

- `docs/judge-workers.md:59`, `docs/deployment.md:48`, `docs/admin-security-operations.md:58` — every `JUDGE_AUTH_TOKEN` reference correctly states "registration/bootstrap only"; the C4-2 change brought the *code* into line with docs that had anticipated this model since 2026-05. No regression.
- `docs/function-judging.md:35` (`±2^53−1; values outside it are rejected at authoring time`) and L95 (`byte-identical for non-double`) — both accurate post-F1.
- `docs/privacy-retention.md` retention windows still match `src/lib/data-retention.ts` defaults.
- `SECURITY.md` snapshot path/mode claims match `pre-restore-snapshot.ts` (0o700/0o600); does not repeat the old false "contains password hashes" claim.
- `CLAUDE.md` deploy flags still honored by `deploy-docker.sh` + the new per-target sourcing (A9).

---

## PRIORITY ORDER (doc lane — next cycle)

1. **C5-DOC-1 (HIGH, regression, text-only)** — fix the false CSRF "any one passing is sufficient" in BOTH `docs/api.md:80-84` and `csrf.ts:20-23`. This is a cycle-4-introduced regression and the only HIGH item.
2. **C5-DOC-2 (MEDIUM, text-only)** — settings PUT `currentPassword` + sensitive-key gate. Was falsely claimed done in cycle 4.
3. **C5-DOC-4 (MEDIUM, text-only)** — `/claim` request body (`workerId`+`workerSecret`); net-new drift from C4-2.
4. **C5-DOC-5 (MEDIUM, text-only)** — `docs/languages.md:216-218` sizes.
5. **C5-DOC-3 (MEDIUM, text-only)** — roles PATCH `cannotEditHigherRole`.
6. **C5-DOC-6 / C5-DOC-7 (MEDIUM, text-only)** — the two undocumented endpoints (second deferral).
7. **C5-DOC-8 (LOW bundle, text-only)** — `.env.production.example` missing 5 vars + judge-section auth-vagueness.

All items are text-only. Items 1-3 are the priority and can land in a single small docs commit; the rest can ride along.

