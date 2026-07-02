# Document-Specialist Review — JudgeKit Cycle 3 Refresh

**Date:** 2026-07-03  
**Scope:** `AGENTS.md`, `README.md`, `docs/**/*.md`, `.env.example`, `.env.production.example`, `deploy-docker.sh`, `static-site/nginx.conf`, `scripts/*.nginx.conf`, and the source files they describe. Focus is on drift introduced or left visible after the cycle-3 nginx/env hardening commits.  
**Method:** Re-read `.context/reviews/_aggregate.md`, the previous `document-specialist.md`, and the cycle-3 plan. Compared current docs against the modified working-tree files and authoritative sources (`src/`, `docker/`, `docker-compose.production.yml`, `.env` examples).  

## Executive Summary

- **5 fresh doc/code mismatches** are introduced or newly visible after cycle-3 changes (DOC-25 through DOC-31).
- **22 prior findings remain unchanged**; **2 prior findings are partially resolved** by code changes but still have documentation contradictions (DOC-4, DOC-5).
- **3 aggregate-level nginx issues** from the Cycle 2 review are now verified as fixed in `deploy-docker.sh` (catch-all body size, XFF chain preservation, baseline security headers) and are documented in the "Verified Cycle-3 Code Fixes" section.
- The largest remaining drift class is still **API documentation** (`docs/api.md`), followed by **deployment/environment documentation** and the **language inventory**.

## Findings Register

