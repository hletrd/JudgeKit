# Document-Specialist Review — JudgeKit

**Date:** 2026-07-03  
**Scope:** `README.md`, `AGENTS.md`, `SECURITY.md`, `CLAUDE.md`, `.env.example`, `.env.production.example`, `docs/**/*.md`, `deploy-docker.sh`, `deploy.sh`, `docker-compose.production.yml`, `docker-compose.worker.yml`, `static-site/nginx.conf`, `scripts/*.nginx.conf`, `src/app/api/v1/**`, `src/lib/**`, and the Rust worker/sidecar sources they describe.  
**Method:** Built an inventory of documentation and authoritative source files; read every relevant doc, env example, deployment script, compose file, and representative API route/source file; compared claims against implementation; performed a final sweep for stale docs and missing documentation.

## Executive Summary

- **38 documentation/code mismatches** identified (DOC-1 through DOC-38).
- **Highest severity clusters:**
  - **Environment examples / deployment secrets:** `.env.example` and `.env.production.example` omit multiple required production variables, and `deploy.sh` generates an incomplete `.env.production` (DOC-32, DOC-38).
  - **API documentation:** `docs/api.md` is stale for the similarity-check endpoint, omits rate-limit buckets, misstates Docker image auth, and is missing ~34 live endpoints (DOC-1, DOC-6, DOC-12, DOC-13, DOC-14, DOC-21, DOC-28).
  - **Language inventory:** `flix`/`roc` status, ARM-prohibitive set, image counts, and preset descriptions disagree with `src/lib/judge/languages.ts` and `scripts/setup.sh` (DOC-2 through DOC-5, DOC-9, DOC-10, DOC-15, DOC-16, DOC-17, DOC-30, DOC-31).
  - **Deployment scripts / nginx:** `deploy.sh` uses `/compiler-workspaces` while the production stack uses `/judge-workspaces`; the HTTP-only nginx template emits `Strict-Transport-Security`; generated nginx body-size scoping is undocumented (DOC-27, DOC-34, DOC-35).
- **3 prior aggregate-level nginx issues** are verified fixed in `deploy-docker.sh` (catch-all body size, XFF chain preservation, baseline security headers) and are listed in the "Verified Code Fixes" section.
- The largest remaining drift class is **API documentation**, followed by **environment/deployment documentation** and the **language inventory**.

## Findings Register

