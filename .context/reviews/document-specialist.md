# Cycle 2 — document-specialist

Repo: `/Users/hletrd/flash-shared/judgekit` · Head: `ad543e14` · Scope: doc/code mismatch verification of the 12 cycle-1 Phase A fixes (regression), Phase B DOC carry-over (AGG-51..55, DOC-2/3), and new mismatches. All 12 Phase A code fixes verified present at HEAD; this review covers only documentation drift.

---

## REGRESSION — docs touched/implied by the 12 Phase A fixes

### REG-1 — A10 refactor migrated the false docstring but did not fix it (MEDIUM → cross-listed AGG-53)
- **Confidence:** High
- **Doc:** `judge-worker-rs/src/validation.rs:84-86` (docstring on `validate_docker_image`)
- **Code:** `judge-worker-rs/src/validation.rs:29-31` (`if !hasRegistryPrefix { return segments.len() == 1; }`)
- **Mismatch:** The A10 fix (env-race) added a correct docstring on the *new* `validate_docker_image_with_config` (L51-54) but **left the cycle-1 false claim verbatim** on the env-reading boundary function `validate_docker_image`: *"In production (JUDGE_PRODUCTION_MODE=1), requires non-empty trusted registries and rejects images without a trusted registry prefix."* The code still accepts unqualified `judge-*` images in production whenever the trusted list is non-empty (`segments.len() == 1` → true, never consults `trusted_prefixes`). The test `production_mode_rejects_images_without_trusted_registry` (L239-252) still does not assert the unqualified-with-non-empty-list case.
- **Regression verdict:** Genuine doc regression introduced by A10 — the refactor touched this file, added the accurate text to a sibling function, and preserved the stale text on the production entry point.
- **Fix:** Rewrite L85-86 to: *"In production, requires a non-empty trusted-registry list; unqualified `judge-*` images remain allowed, but any registry-prefixed image must match a trusted prefix."*

### REG-2 — A1 env-perms hardening is undocumented; AGENTS.md still describes the old narrower policy (MEDIUM)
- **Confidence:** High
- **Doc:** `AGENTS.md:427` — *"`.env.production` is chmod 0600 (cycle 2, commit `ab31a40f`). Both the fresh-generation path and the existing-file defense-in-depth path apply the mode."*
- **Code:** `src/lib/security/env.ts:182-211` (`assertLoadedEnvFilePermissions` — production startup guard that `die`s on group/other bits); A1 commit `40250e63` extended 0600 to all `.env*` files (verified: `.env`, `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`, `.env.worv`, `.env.production` all mode `-rw-------`).
- **Mismatch:** AGENTS.md documents only the older `.env.production`-only 0600 policy. The A1 additions — (a) 0600 applied to **all** `.env*` files, (b) a production **startup guard** that refuses to boot when the loaded env file is group/other-readable — are absent from every doc.
- **Fix:** Extend AGENTS.md:427 to state all `.env*` files are 0600 and that production startup enforces it via `assertLoadedEnvFilePermissions` (refuses boot with a `chmod 600` remediation hint).

### REG-3 — AGG-2 "all fields included" still present (expected, Phase B carry-over — no new regression)
- **Confidence:** High
- **Doc:** `docs/data-retention-policy.md:48` — *"Full-fidelity (`?full=true`) — all fields included."*
- **Code:** `src/lib/db/export.ts:104-106` applies `EXPORT_ALWAYS_REDACT_COLUMNS` even when `sanitize:false`.
- **Mismatch:** Same as cycle-1 DOC-2. A2 fix (durable restore audit) did **not** touch the export redaction path, so no new drift was introduced.

### REG-4 — Fixes with no doc drift (clean)
A2, A3, A5, A6, A8, A12 — verified in code; **no doc describes the old behavior**. A6's `sanitizePromptInput` application is an internal security control, acceptably absent from the API contract.

---

## PHASE-B DOCS — all confirmed still valid

| ID | Status | Doc : Code | Verification |
|---|---|---|---|
| **AGG-51 / DOC-1** (CSRF) | STILL VALID | `docs/api.md:78-83` : `src/lib/security/csrf.ts:36,49,56,64` | Doc lists only `X-Requested-With`; code enforces `Sec-Fetch-Site` + `Origin`/`Host`. |
| **AGG-52 / DOC-4** (push-scan) | STILL VALID | `AGENTS.md:379,383` : `deploy-docker.sh:1080` | AGENTS.md says "downgrades to warn"; code `die`s (exit 1). |
| **AGG-53 / DOC-5** (validation.rs) | STILL VALID + WORSENED | `validation.rs:84-86` : `validation.rs:29-31` | See REG-1. False docstring now on the production entry-point fn. |
| **AGG-54 / DOC-6** (journal) | STILL VALID | `drizzle/pg/` : `AGENTS.md:388`, `deploy-docker.sh:1042` | Duplicate prefixes `0012`, `0016`, `0027`, `0028`; gap `0029`-`0032`. |
| **AGG-55** (orphan column) | STILL VALID | `src/lib/db/schema.pg.ts:591` : (no reader) | `minPasswordLength` column still defined; zero code readers. |
| **DOC-2** (full-fidelity) | STILL VALID | `docs/data-retention-policy.md:48`, `docs/admin-security-operations.md:65` : `src/lib/db/export.ts:104-106` | "All fields included" still false; 7 columns across 5 tables always redacted. |
| **DOC-3** (snapshot comment) | STILL VALID | `src/lib/db/pre-restore-snapshot.ts:34-38` : `pre-restore-snapshot.ts:84-86` | Comment claims snapshot "contains password hashes"; `streamDatabaseExport({sanitize:false})` still redacts `passwordHash`. |