| ID | Severity | Status | Area | Citation | Finding |
|----|----------|--------|------|----------|---------|
| DOC-1 | High | Still present | API docs | `docs/api.md:1-2037` vs. `src/app/api/v1/**` | Omits 34 live `/api/v1` endpoints. |
| DOC-2 | High | Still present | Languages | `AGENTS.md:113`, `docs/languages.md:73` vs. `src/lib/judge/languages.ts` | `flix` documented as `judge-jvm`; code uses `judge-flix`. |
| DOC-3 | High | Still present | Languages | `docs/languages.md:73` vs. `:224` | `flix` marked arm64-ready and also ARM-prohibitive. |
| DOC-4 | High | Resolved in code, docs still stale | Languages | `src/types/index.ts:30-157`, `src/lib/judge/languages.ts:1430-1440` vs. `docs/languages.md:210`, `:224` | `roc` is now active in code but still listed as disabled/ARM-prohibitive. |
| DOC-5 | High | Partially resolved | Images | `README.md:86,94,104` vs. `src/lib/judge/languages.ts` | `judge-roc` is now active; `judge-j` and `judge-malbolge` remain orphan images. |
| DOC-6 | High | Still present | API docs | `docs/api.md:1089-1091` vs. `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` | Similarity-check auth described as "Instructor or above"; code also allows assistants with `anti_cheat.run_similarity`. |
| DOC-7 | High | Still present | Deployment | `docs/deployment.md:7` vs. `docker-compose.production.yml:96` | App container internal port stated as `3100`; actual internal port is `3000`. |
| DOC-8 | Medium | Still present | Capabilities | `README.md:29`, `AGENTS.md` vs. `src/lib/capabilities/types.ts:8-80` | Docs claim 43 capabilities; code defines 46. |
| DOC-9 | Medium | Still present / updated count | Images | `README.md:77`, `docs/languages.md:192` vs. `src/lib/judge/languages.ts` | Docs claim 102 active images; active configs reference 99 distinct images (was 98 before `roc` re-enable). |
| DOC-10 | Medium | Still present | Presets | `docs/languages.md:214-220`, `scripts/setup.sh:59-149` | `setup.sh` `all` preset includes ARM-prohibitive languages; docs say it excludes them. |
| DOC-11 | Medium | Still present | Deployment | `docs/deployment.md:80-81` vs. `deploy-docker.sh:268-277`, `AGENTS.md:375` | Preset size estimates are stale (core 0.8 vs. 1.2 GB, etc.). |
| DOC-12 | Medium | Still present | API docs | `docs/api.md:1666-1668` vs. `src/app/api/v1/admin/docker/images/route.ts:55` | Docker images `GET` auth described as "Admin or Super Admin"; code requires `system.settings`. |
| DOC-13 | Medium | Still present | Agent guide | `AGENTS.md:260-261` vs. `src/app/api/v1/admin/docker/images/build/route.ts:19`, `src/app/api/v1/admin/docker/images/route.ts:93,165` | Docker build/delete auth described as "Admin/super_admin only"; code requires `system.settings`. |
| DOC-14 | Medium | Still present | API docs | `docs/api.md:941-943` vs. `src/app/api/v1/contests/join/route.ts:27-42` | Contest join docs omit the two failure-scoped rate-limit buckets. |
| DOC-15 | Medium | Still present | Languages | `AGENTS.md:210`, `src/lib/judge/languages.ts:111` vs. `docker/Dockerfile.judge-haskell:1` | `judge-haskell` base reported three different ways (Alpine 3.21, ghc:9.4-alpine, Debian Bookworm). |
| DOC-16 | Low | Still present | Languages | `docs/languages.md:194-204` vs. `src/types/index.ts:30-157` | E2E summary reports 113-language scope; active count is 125. |
| DOC-17 | Low | Still present | Languages | `AGENTS.md:20`, `AGENTS.md:22-150` | Language table has 126 rows while docs claim 125 variants. |
| DOC-18 | Low | Still present | Images | `docker/Dockerfile.judge-simula` vs. `src/types/index.ts`, `src/lib/judge/languages.ts` | Orphan Dockerfile with no language binding. |
| DOC-19 | Low | Still present | Developer guide | `AGENTS.md:151-159` vs. `judge-worker-rs/src/languages.rs`, `src/lib/compiler/execute.ts` | New-language checklist omits Rust runner-side validation. |
| DOC-20 | Low | Still present | README | `README.md:71` vs. `docs/languages.md:214-220`, `AGENTS.md:375` | README preset list omits the `everything` preset. |
| DOC-21 | Low | Still present | API docs | `docs/api.md` | Several admin/problem endpoints lack request/response body details. |
| DOC-22 | Low | Low impact / unclear | Security | `SECURITY.md:20` vs. `code-similarity-rs/`, `Dockerfile.code-similarity` | Path wording is technically correct but could be clearer about the root-level Dockerfile. |
| DOC-23 | Low | Clean | API docs | `docs/api.md:1936-1944` vs. `src/app/api/internal/cleanup/route.ts` | Path and `CRON_SECRET` auth match implementation. |
| DOC-24 | Medium | Still present | Data retention | `docs/data-retention-policy.md:38` vs. `src/lib/data-retention.ts:46-52` | Legal hold said to require restart; code re-reads the env var every prune cycle. |
| DOC-25 | Medium | **Fresh** | Deployment | `docs/deployment.md:18,44` vs. `deploy-docker.sh:750`, `docker-compose.production.yml:115`, `src/lib/security/env.ts:260-265` | `AUTH_TRUST_HOST` table says default `false`; example, generated `.env.production`, and compose default to `true`. |
| DOC-26 | Medium | **Fresh** | Deployment | `docs/deployment.md:40-63` vs. `.env.example:122,175-182,230-236`, `.env.production.example:56,85-93,145-151` | Env var reference omits operational/security variables such as `TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `COMPILER_RUNNER_URL`, `SKIP_POST_DEPLOY_PRUNE`. |
| DOC-27 | Medium | **Fresh** | Deployment / API | `docs/deployment.md`, `docs/api.md` vs. `deploy-docker.sh:1589-1629` | Generated nginx body-size scoping is undocumented: `/api/auth/` and `/api/v1/judge/` are limited to `1m`, while app defaults allow `50M`. |
| DOC-28 | High | **Fresh** | API docs | `docs/api.md:1089-1098` vs. `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:26-97`, `src/lib/assignments/code-similarity.ts:248-253` | Docs say similarity-check returns `504` on timeout and only `{ flaggedPairs }`; actual response is `200` with `status`, `reason`, `pairs`, enriched usernames, etc. |
| DOC-29 | Medium | **Fresh** | Security ops | `docs/admin-security-operations.md:67-77` vs. `src/lib/security/ip.ts:11-205`, `.env.example:175-182` | No documentation for `TRUSTED_PROXY_HOPS`, XFF chain expectations, or X-Real-IP fallback rules. |
| DOC-30 | Medium | **Fresh** | Languages | `docs/languages.md:210,224` vs. `src/types/index.ts:130`, `src/lib/judge/languages.ts:1430-1440`, `docker/Dockerfile.judge-roc` | `roc` is re-enabled in code but still listed as disabled and ARM-prohibitive. |
| DOC-31 | Low | **Fresh** | Languages | `docs/languages.md:192`, `README.md:77` vs. `src/lib/judge/languages.ts`, `docker/Dockerfile.judge-*` | Image-count claims still say 102 active; 99 are referenced by active configs, 3 Dockerfiles are orphans. |

---

## Fresh Findings (Cycle 3)

### DOC-25: `docs/deployment.md` contradicts production defaults for `AUTH_TRUST_HOST`

- **Doc:** `docs/deployment.md:18` (example `.env.production` sets `AUTH_TRUST_HOST=true`), `:44` (env table says default `false`).
- **Code:** `deploy-docker.sh:750` generates `.env.production` with `AUTH_TRUST_HOST=true`; `docker-compose.production.yml:115` defaults `AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-true}`; `src/lib/security/env.ts:260-265` returns `process.env.AUTH_TRUST_HOST === "true"`.
- **Problem:** The environment reference table tells operators the default is `false`, while every production path ships `true`. This is an internal doc contradiction and a doc/code mismatch.
- **Failure scenario:** An operator reads the table, believes the app defaults to a strict host-validation posture, and does not explicitly set the variable. The generated production file and compose still set `true`, which changes the effective Auth.js trust behavior without the operator realizing it. Conversely, an operator who sets `false` because the table says it is the default may break reverse-proxy Auth.js flows that the docs elsewhere say require `true`.
- **Suggested fix:** Change the `Default` column for `AUTH_TRUST_HOST` to `true` (production / reverse-proxy) and add a note that local/dev `.env.example` uses `false`. Alternatively split the table into "local defaults" and "production defaults."
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Incorrect / inconsistent

### DOC-26: `docs/deployment.md` env var reference omits security/operational variables

- **Doc:** `docs/deployment.md:40-63` ("Environment Variable Reference" table).
- **Code:** `.env.example:175-182` (`TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `JUDGE_STRICT_IP_ALLOWLIST`), `:122` (`RUNNER_AUTH_TOKEN`), `:230-236` (`ENABLE_COMPILER_LOCAL_FALLBACK`, `DATA_RETENTION_LEGAL_HOLD`); `.env.production.example:85-93`, `:145-151`; `deploy-docker.sh` reads `SKIP_POST_DEPLOY_PRUNE`, `LANGUAGE_FILTER`, `LANGUAGE_BUILD_STRATEGY`, etc.
- **Problem:** The deployment guide presents itself as the canonical env var reference but leaves out variables that control IP trust, judge allowlists, compiler runner auth, legal hold, and deploy behavior.
- **Failure scenario:** An operator deploying behind Cloudflare does not know `TRUSTED_PROXY_HOPS` exists; the default of `1` causes `extractClientIp` to return `null`, collapsing rate-limit keys and judge IP allowlists. Another operator omits `JUDGE_ALLOWED_IPS` because it is not in the guide, leaving the judge API open by default.
- **Suggested fix:** Add rows for `TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `JUDGE_STRICT_IP_ALLOWLIST`, `COMPILER_RUNNER_URL`, `RUNNER_AUTH_TOKEN`, `ENABLE_COMPILER_LOCAL_FALLBACK`, `DATA_RETENTION_LEGAL_HOLD`, `SKIP_POST_DEPLOY_PRUNE`, `LANGUAGE_FILTER`, and `LANGUAGE_BUILD_STRATEGY` to the reference table.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Missing

### DOC-27: Generated nginx `client_max_body_size` scoping is undocumented

- **Doc:** `docs/deployment.md` and `docs/api.md` describe the default upload ceiling (`50M`) but do not describe nginx path-level limits.
- **Code:** `deploy-docker.sh:1589-1629` generates: `/api/auth/` → `1m`; `/api/v1/judge/poll` → `50M`; `/api/v1/judge/` → `1m`; `location /` → `50M`.
- **Problem:** Application-level defaults (`uploadMaxFileSizeBytes = 50 MiB`) and the broad `location /` limit agree, but auth and generic judge paths are capped at `1m`. This is intentional hardening, yet it is invisible to API consumers and operators.
- **Failure scenario:** An admin uploads a 2 MiB profile picture through an `/api/auth/` endpoint, or a worker/judge report path other than `/api/v1/judge/poll` receives a >1 MiB payload. nginx returns `413 Payload Too Large` before the application can validate the request, and the API docs give no hint that these paths have a lower limit.
- **Suggested fix:** Add a "Request body limits" subsection to `docs/deployment.md` (and a note in `docs/api.md`) listing the nginx path-level caps and the app-level defaults.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Missing

### DOC-28: `docs/api.md` similarity-check endpoint is stale

- **Doc:** `docs/api.md:1089-1098` — auth "Instructor or above", "30-second timeout. Returns `504` on timeout.", response `{ "data": { "flaggedPairs": 5 } }`.
- **Code:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-97` allows assistants with `anti_cheat.run_similarity`; returns `200` with `status`, `reason`, `flaggedPairs`, `submissionCount`, `maxSupportedSubmissions`, `pairs` (enriched with `user1Name`/`user2Name` and rounded similarity). `src/lib/assignments/code-similarity.ts:248-253` defines the result shape. Unit tests in `tests/unit/api/similarity-check.route.test.ts:104-189` assert the new shape.
- **Problem:** Auth, HTTP status on timeout, and response schema are all wrong.
- **Failure scenario:** A front-end integration written against the docs polls for a timeout and expects `504`, receiving `200` with `status: "timed_out"` instead, and fails to parse the response because `pairs`, `submissionCount`, and `maxSupportedSubmissions` are missing from the documented schema.
- **Suggested fix:** Update the endpoint entry to: (1) auth requires `anti_cheat.run_similarity` plus group TA/assignment, or `canManageContest`; (2) timeout returns `200` with `status: "timed_out"`; (3) document the full response schema including `pairs[]` with enriched names and `similarity` as a percentage.
- **Severity:** HIGH  
- **Confidence:** High  
- **Classification:** Outdated / incorrect