| ID | Severity | Area | Citation | Finding |
|----|----------|------|----------|---------|
| DOC-1 | High | API docs | `docs/api.md:1-2037` vs. `src/app/api/v1/**` | Omits 34 live `/api/v1` endpoints. |
| DOC-2 | High | Languages | `AGENTS.md:113`, `docs/languages.md:73` vs. `src/lib/judge/languages.ts` | `flix` documented as `judge-jvm`; code uses `judge-flix`. |
| DOC-3 | High | Languages | `docs/languages.md:73` vs. `:224` | `flix` marked arm64-ready and also ARM-prohibitive. |
| DOC-4 | High | Languages | `src/types/index.ts:30-157`, `src/lib/judge/languages.ts:1430-1440` vs. `docs/languages.md:210`, `:224` | `roc` is active in code but still listed as disabled/ARM-prohibitive. |
| DOC-5 | High | Images | `README.md:86,94,104` vs. `src/lib/judge/languages.ts` | `judge-roc` is now active; `judge-j` and `judge-malbolge` remain orphan images. |
| DOC-6 | High | API docs | `docs/api.md:1089-1091` vs. `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` | Similarity-check auth described as "Instructor or above"; code also allows assistants with `anti_cheat.run_similarity`. |
| DOC-7 | Medium | Deployment | `docs/deployment.md:7` vs. `docker-compose.production.yml:96` | App container internal port stated as `3100`; actual internal port is `3000`. |
| DOC-8 | Medium | Capabilities | `README.md:29`, `AGENTS.md` vs. `src/lib/capabilities/types.ts:8-80` | Docs claim 43 capabilities; code defines 46. |
| DOC-9 | Medium | Images | `README.md:77`, `docs/languages.md:192` vs. `src/lib/judge/languages.ts` | Docs claim 102 active images; active configs reference 99 distinct images. |
| DOC-10 | Medium | Presets | `docs/languages.md:214-220`, `scripts/setup.sh:59-149` | `setup.sh` `all` preset includes ARM-prohibitive languages; docs say it excludes them. |
| DOC-11 | Medium | Deployment | `docs/deployment.md:80-81` vs. `deploy-docker.sh:268-277`, `AGENTS.md:375` | Preset size estimates are stale (core 0.8 vs. 1.2 GB, etc.). |
| DOC-12 | Medium | API docs | `docs/api.md:1666-1668` vs. `src/app/api/v1/admin/docker/images/route.ts:55` | Docker images `GET` auth described as "Admin or Super Admin"; code requires `system.settings`. |
| DOC-13 | Medium | Agent guide | `AGENTS.md:260-261` vs. `src/app/api/v1/admin/docker/images/build/route.ts:19`, `src/app/api/v1/admin/docker/images/route.ts:93,165` | Docker build/delete auth described as "Admin/super_admin only"; code requires `system.settings`. |
| DOC-14 | Medium | API docs | `docs/api.md:941-943` vs. `src/app/api/v1/contests/join/route.ts:27-42` | Contest join docs omit the two failure-scoped rate-limit buckets. |
| DOC-15 | Medium | Languages | `AGENTS.md:210`, `src/lib/judge/languages.ts:111` vs. `docker/Dockerfile.judge-haskell:1` | `judge-haskell` base reported three different ways (Alpine 3.21, ghc:9.4-alpine, Debian Bookworm). |
| DOC-16 | Low | Languages | `docs/languages.md:194-204` vs. `src/types/index.ts:30-157` | E2E summary reports 113-language scope; active count is 125. |
| DOC-17 | Low | Languages | `AGENTS.md:20`, `AGENTS.md:22-150` | Language table has 126 rows while docs claim 125 variants. |
| DOC-18 | Low | Images | `docker/Dockerfile.judge-simula` vs. `src/types/index.ts`, `src/lib/judge/languages.ts` | Orphan Dockerfile with no language binding. |
| DOC-19 | Low | Developer guide | `AGENTS.md:151-159` vs. `judge-worker-rs/src/languages.rs`, `src/lib/compiler/execute.ts` | New-language checklist omits Rust runner-side validation. |
| DOC-20 | Low | README | `README.md:71` vs. `docs/languages.md:214-220`, `AGENTS.md:375` | README preset list omits the `everything` preset. |
| DOC-21 | Low | API docs | `docs/api.md` | Several admin/problem endpoints lack request/response body details. |
| DOC-22 | Low | Security | `SECURITY.md:20` vs. `code-similarity-rs/`, `Dockerfile.code-similarity` | Path wording is technically correct but could be clearer about the root-level Dockerfile. |
| DOC-23 | Low | API docs | `docs/api.md:1936-1944` vs. `src/app/api/internal/cleanup/route.ts` | Path and `CRON_SECRET` auth match implementation. |
| DOC-24 | Medium | Data retention | `docs/data-retention-policy.md:38` vs. `src/lib/data-retention.ts:46-52` | Legal hold said to require restart; code re-reads the env var every prune cycle. |
| DOC-25 | Medium | Deployment | `docs/deployment.md:18,44` vs. `deploy-docker.sh:750`, `docker-compose.production.yml:115`, `src/lib/security/env.ts:260-265` | `AUTH_TRUST_HOST` table says default `false`; example, generated `.env.production`, and compose default to `true`. |
| DOC-26 | Medium | Deployment | `docs/deployment.md:40-63` vs. `.env.example`, `.env.production.example`, `deploy-docker.sh` | Env var reference omits operational/security variables such as `TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `COMPILER_RUNNER_URL`, `SKIP_POST_DEPLOY_PRUNE`. |
| DOC-27 | Medium | Deployment / API | `docs/deployment.md`, `docs/api.md` vs. `deploy-docker.sh:1589-1629` | Generated nginx body-size scoping is undocumented: `/api/auth/` and `/api/v1/judge/` are limited to `1m`, while app defaults allow `50M`. |
| DOC-28 | High | API docs | `docs/api.md:1089-1098` vs. `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:26-97`, `src/lib/assignments/code-similarity.ts:248-253` | Docs say similarity-check returns `504` on timeout and only `{ flaggedPairs }`; actual response is `200` with `status`, `reason`, `pairs`, enriched usernames, etc. |
| DOC-29 | Medium | Security ops | `docs/admin-security-operations.md:67-77` vs. `src/lib/security/ip.ts:11-205`, `.env.example:175-182` | No documentation for `TRUSTED_PROXY_HOPS`, XFF chain expectations, or X-Real-IP fallback rules. |
| DOC-30 | Medium | Languages | `docs/languages.md:210,224` vs. `src/types/index.ts:130`, `src/lib/judge/languages.ts:1430-1440`, `docker/Dockerfile.judge-roc` | `roc` is re-enabled in code but still listed as disabled and ARM-prohibitive. |
| DOC-31 | Low | Languages | `docs/languages.md:192`, `README.md:77` vs. `src/lib/judge/languages.ts`, `docker/Dockerfile.judge-*` | Image-count claims still say 102 active; 99 are referenced by active configs, 3 Dockerfiles are orphans. |
| DOC-32 | High | Environment examples | `.env.example`, `.env.production.example` vs. `src/lib/security/production-config.ts`, `docker-compose.production.yml` | Required production env vars `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, `POSTGRES_PASSWORD`, and `COMPILER_RUNNER_URL` are absent from both examples. |
| DOC-33 | Medium | Environment examples | `.env.example`, `.env.production.example` vs. `deploy-docker.sh:25,34,67` | Deploy/operational knobs `LANGUAGE_FILTER`, `LANGUAGE_BUILD_STRATEGY`, `SKIP_POST_DEPLOY_PRUNE` are undocumented in example files. |
| DOC-34 | Medium | Nginx | `scripts/online-judge.nginx-http.conf:27` vs. file header `:2-4` | HTTP-only dev template emits `Strict-Transport-Security`, contradicting its "NEVER use in production" purpose. |
| DOC-35 | High | Deployment scripts | `deploy.sh:160-161` vs. `docker-compose.production.yml:146`, `docs/deployment.md:8` | Legacy `deploy.sh` creates `/compiler-workspaces`; production stack and docs use `/judge-workspaces`. |
| DOC-36 | High | Deployment scripts | `deploy.sh:75-93` vs. `src/lib/security/production-config.ts:11-35`, `docker-compose.production.yml:49,184,205` | `deploy.sh` generates `.env.production` without `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, or `NODE_ENCRYPTION_KEY`, causing startup/compose failures. |
| DOC-37 | Low | Environment examples | `.env.example:91` vs. `docker-compose.production.yml:146`, `docs/deployment.md:8` | Local `COMPILER_WORKSPACE_DIR=/compiler-workspaces` example conflicts with production `/judge-workspaces` path. |
| DOC-38 | Low | API docs / inline | `docs/api.md:941-943` vs. `src/app/api/v1/contests/join/route.ts:46-49` | Response body docs omit `alreadyEnrolled` boolean returned by the handler. |

---

## Environment & Configuration

### DOC-32: Environment example files omit required production variables

- **Doc:** `.env.example` (local template) and `.env.production.example` (production template).
- **Code:** `src/lib/security/production-config.ts:11-35` requires `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, and `NODE_ENCRYPTION_KEY`. `docker-compose.production.yml:49,184,205` uses `${POSTGRES_PASSWORD:?...}`, `${CODE_SIMILARITY_AUTH_TOKEN:?...}`, and `${RATE_LIMITER_AUTH_TOKEN:?...}`. `docker-compose.production.yml:116` uses `COMPILER_RUNNER_URL`.
- **Problem:** Neither example file contains `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, `POSTGRES_PASSWORD`, or `COMPILER_RUNNER_URL`. A user copying `.env.production.example` to `.env.production` and filling only the visible blanks will see the app exit at startup (missing `CRON_SECRET`, etc.) and `docker compose up` will fail with variable-required errors for `POSTGRES_PASSWORD` and the sidecar tokens.
- **Failure scenario:** An operator follows `docs/deployment.md:12` ("Start from `.env.example` and set at least..."), fills only the variables shown in the doc, and runs `docker compose -f docker-compose.production.yml up -d`. Compose aborts because `POSTGRES_PASSWORD` and sidecar tokens are unset. After manually setting those, the app container exits with `Missing required production environment variables: CRON_SECRET` because the example never listed it.
- **Suggested fix:** Add `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, `POSTGRES_PASSWORD`, and `COMPILER_RUNNER_URL` to both `.env.example` and `.env.production.example` with placeholder comments. Ensure `.env.production.example` also documents `NODE_ENCRYPTION_KEY` (it already does) and that all required variables are co-located.
- **Severity:** HIGH  
- **Confidence:** High  
- **Classification:** Missing / inconsistent

