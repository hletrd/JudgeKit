# Verification Report — judgekit @ 0b0ac198

**Mode:** READ-ONLY (delivered inline by verifier agent; persisted by orchestrator for provenance).

### Verdict
**Status**: PASS (code claims) — with one PARTIAL and two follow-up findings
**Confidence**: high
**Blockers**: 0 (no claim refuted; V-8 wording is imprecise but the shipped hardening is real)

All eight asserted fixes are delivered in the code. Fresh test evidence collected: 70/70 TS password-policy tests pass; 8/8 Rust validation tests pass serially (2 fail under default parallel execution — see V-8b). No acceptance criterion is MISSING.

### Evidence
| Check | Result | Command/Source | Output |
|-------|--------|----------------|--------|
| TS password tests | pass | `npx vitest run tests/unit/security/password.test.ts tests/unit/actions/change-password.test.ts tests/unit/actions/public-signup.test.ts tests/unit/api/users.route.test.ts` | 4 files, 70 tests, 0 failed |
| Rust validation tests (parallel) | fail | `cargo test validation` | 6 passed, **2 failed** (`admin_image_tag_must_stay_in_judge_namespace`, `production_mode_rejects_images_without_trusted_registry`) |
| Rust validation tests (serial) | pass | `cargo test validation -- --test-threads=1` | 8 passed, 0 failed |
| Static read | pass | Read of 8 target files + call-site grep | see per-claim evidence |

### Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| V-1 | Per-problem export gated behind `canManageProblem`; students cannot obtain hidden tests/expected outputs | VERIFIED | `src/app/api/v1/problems/[id]/export/route.ts:35-36` calls imported `canManageProblem` BEFORE the testCase select at lines 38-47 (which returns `expectedOutput` + `isVisible` for all cases). `src/lib/auth/permissions.ts:186-217` returns false for non-admins/non-authors/non-teaching-instructors → 403. |
| V-2 | Pre-restore ZIP audit uses actual pending file count | VERIFIED | `src/app/api/v1/admin/restore/route.ts:158-160` interpolates `pendingUploadedFiles.length` (populated at line 90 from `parseBackupZip(...).uploads`). Audit fires pre-`importDatabase` (line 151 vs 165). |
| V-3 | User-deletion audit recorded after transaction commits | VERIFIED | `src/app/api/v1/users/[id]/route.ts:491-503` runs `execTransaction` (scrub + delete); `recordAuditEvent(auditContext)` is at line 506, AFTER the awaited transaction. Comment at line 505 documents intent. |
| V-4 | No import-time throw for missing runner token | VERIFIED | `src/lib/docker/client.ts:26-33` computes `_productionMissingToken` and calls `logger.error(...)` — no `throw`. Misconfiguration is surfaced to API callers as generic `configError` via `getWorkerDockerApiConfigError` (lines 206-210). |
| V-5 | Client-side password length validation matches server | VERIFIED | `src/app/(auth)/reset-password/reset-password-form.tsx:10` imports `FIXED_MIN_PASSWORD_LENGTH`; explicit guard at lines 46-50; `minLength` attrs at lines 126 & 154. Server (`src/app/api/v1/auth/reset-password/route.ts:34-38`) uses the same constant and returns `minLength: FIXED_MIN_PASSWORD_LENGTH`, which the form reads at line 79. |
| V-6 | `minPasswordLength` removed from configurable settings | VERIFIED (with residual) | `src/lib/security/password.ts:1` hardcodes `FIXED_MIN_PASSWORD_LENGTH = 8`; `src/lib/security/constants.ts:7-9` `getMinPasswordLength()` now just returns the constant (no `getConfiguredSettings()` read). Grep found **no** references in UI components, `messages/`, `system-settings-config.ts`, or `admin/settings/route.ts`. Commit 475b931d removed UI/validator/i18n. **Residual:** DB column `min_password_length` still declared at `src/lib/db/schema.pg.ts:591` — orphaned and unread. |
| V-7 | Dead-letter timestamp uses chrono | VERIFIED | `judge-worker-rs/src/executor.rs:972` — `let failed_at = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();`; only timestamp field of `DeadLetterEntry` (line 928). `chrono = { version = "0.4", features = ["alloc"] }` declared at `judge-worker-rs/Cargo.toml:17`. |
| V-8 | Production requires trusted registries; rejects unqualified images | PARTIALLY VERIFIED | `judge-worker-rs/src/validation.rs:62-68` — production + **empty** trusted list → reject all (VERIFIED, and test asserts it). **But** `validate_docker_image_with_trusted` at line 29-31 returns `segments.len() == 1` for unqualified images, so once any trusted registry is configured, `judge-python:latest` is still ACCEPTED in production. The literal claim "rejects unqualified images" is not delivered; only "requires trusted registries to be configured" is. |
| V-9 | Server password policy applied at all password-setting paths | VERIFIED | All 9 src call sites route through the central policy: signup `actions/public-signup.ts:126`; reset `api/v1/auth/reset-password/route.ts:34`; change-password `actions/change-password.ts:68`; admin create `actions/user-management.ts:300,418` + `api/v1/users/route.ts:83` + `api/v1/users/bulk/route.ts:73`; admin reset `api/v1/users/[id]/route.ts:266`; recruit-link `assignments/recruiting-invitations.ts:588,699`. `users/core.ts:59-63` `validateAndHashPassword` delegates to `getPasswordValidationError`. 70 tests pass. |