### DOC-29: `docs/admin-security-operations.md` lacks reverse-proxy IP trust documentation

- **Doc:** `docs/admin-security-operations.md:67-77` discusses reverse-proxy perimeter controls but never mentions IP extraction mechanics.
- **Code:** `src/lib/security/ip.ts:11-205` implements `TRUSTED_PROXY_HOPS`, XFF chain validation, IPv4-mapped-IPv6 unwrapping, IPv6 canonicalization, and X-Real-IP fallback only when XFF is absent. `.env.example:175-182` documents the variables only in the example file.
- **Problem:** The cycle-3 change to IP extraction (DOC A7) has no admin-facing documentation. Operators must read `src/lib/security/ip.ts` to understand how to configure `TRUSTED_PROXY_HOPS` or why `X-Real-IP` is ignored when XFF is present.
- **Failure scenario:** A deployment behind Cloudflare plus origin nginx sets `TRUSTED_PROXY_HOPS=1` but receives `X-Forwarded-For: <client>, <cloudflare>, <origin-nginx>`. `extractClientIp` returns `null`, so rate-limit keys fall back to a global bucket and judge IP allowlists deny legitimate workers. The operator has no runbook to diagnose this.
- **Suggested fix:** Add a section to `docs/admin-security-operations.md` describing `TRUSTED_PROXY_HOPS`, the required minimum XFF hop count, X-Real-IP fallback behavior, and IPv6 canonicalization.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Missing