### DOC-33: Example files omit deploy script knobs

- **Doc:** `.env.example`, `.env.production.example`.
- **Code:** `deploy-docker.sh:25` (`LANGUAGE_FILTER`), `:34` (`SKIP_POST_DEPLOY_PRUNE`), `:67` (`LANGUAGE_BUILD_STRATEGY`) read these variables; the script header documents them.
- **Problem:** The variables control which language images are built, how they are built, and whether post-deploy cleanup runs, but they are not present in either env example.
- **Failure scenario:** An operator wants to deploy only the `core` preset and sets `LANGUAGE_FILTER=core` in `.env.production` after seeing it in `deploy-docker.sh --help` output, but `.env.production.example` gives no guidance on valid values. Another operator accidentally prunes debugging artifacts because `SKIP_POST_DEPLOY_PRUNE` is not discoverable from the example.
- **Suggested fix:** Add commented-out entries for `LANGUAGE_FILTER`, `LANGUAGE_BUILD_STRATEGY`, and `SKIP_POST_DEPLOY_PRUNE` to `.env.production.example` (and `.env.example` if local builds use them).
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Missing

### DOC-37: Local `COMPILER_WORKSPACE_DIR` example path conflicts with production

- **Doc:** `.env.example:91` (`# COMPILER_WORKSPACE_DIR=/compiler-workspaces`).
- **Code:** `docker-compose.production.yml:146` mounts `/judge-workspaces:/judge-workspaces`; `docs/deployment.md:8` says `/judge-workspaces` is required on the host.
- **Problem:** The local example suggests a workspace path that no longer matches the production convention. The legacy `deploy.sh` also uses `/compiler-workspaces` (DOC-35), deepening the inconsistency.
- **Failure scenario:** A contributor sets `COMPILER_WORKSPACE_DIR=/compiler-workspaces` locally and later deploys with `deploy-docker.sh`; sibling containers and the production compose expect `/judge-workspaces`, so workspace sharing and cleanup fail.
- **Suggested fix:** Update `.env.example` to `# COMPILER_WORKSPACE_DIR=/judge-workspaces` and add a comment that the path must match the production host mount.
- **Severity:** LOW  
- **Confidence:** Medium  
- **Classification:** Inconsistent