---

## NEW MISMATCHES

### NEW-1 — Language-preset disk sizes are inconsistent across three sources; AGENTS.md is the outlier (MEDIUM)
- **Confidence:** High
- **Doc A:** `AGENTS.md:375` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~14 GB)`
- **Doc B:** `docs/languages.md:216-219` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~30 GB)`
- **Code:** `deploy-docker.sh` `--help` text — `core (~1.2 GB), popular (~4 GB), extended (~12 GB), all (~30 GB)`
- **Mismatch:** Three-way inconsistency. `all` is the clearest fault line: AGENTS.md says ~14 GB while both other sources say ~30 GB — AGENTS.md is definitively stale.
- **Fix:** Reconcile all three to one source-of-truth table; update AGENTS.md:375 `all` to ~30 GB at minimum.

### NEW-2 — `GET /api/v1/problems/:id/export` endpoint is undocumented (MEDIUM)
- **Confidence:** High
- **Doc:** `docs/api.md` — grep for `problems/:id/export` returns **zero** hits.
- **Code:** `src/app/api/v1/problems/[id]/export/route.ts` (A9-hardened: SELECTs `problemType`/`functionSpec`/`referenceSolution`, gated on strict `canManageProblem`).
- **Fix:** Add a `GET /api/v1/problems/:id/export` subsection to `docs/api.md`.

### NEW-3 — `POST /api/v1/groups/:id/instructors` endpoint is undocumented (MEDIUM)
- **Confidence:** High
- **Doc:** `docs/api.md` — grep for `instructors` / `co_instructor` returns **zero** hits.
- **Code:** `src/app/api/v1/groups/[id]/instructors/route.ts` (A4-hardened: student-target rejection).
- **Fix:** Document the endpoint and allowed target roles in `docs/api.md`.

### LOW-1 — `.env.example` omits security-relevant env vars read by code (LOW)
- **Confidence:** High
- **Doc:** `.env.example` (no entries)
- **Code:** `src/lib/security/ip.ts:12` reads `TRUSTED_PROXY_HOPS`; `judge-worker-rs/src/validation.rs:69` reads `TRUSTED_DOCKER_REGISTRIES`; `validation.rs:79` reads `JUDGE_PRODUCTION_MODE`.
- **Fix:** Add stub entries with comments to `.env.example`, especially `TRUSTED_PROXY_HOPS` (document `0` = no trusted proxies / ignore XFF).

### LOW-2 — `docs/api.md` authz wording understates group-scoped capability gates (LOW)
- **Confidence:** High
- **Doc:** `docs/api.md:688` (DELETE group: "**Admin only.**"); `docs/api.md:530` (GET problem: "Test cases are only returned to the problem author or admin")
- **Code:** Group DELETE post-A3 is not admin-only; Problem GET hidden data post-A11 is gated by group-scoped management, not just "author or admin".
- **Fix:** Reword to reference the group-scoped management gate.

### LOW-3 — `AGENTS.md:407` Step 5b line citation is stale by ~400 lines (LOW)
- **Confidence:** High
- **Doc:** `AGENTS.md:407` — *"delete the Step 5b block from `deploy-docker.sh` (lines around 544-596)"*
- **Code:** `deploy-docker.sh:941` — `# Step 5b: Pre-drop secret_token backfill` (544-596 is the unrelated `.env.production` generation block).
- **Fix:** Update AGENTS.md:407 to cite `deploy-docker.sh:941` (or describe the block by its marker, not a brittle line range).

---

## FINAL SWEEP

**Verified clean:** README quick-start deploy flags (`AGENTS.md:363-372` ↔ `deploy-docker.sh:190-196`) — no drift. Phase B AGG-14 confirmed still present but tracked as architecture. `judge-worker-rs` has no crate-level claims to mismatch. en/ko message parity clean. All 12 Phase A code fixes verified present at HEAD.

**Priority order for the next cycle:**
1. **DOC-2 / DOC-3 (HIGH)** — correct every "full-fidelity = all fields" claim and the pre-restore snapshot comment.
2. **REG-1 / AGG-53 (MEDIUM)** — one-line docstring fix at `validation.rs:84-86`.
3. **REG-2 (MEDIUM)** — extend AGENTS.md:427 to cover the A1 all-env-files 0600 policy + startup guard.
4. **AGG-51 / AGG-52 (MEDIUM)** — document the full CSRF gate; align the push-scan narrative with `die`.
5. **NEW-1 / NEW-2 / NEW-3** — reconcile language sizes; document the two undocumented endpoints.
6. **AGG-54 / AGG-55 / LOW-1..3** — journal warning + orphan column + env-example + authz wording + stale line cite.