### DOC-30: `docs/languages.md` still disables `roc` after the codebase re-enabled it

- **Doc:** `docs/languages.md:210` lists `roc` in "Disabled Languages" with the note "Upstream compiler panic"; `:224` includes `roc` in the ARM-prohibitive set.
- **Code:** `src/types/index.ts:130` includes `"roc"` in the `Language` union; `src/lib/judge/languages.ts:1430-1440` defines an active `roc` config with `dockerImage: "judge-roc:latest"` and a `roc build` compile command; `docker/Dockerfile.judge-roc` exists.
- **Problem:** The language is treated as a first-class supported variant in code but is documented as disabled and excluded from the `all` preset.
- **Failure scenario:** An operator building the `all` preset from `docs/languages.md` skips `roc` and later cannot explain why submissions in `roc` fail to validate in the UI, or why the admin language list shows a language that the docs say is disabled.
- **Suggested fix:** Remove `roc` from the "Disabled Languages" section and the ARM-prohibitive set in `docs/languages.md`; update the preset description and E2E/image counts accordingly.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Outdated

### DOC-31: Language image-count claims are still stale

- **Doc:** `README.md:77` ("102 language-specific Docker images"), `docs/languages.md:192` ("102 of 102 images build on ARM64").
- **Code:** `src/lib/judge/languages.ts` references **99** distinct `dockerImage` values. `docker/Dockerfile.judge-*` files total **102**; three (`judge-j`, `judge-malbolge`, `judge-simula`) are not referenced by any active config.
- **Problem:** The docs continue to conflate "Dockerfiles in the repo" with "images used by submittable languages." After `roc` was re-enabled, the active image count rose from 98 to 99, but the docs still say 102.
- **Failure scenario:** Capacity and build-time planning from the README overestimates by three orphan images. The "102 of 102 build on ARM64" claim also conflicts with the ARM-prohibitive set, which excludes languages whose Dockerfiles still exist.
- **Suggested fix:** Update the claims to "99 active language images" and "102 language Dockerfiles (3 not yet bound to active configs)." Remove or annotate the orphan rows in `README.md`.
- **Severity:** LOW  
- **Confidence:** High  
- **Classification:** Outdated