---

## Deployment & API Documentation

### DOC-25: `docs/deployment.md` contradicts production defaults for `AUTH_TRUST_HOST`

- **Doc:** `docs/deployment.md:18` example `.env.production` sets `AUTH_TRUST_HOST=true`; `:44` env table says default `false`.
- **Code:** `deploy-docker.sh:750` generates `.env.production` with `AUTH_TRUST_HOST=true`; `docker-compose.production.yml:115` defaults `AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-true}`; `src/lib/security/env.ts:260-265` returns `process.env.AUTH_TRUST_HOST === "true"`.
- **Problem:** The environment reference table tells operators the default is `false`, while every production path ships `true`.
- **Failure scenario:** An operator reads the table, believes the app defaults to strict host validation, and does not explicitly set the variable. The generated production file and compose still set `true`, changing Auth.js trust behavior without the operator realizing it. Conversely, an operator who sets `false` because the table says it is the default may break reverse-proxy Auth.js flows that the docs elsewhere say require `true`.
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

### DOC-38: `docs/api.md` contest join response omits `alreadyEnrolled`

- **Doc:** `docs/api.md:941-943` response shows `{ "data": { "assignmentId": "...", "groupId": "..." } }`.
- **Code:** `src/app/api/v1/contests/join/route.ts:45-49` returns `{ assignmentId, groupId, alreadyEnrolled: result.alreadyEnrolled ?? false }`.
- **Problem:** The documented response schema is missing the `alreadyEnrolled` boolean that the handler always emits.
- **Failure scenario:** A typed client generated from the docs fails to compile or silently drops the field, causing the UI to show a "newly enrolled" confirmation even when the user was already enrolled.
- **Suggested fix:** Add `alreadyEnrolled: boolean` to the contest join response example in `docs/api.md`.
- **Severity:** LOW  
- **Confidence:** High  
- **Classification:** Outdated