### Gaps / Findings

- **V-8a — Production does not reject unqualified `judge-*` images.** Risk: medium. Confidence: high. `validation.rs:29-31` accepts single-segment images regardless of production flag once `TRUSTED_DOCKER_REGISTRIES` is non-empty. If the intent of "trusted registries in production" was to force every pull through a vetted registry, this is incomplete; if unqualified names are meant to resolve to locally-built judge images only (per the deployment model in CLAUDE.md — images built on worker-0), it is acceptable by design. Suggestion: clarify the claim wording; if enforcement is intended, require a registry prefix in production by returning `false` at line 30 when `is_production`.

- **V-8b — Rust validation tests are flaky under parallel execution (regression-safety gap).** Risk: medium. Confidence: high. Fresh `cargo test validation` (default parallel) FAILED 2 of 8: `admin_image_tag_must_stay_in_judge_namespace` (validation.rs:167) and `production_mode_rejects_images_without_trusted_registry` (validation.rs:188). Serial run (`--test-threads=1`) passes 8/8. Root cause: `valid_docker_images`, `production_mode_rejects...`, and `admin_image_tag...` all mutate the shared process env (`JUDGE_PRODUCTION_MODE`, `TRUSTED_DOCKER_REGISTRIES`) via `unsafe { std::env::set_var / remove_var }` and race when run concurrently — a genuine data race (the reason these calls became `unsafe` in Rust 1.85+). Suggestion: inject production/trusted config as a function parameter (read env once at the boundary) so tests don't mutate global state; or gate the env-dependent tests with a serial mutex.

- **V-6 residual — Orphaned DB column `min_password_length`.** Risk: low. Confidence: high. `schema.pg.ts:591` still declares the column; no code reads it. It is harmless but misleading (operators may believe it is effective). Suggestion: drop the column in a future migration, or leave a code comment stating it is a deprecated no-op kept for migration safety.

- **Observation (not a finding against any listed commit) — `problems/[id]/route.ts` GET uses a weaker local `canManageProblem` boolean.** `src/app/api/v1/problems/[id]/route.ts:60` defines `const canManageProblem = caps.has("problems.edit") || problemStub.authorId === user.id` — a different, group-scope-less check than the imported function used by PATCH (line 101) and DELETE (line 222). Student safety is preserved: non-managers get `referenceSolution` stripped and **no** testCases (lines 66-73). The asymmetry only affects whether a `problems.edit` holder teaching group A can *read* test cases of a problem linked only to group B (narrow, pre-existing — escalated by code-reviewer as CR-2).

### Coverage

| Claim | Code verified | Fresh test evidence | Verdict |
|-------|:---:|:---:|:---:|
| V-1 export gate | yes | n/a (read) | VERIFIED |
| V-2 restore audit count | yes | n/a (read) | VERIFIED |
| V-3 post-commit audit | yes | n/a (read) | VERIFIED |
| V-4 no import throw | yes | n/a (read) | VERIFIED |
| V-5 client password validation | yes | yes (70 tests) | VERIFIED |
| V-6 setting removed | yes | n/a (read) | VERIFIED (residual) |
| V-7 chrono dead-letter | yes | yes (build OK) | VERIFIED |
| V-8 prod trusted registries | yes | yes (8/8 serial; 6/8 parallel) | PARTIALLY VERIFIED |
| V-9 password policy consistency | yes | yes (70 tests) | VERIFIED |

### Recommendation
**APPROVE** the eight code fixes as delivered. Two follow-ups are worth filing as separate tasks: (1) tighten/clarify V-8 — either enforce registry prefixes in production or correct the claim's wording, and (2) fix the env-race flakiness in the Rust validation tests so the production-rejection guarantee is protected by a reliable CI signal.

Key file paths: `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/problems/[id]/export/route.ts`, `/Users/hletrd/flash-shared/judgekit/src/lib/auth/permissions.ts`, `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/admin/restore/route.ts`, `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/users/[id]/route.ts`, `/Users/hletrd/flash-shared/judgekit/src/lib/docker/client.ts`, `/Users/hletrd/flash-shared/judgekit/src/app/(auth)/reset-password/reset-password-form.tsx`, `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/auth/reset-password/route.ts`, `/Users/hletrd/flash-shared/judgekit/src/lib/security/password.ts`, `/Users/hletrd/flash-shared/judgekit/src/lib/security/constants.ts`, `/Users/hletrd/flash-shared/judgekit/src/lib/db/schema.pg.ts` (line 591 residual), `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/executor.rs` (line 972), `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/validation.rs` (lines 29-31, 62-68, and flaky tests at 167 & 188).