---

## Validated / Upgraded Cycle 2 Findings

The following findings from the 2026-07-01 review were re-checked against the current working tree. They are **still present** unless noted.

### DOC-1 — `docs/api.md` omits 34 live `/api/v1` endpoints
**Status:** Still present. `src/app/api/v1/**` contains the same undocumented routes listed in the prior review (auth password/reset/verify, code snapshots, community, contest sub-resources, exam sessions, health, playground, problems import/draft, recruiting validate, submissions queue-status, admin submissions export/rejudge/test-email). The env-hardening cycle did not touch API docs.

### DOC-2 — `flix` documented as `judge-jvm`, actual image is `judge-flix`
**Status:** Still present. `AGENTS.md:113` and `docs/languages.md:73` list `judge-jvm`; `src/lib/judge/languages.ts` uses `judge-flix:latest`.

### DOC-3 — `flix` simultaneously arm64-ready and ARM-prohibitive
**Status:** Still present. `docs/languages.md:73` shows checkmarks for arm64; `:224` includes `flix` in the ARM-prohibitive set; `deploy-docker.sh:220` also excludes it from `all`.

### DOC-4 — `roc` language support
**Status:** Resolved in code, upgraded to DOC-30. The TypeScript `Language` union (`src/types/index.ts:130`) and Rust worker now include `roc`, and `src/lib/judge/languages.ts:1430-1440` has an active config. The docs still mark it disabled, so the mismatch has migrated from "doc says active but code rejects" to "code supports but docs disable."

### DOC-5 — README image-size table lists orphan images
**Status:** Partially resolved. `judge-roc` is now a legitimate active image. `judge-j` (`README.md:94`) and `judge-malbolge` (`README.md:86`) still have no active language config and remain orphan rows.