### DOC-7: `docs/deployment.md` misstates the app container's internal port

- **Doc:** `docs/deployment.md:7` says "app container listens on port `3100` internally".
- **Code:** `docker-compose.production.yml:96` maps `127.0.0.1:3100:3000`, so the app listens on `3000` inside the container.
- **Problem:** Internal vs. external port confusion.
- **Failure scenario:** An operator debugging inside the container curls `localhost:3100` and gets connection refused, wasting time because the app is on `3000` internally.
- **Suggested fix:** Change the doc to "app container listens on port `3000` internally; nginx forwards `3100` on the host to `3000` in the container."
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Incorrect

---

## Language Inventory

### DOC-2: `flix` documented as `judge-jvm`, actual image is `judge-flix`

- **Doc:** `AGENTS.md:113` and `docs/languages.md:73` list `judge-jvm`.
- **Code:** `src/lib/judge/languages.ts` uses `judge-flix:latest`.
- **Problem:** Wrong image name in both docs.
- **Failure scenario:** An admin following the docs tries to build `judge-jvm` for Flix and cannot find the right Dockerfile; submissions fail because the runtime config expects `judge-flix`.
- **Suggested fix:** Update both tables to `judge-flix`.
- **Severity:** HIGH  
- **Confidence:** High  
- **Classification:** Incorrect

### DOC-3: `flix` simultaneously arm64-ready and ARM-prohibitive

- **Doc:** `docs/languages.md:73` shows arm64 checkmark; `:224` includes `flix` in the ARM-prohibitive set; `deploy-docker.sh:220` excludes it from `all`.
- **Code:** `src/lib/judge/languages.ts` active config for `flix` exists.
- **Problem:** The same language is claimed to build on arm64 and also excluded from arm64 deploys.
- **Failure scenario:** Capacity planning assumes Flix is arm64-ready, but the deploy preset skips it, causing silent omissions in production.
- **Suggested fix:** Remove the arm64 checkmark if the exclusion is intentional, or remove `flix` from the ARM-prohibitive set if the image builds reliably.
- **Severity:** HIGH  
- **Confidence:** High  
- **Classification:** Inconsistent

### DOC-4 / DOC-30: `roc` is active in code but documented as disabled

- **Doc:** `docs/languages.md:210` lists `roc` in "Disabled Languages" with the note "Upstream compiler panic"; `:224` includes `roc` in the ARM-prohibitive set.
- **Code:** `src/types/index.ts:130` includes `"roc"` in the `Language` union; `src/lib/judge/languages.ts:1430-1440` defines an active `roc` config with `dockerImage: "judge-roc:latest"`; `docker/Dockerfile.judge-roc` exists.
- **Problem:** The language is treated as a first-class supported variant in code but is documented as disabled and excluded from the `all` preset.
- **Failure scenario:** An operator building the `all` preset from `docs/languages.md` skips `roc` and later cannot explain why submissions in `roc` fail to validate in the UI, or why the admin language list shows a language that the docs say is disabled.
- **Suggested fix:** Remove `roc` from the "Disabled Languages" section and the ARM-prohibitive set in `docs/languages.md`; update the preset description and E2E/image counts accordingly.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Outdated

### DOC-5 / DOC-31: Orphan images and stale active-image counts