### DOC-6 — Similarity-check auth
**Status:** Still present. `docs/api.md:1091` says "Instructor or above"; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` also grants access to assistants with `anti_cheat.run_similarity` who are group TAs or assigned to the teaching group. This is now bundled with the broader similarity-check doc staleness in DOC-28.

### DOC-7 — App container internal port
**Status:** Still present. `docs/deployment.md:7` says "app container listens on port `3100` internally"; `docker-compose.production.yml:96` maps `127.0.0.1:3100:3000`, so the app listens on `3000` inside the container.

### DOC-8 — Capability count 43 vs. 46
**Status:** Still present. `README.md:29` and `AGENTS.md` state 43 capabilities; `src/lib/capabilities/types.ts:8-80` defines 46 (`community.moderate`, `recruiting.manage_invitations`, `content.view_own_submissions` are the additions).

### DOC-9 — Active Docker image count
**Status:** Still present, count updated. README/docs claim 102 active images; active configs now reference 99 distinct images (was 98 before `roc` was re-enabled). Three Dockerfiles remain orphans (`judge-j`, `judge-malbolge`, `judge-simula`). See DOC-31.

### DOC-10 — `all` preset disagreement
**Status:** Still present. `docs/languages.md:214-220` says `all` excludes the 18 ARM-prohibitive languages; `scripts/setup.sh:59-149` includes those languages in its `all` preset.

### DOC-11 — Preset size estimates stale
**Status:** Still present. `docs/deployment.md:80-81` lists core ~0.8 GB, popular ~2.5 GB, extended ~8 GB; `deploy-docker.sh:268-277` and `AGENTS.md:375` use core ~1.2 GB, popular ~4 GB, extended ~12 GB.

### DOC-12 / DOC-13 — Docker image API auth
**Status:** Still present. `docs/api.md:1668` says Docker image list requires "Admin or Super Admin" while `:1678,1693,1704,1718` correctly say `system.settings`. `AGENTS.md:260-261` still says "Admin/super_admin only." All three route handlers check `system.settings`.

### DOC-14 — Contest join rate limits
**Status:** Still present. `docs/api.md:943` lists only `contest:join`; `src/app/api/v1/contests/join/route.ts:34-41` additionally consumes `contest:join:invalid` and `contest:join:invalid-code` on failed redemption.

### DOC-15 — `judge-haskell` base image reported three ways
**Status:** Still present. `docker/Dockerfile.judge-haskell:1` is `FROM alpine:3.21`; `AGENTS.md:210` says `ghc:9.4-alpine`; `src/lib/judge/languages.ts:111` runtime info says `Debian Bookworm / GHC 9.4`.

### DOC-16 — E2E totals report 113 languages
**Status:** Still present. `docs/languages.md:194-204` reports the March 29 113-language snapshot; active variant count is 125.

### DOC-17 — AGENTS language table row count
**Status:** Still present. `AGENTS.md:20` claims 125 variants; the table (`AGENTS.md:22-150`) contains 126 rows including `6b`, `8b`, and the now-active `roc` row.

### DOC-18 — Orphan `judge-simula` Dockerfile
**Status:** Still present. `docker/Dockerfile.judge-simula` exists; no entry in `src/types/index.ts`, `src/lib/judge/languages.ts`, or docs.

### DOC-19 — New-language checklist omits Rust runner validation
**Status:** Still present. `AGENTS.md:151-159` checklist stops before `judge-worker-rs/src/languages.rs` and runner-side validation, despite production deployments delegating to the Rust runner.

### DOC-20 — README omits `everything` preset
**Status:** Still present. `README.md:71` lists `core`, `popular`, `extended`, `all`; `docs/languages.md:214-220`, `AGENTS.md:375`, and `deploy-docker.sh:268-277` document `everything`.

### DOC-21 — Admin/problem endpoints lack body/response details
**Status:** Still present. Partially documented endpoints (admin worker stats, docker prune, plugin patch, problem export/compute-expected, etc.) still do not include full request/response schemas.

### DOC-22 — `SECURITY.md` code-similarity path wording
**Status:** Low impact. `code-similarity-rs/` exists, so the path is technically correct. The root-level `Dockerfile.code-similarity` is not under that directory, which can confuse contributors. Consider clarifying.

### DOC-24 — Data-retention legal hold restart claim
**Status:** Still present. `docs/data-retention-policy.md:38` says a restart is required; `src/lib/data-retention.ts:46-52` re-reads `DATA_RETENTION_LEGAL_HOLD` every prune cycle.

---

## Verified Cycle-3 Code Fixes (resolved issues, noted for documentation completeness)

These aggregate-level findings are no longer active in the code. They are listed because the documentation should reference the current behavior if it ever describes nginx or proxy behavior.

1. **Generated nginx catch-all body size** — `deploy-docker.sh:1629` and `:1707` now set `client_max_body_size 50M;` in `location /`, resolving the prior CRITICAL `413` issue for uploads.
2. **X-Forwarded-For chain preservation** — `deploy-docker.sh:1596,1611,1623,1636` and `scripts/online-judge.nginx.conf:62-100` use `$proxy_add_x_forwarded_for`, and the generated config explicitly avoids `X-Forwarded-Host` (`deploy-docker.sh:1598,1612`).
3. **Baseline nginx security headers** — `deploy-docker.sh:1583-1587`, `static-site/nginx.conf:25-29`, `static-site/static.nginx.conf:24-28`, and `scripts/online-judge.nginx.conf:51-56` all set `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, and `Strict-Transport-Security`.
4. **Static-site directory listing** — `static-site/nginx.conf:45` sets `autoindex off;`.
5. **Compiler validation before Rust runner delegation** — `src/lib/compiler/execute.ts:709-759` validates Docker image, source size, compile command, and run command before calling `tryRustRunner`, matching the cycle-3 plan.
6. **IP extraction X-Real-IP fallback** — `src/lib/security/ip.ts:189-193` only uses `X-Real-IP` when `X-Forwarded-For` is absent, as documented in the cycle-3 plan.

---

## Final Sweep Notes

| Area | Verdict | Notes |
|------|---------|-------|
| `docs/deployment.md` | Drift | Port mapping, preset sizes, `AUTH_TRUST_HOST` default, and missing env vars remain the main issues. Nginx body-size scoping is now a fresh gap. |
| `docs/api.md` | Drift | Similarity-check docs are now significantly stale; contest join rate limits and Docker image auth still wrong; 34 endpoints still undocumented. |
| `docs/languages.md` | Drift | `flix`/`roc`/ARM-prohibitive contradictions, stale image counts, and stale E2E totals persist. The `roc` re-enable created a new contradiction. |
| `AGENTS.md` | Drift | Language table count, `flix`/`haskell` base, capability count, Docker auth wording, and setup preset mismatch remain. |
| `README.md` | Drift | Capability count, image count, orphan image rows, and missing `everything` preset remain. |
| `docs/admin-security-operations.md` | Drift | No guidance on `TRUSTED_PROXY_HOPS` or the new X-Real-IP fallback semantics. |
| `docs/data-retention-policy.md` | Minor drift | Legal-hold restart claim still wrong. |
| `static-site/nginx.conf` / generated nginx | Clean (code) | Headers, autoindex, body-size, and XFF handling are now correct; docs do not contradict them, they simply do not describe them. |

## Suggested Remediation Order

1. **API docs accuracy** — fix similarity-check auth/response/timeout (DOC-28), contest join rate limits (DOC-14), Docker image auth inconsistency (DOC-12/DOC-13), and begin documenting the 34 missing endpoints (DOC-1/DOC-21).
2. **Deployment guide** — fix internal port (DOC-7), preset sizes (DOC-11), `AUTH_TRUST_HOST` default contradiction (DOC-25), and add the missing env vars (DOC-26). Document nginx body-size scoping (DOC-27).
3. **Language inventory** — reconcile `roc` status (DOC-30), `flix` image and ARM status (DOC-2/DOC-3), update active image count to 99 (DOC-9/DOC-31), fix `haskell` base description (DOC-15), and refresh E2E totals (DOC-16/DOC-17).
4. **Security ops guide** — add `TRUSTED_PROXY_HOPS`/XFF/X-Real-IP documentation (DOC-29).
5. **README/AGENTS polish** — update capability count (DOC-8), preset list (DOC-20), orphan image rows (DOC-5), and image count (DOC-9/DOC-31).
6. **Data retention** — correct the legal-hold restart claim (DOC-24).