- **Doc:** `README.md:77` claims "102 language-specific Docker images" and `docs/languages.md:192` says "102 of 102 images build on ARM64".
- **Code:** `src/lib/judge/languages.ts` references 99 distinct `dockerImage` values. `docker/Dockerfile.judge-*` files total 102; three (`judge-j`, `judge-malbolge`, `judge-simula`) are not referenced by any active config. `judge-roc` is now legitimate.
- **Problem:** Docs conflate "Dockerfiles in the repo" with "images used by submittable languages."
- **Failure scenario:** Capacity and build-time planning from the README overestimates by three orphan images. The "102 of 102 build on ARM64" claim also conflicts with the ARM-prohibitive set.
- **Suggested fix:** Update claims to "99 active language images" and "102 language Dockerfiles (3 not yet bound to active configs)." Remove or annotate orphan rows in `README.md`.
- **Severity:** LOW  
- **Confidence:** High  
- **Classification:** Outdated

### DOC-10: `all` preset disagreement

- **Doc:** `docs/languages.md:214-220` says `all` excludes the 18 ARM-prohibitive languages.
- **Code:** `scripts/setup.sh:59-149` includes those languages in its `all` preset.
- **Problem:** The same preset name has different membership in docs vs. setup script.
- **Failure scenario:** A developer runs `bash scripts/setup.sh all` expecting the doc behavior and builds ~18 extra large images on an ARM64 machine.
- **Suggested fix:** Align `setup.sh` with the docs or rename one of the presets (e.g., `setup.sh all` → `everything`).
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Inconsistent

### DOC-11: Preset size estimates stale

- **Doc:** `docs/deployment.md:80-81` lists core ~0.8 GB, popular ~2.5 GB, extended ~8 GB.
- **Code:** `deploy-docker.sh:268-277` and `AGENTS.md:375` use core ~1.2 GB, popular ~4 GB, extended ~12 GB.
- **Problem:** Size estimates diverge.
- **Failure scenario:** Disk provisioning is based on stale low estimates and runs out of space during the first deploy.
- **Suggested fix:** Update `docs/deployment.md` to match the current measured sizes.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Outdated

### DOC-15: `judge-haskell` base image reported three different ways

- **Doc:** `AGENTS.md:210` says `ghc:9.4-alpine`; `src/lib/judge/languages.ts:111` runtime info says `Debian Bookworm / GHC 9.4`.
- **Code:** `docker/Dockerfile.judge-haskell:1` is `FROM alpine:3.21`.
- **Problem:** Three incompatible descriptions.
- **Failure scenario:** A maintainer debugging image size or ABI issues is misled about the actual base.
- **Suggested fix:** Standardize on the true base (`alpine:3.21` with GHC 9.4) across all three locations.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Inconsistent

---

## Security Operations & nginx

### DOC-29: `docs/admin-security-operations.md` lacks reverse-proxy IP trust documentation

- **Doc:** `docs/admin-security-operations.md:67-77` discusses reverse-proxy perimeter controls but never mentions IP extraction mechanics.
- **Code:** `src/lib/security/ip.ts:11-205` implements `TRUSTED_PROXY_HOPS`, XFF chain validation, IPv4-mapped-IPv6 unwrapping, IPv6 canonicalization, and X-Real-IP fallback only when XFF is absent. `.env.example:175-182` documents the variables only in the example file.
- **Problem:** The cycle-3 change to IP extraction has no admin-facing documentation. Operators must read `src/lib/security/ip.ts` to understand how to configure `TRUSTED_PROXY_HOPS` or why `X-Real-IP` is ignored when XFF is present.
- **Failure scenario:** A deployment behind Cloudflare plus origin nginx sets `TRUSTED_PROXY_HOPS=1` but receives `X-Forwarded-For: <client>, <cloudflare>, <origin-nginx>`. `extractClientIp` returns `null`, so rate-limit keys fall back to a global bucket and judge IP allowlists deny legitimate workers. The operator has no runbook to diagnose this.
- **Suggested fix:** Add a section to `docs/admin-security-operations.md` describing `TRUSTED_PROXY_HOPS`, the required minimum XFF hop count, X-Real-IP fallback behavior, and IPv6 canonicalization.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Missing

### DOC-34: HTTP-only nginx template emits HSTS

- **Doc:** `scripts/online-judge.nginx-http.conf:2-4` says "HTTP-only configuration — for local development/testing ONLY. NEVER use this configuration in production."
- **Code:** `scripts/online-judge.nginx-http.conf:27` adds `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;`.
- **Problem:** HSTS is meaningless over plain HTTP and can mislead browsers if the template is ever copied to a TLS-terminated server without editing. It also contradicts the file's own warning.
- **Failure scenario:** A developer copies the HTTP template to a temporary TLS-enabled staging host and forgets to remove HSTS; browsers preload the policy and later refuse to access the HTTP dev instance.
- **Suggested fix:** Remove the `Strict-Transport-Security` header from `scripts/online-judge.nginx-http.conf`.
- **Severity:** MEDIUM  
- **Confidence:** High  
- **Classification:** Incorrect

---

## Deployment Scripts

### DOC-35: `deploy.sh` uses `/compiler-workspaces` instead of `/judge-workspaces`

- **Doc:** `docs/deployment.md:8` says `/judge-workspaces` directory on the host is mounted into the worker container.
- **Code:** `deploy.sh:160-161` runs `sudo mkdir -p /compiler-workspaces && sudo chown 1001:1001 /compiler-workspaces && sudo chmod 0700 /compiler-workspaces`.
- **Problem:** The legacy script prepares the wrong host path. `docker-compose.production.yml:146` mounts `/judge-workspaces:/judge-workspaces` and `:154` sets `TMPDIR=/judge-workspaces`.
- **Failure scenario:** An operator uses `deploy.sh` for a first deploy. The worker container starts with an uncreated `/judge-workspaces` mount, so sandboxed submissions cannot write temp files and all judging fails with filesystem errors.
- **Suggested fix:** Update `deploy.sh` to create `/judge-workspaces` with the same ownership/permissions. Add a deprecation note pointing to `deploy-docker.sh`.
- **Severity:** HIGH  
- **Confidence:** High  
- **Classification:** Incorrect

### DOC-36: `deploy.sh` generates an incomplete `.env.production`

- **Doc:** `deploy.sh:75-93` generates `.env.production` with `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `DB_DIALECT`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `PLUGIN_CONFIG_ENCRYPTION_KEY`, `JUDGE_AUTH_TOKEN`, and rate-limit defaults.
- **Code:** `src/lib/security/production-config.ts:11-35` requires `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, and `NODE_ENCRYPTION_KEY`. `docker-compose.production.yml:184,205` requires the sidecar tokens. In contrast, `deploy-docker.sh:742-744,752-760` generates all required tokens.
- **Problem:** The legacy script's generated env file does not satisfy the production startup gate or the compose contract.
- **Failure scenario:** An operator runs `deploy.sh` on a new host. The app container exits immediately with the production-config error, and the sidecar containers refuse to start because their tokens are undefined.
- **Suggested fix:** Add `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, and `NODE_ENCRYPTION_KEY` to the generated `.env.production` in `deploy.sh`, matching `deploy-docker.sh`. Or remove the generation step and require operators to provide a complete `.env.production`.
- **Severity:** HIGH  
- **Confidence:** High  
- **Classification:** Missing / incorrect

---

## Additional Findings from Prior Reviews (Still Present)

The following findings were validated against the current working tree and remain unchanged.

### DOC-1 — `docs/api.md` omits 34 live `/api/v1` endpoints
**Status:** Still present. `src/app/api/v1/**` contains undocumented routes including auth password/reset/verify, code snapshots, community, contest sub-resources, exam sessions, health, playground, problems import/draft, recruiting validate, submissions queue-status, admin submissions export/rejudge/test-email.

### DOC-6 — Similarity-check auth understated
**Status:** Still present. `docs/api.md:1091` says "Instructor or above"; `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24` also grants access to assistants with `anti_cheat.run_similarity` who are group TAs or assigned to the teaching group.

### DOC-8 — Capability count 43 vs. 46
**Status:** Still present. `README.md:29` and `AGENTS.md` state 43 capabilities; `src/lib/capabilities/types.ts:8-80` defines 46 (`community.moderate`, `recruiting.manage_invitations`, `content.view_own_submissions` are the additions).

### DOC-12 / DOC-13 — Docker image API auth misdescribed
**Status:** Still present. `docs/api.md:1668` says Docker image list requires "Admin or Super Admin" while later sections correctly say `system.settings`. `AGENTS.md:260-261` still says "Admin/super_admin only." All three route handlers check `system.settings`.

### DOC-14 — Contest join rate limits omitted
**Status:** Still present. `docs/api.md:943` lists only `contest:join`; `src/app/api/v1/contests/join/route.ts:34-41` additionally consumes `contest:join:invalid` and `contest:join:invalid-code` on failed redemption.

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
**Status:** Low impact. `code-similarity-rs/` exists, so the path is technically correct. The root-level `Dockerfile.code-similarity` is not under that directory, which can confuse contributors.

### DOC-24 — Data-retention legal hold restart claim
**Status:** Still present. `docs/data-retention-policy.md:38` says a restart is required; `src/lib/data-retention.ts:46-52` re-reads `DATA_RETENTION_LEGAL_HOLD` every prune cycle.

---

## Verified Code Fixes (resolved issues, noted for documentation completeness)

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
| `docs/api.md` | Drift | Similarity-check docs are significantly stale; contest join rate limits and Docker image auth still wrong; 34 endpoints still undocumented; contest join response missing `alreadyEnrolled`. |
| `docs/languages.md` | Drift | `flix`/`roc`/ARM-prohibitive contradictions, stale image counts, and stale E2E totals persist. The `roc` re-enable created a new contradiction. |
| `AGENTS.md` | Drift | Language table count, `flix`/`haskell` base, capability count, Docker auth wording, and setup preset mismatch remain. |
| `README.md` | Drift | Capability count, image count, orphan image rows, and missing `everything` preset remain. |
| `docs/admin-security-operations.md` | Drift | No guidance on `TRUSTED_PROXY_HOPS` or the new X-Real-IP fallback semantics. |
| `docs/data-retention-policy.md` | Minor drift | Legal-hold restart claim still wrong. |
| `.env.example` / `.env.production.example` | Drift | Required production variables and deploy knobs are missing; local workspace path conflicts with production. |
| `deploy.sh` | Drift / legacy | Uses `/compiler-workspaces`, generates incomplete `.env.production`. The script itself warns that it is deprecated. |
| `scripts/online-judge.nginx-http.conf` | Drift | HSTS header in an HTTP-only template. |
| `static-site/nginx.conf` / generated nginx | Clean (code) | Headers, autoindex, body-size, and XFF handling are now correct; docs do not contradict them, they simply do not describe them. |

---

## Suggested Remediation Order

1. **Environment examples** — add `CRON_SECRET`, `CODE_SIMILARITY_AUTH_TOKEN`, `RATE_LIMITER_AUTH_TOKEN`, `POSTGRES_PASSWORD`, and `COMPILER_RUNNER_URL` to both `.env.example` and `.env.production.example` (DOC-32). Add deploy knobs (DOC-33). Fix `COMPILER_WORKSPACE_DIR` path (DOC-37).
2. **Legacy deploy script** — fix `deploy.sh` `/compiler-workspaces` path (DOC-35) and generate complete `.env.production` (DOC-36), or hard-fail if it cannot be maintained.
3. **API docs accuracy** — fix similarity-check auth/response/timeout (DOC-28), contest join rate limits (DOC-14) and `alreadyEnrolled` (DOC-38), Docker image auth inconsistency (DOC-12/DOC-13), and begin documenting the 34 missing endpoints (DOC-1/DOC-21).
4. **Deployment guide** — fix internal port (DOC-7), preset sizes (DOC-11), `AUTH_TRUST_HOST` default contradiction (DOC-25), and add missing env vars (DOC-26). Document nginx body-size scoping (DOC-27).
5. **Security ops guide** — add `TRUSTED_PROXY_HOPS`/XFF/X-Real-IP documentation (DOC-29).
6. **Language inventory** — reconcile `roc` status (DOC-30), `flix` image and ARM status (DOC-2/DOC-3), update active image count to 99 (DOC-9/DOC-31), fix `haskell` base description (DOC-15), and refresh E2E totals (DOC-16/DOC-17).
7. **README/AGENTS polish** — update capability count (DOC-8), preset list (DOC-20), orphan image rows (DOC-5), and image count (DOC-9/DOC-31).
8. **Nginx HTTP template** — remove HSTS from `scripts/online-judge.nginx-http.conf` (DOC-34).
9. **Data retention** — correct the legal-hold restart claim (DOC-24).
