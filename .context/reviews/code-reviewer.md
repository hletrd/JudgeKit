# Code Quality Review — JudgeKit Cycle 4 (/tmp/judgekit-local)

**Reviewer:** code-reviewer-cycle4  
**Scope:** Next.js 16 app/API (`src/app/api/**/*.ts`, `src/lib/**/*.{ts,tsx}`), Rust judge worker and sidecars (`judge-worker-rs/`, `rate-limiter-rs/`, `code-similarity-rs/`), deployment scripts, Docker files, static-site nginx, and infrastructure configuration.  
**Date:** 2026-07-03  

---

## Executive Summary

This review examined the full stack from a **logic correctness, SOLID, maintainability, and boundary-layer safety** perspective, followed by a final exhaustive pass over the Next.js app server (`src/app/api/**/*.ts`, `src/lib/**/*.{ts,tsx}`). The codebase has improved materially since the Cycle 3 aggregate review: several previously open CRITICAL/HIGH items (boolean import corruption, `GET /api/v1/files` rate limiting, `AUTH_TRUST_HOST` default, judge IP allowlist default, workspace cleanup, and restore/import path leakage) are now fixed or fail-closed.

The remaining issues cluster in six areas:

1. **Boundary-layer correctness (CRITICAL/HIGH)** — the file-upload ZIP validator trusts attacker-controlled metadata, the stored-name regex rejects valid `nanoid()` outputs, and cursor/rate-limit/queue accounting logic has concrete edge cases.
2. **UI/client layer** — the largest group. Multiple `setState`-after-unmount leaks, optimistic-update revert failures, client/server contract mismatches, and event-interception bugs affect correctness and user experience.
3. **API/core boundary layer** — the runner-auth opt-out does not actually opt out, import timestamp validation is missing, pagination trusts opaque cursors, app-server API routes contain race conditions and rate-limit misconfigurations, and a few brittle casts/comments remain.
4. **Rust workers and sidecars** — Docker probes and admin commands lack timeouts, the runner HTTP server has no graceful shutdown, `time_limit_ms` is unbounded, `docker run` child processes can leak, token comparison leaks length, and rate-limiter input edge cases can bypass or permanently enforce blocking.
5. **Admin API routes** — backup/export materializes entire datasets in memory, REST settings silently drop validated fields, restore/import/validate paths have trust/atomicity/audit gaps, and tag/plugin/worker/language routes have concurrency/race/validation bugs.
6. **Deployment/infrastructure** — documentation drift, missing shell error handling, unpinned supply-chain artifacts, and non-fatal architecture verification.

**One CRITICAL blocker was found in the app-server pass:** the ZIP decompressed-size validator can be bypassed by forged local-file-header metadata. Two additional HIGH-confidence defects (intermittent upload failures due to a too-strict filename regex, and unvalidated cursor timestamps causing 500s) should also be fixed before release. A follow-on exhaustive pass over the Rust workers and sidecars uncovered seven more HIGH-confidence issues, including an unbounded poll response body in the worker, length-leaking auth-token comparisons in the runner and both sidecars, and rate-limiter configuration edge cases that can fully bypass or permanently enforce blocking. The admin-route pass added two HIGH-confidence issues (backup/export OOM and REST settings silently dropping fields). The final app-server API-route pass added six more HIGH-confidence issues: active-contest problem changes are not atomic with the update, score overrides can race, recruiting invitations use the wrong rate-limit bucket, the anti-cheat endpoint leaks existence and bypasses access checks when disabled, judge deregister can restart active `judging` submissions, and the chat widget does not abort LLM work on client disconnect.

**Static checks verified:**
- `npx tsc --noEmit` — passes (exit 0).
- `cargo test` in `judge-worker-rs` — 96 passed.
- `cargo test` in `rate-limiter-rs` — 3 passed.
- `cargo test` in `code-similarity-rs` — 49 passed.

---

## Scope and Methodology

1. Built an inventory of all relevant source files:
   - 637 TypeScript/TSX files under `src/`
   - 15 Rust source files across the three Rust crates
   - 30+ deployment/Docker/config files
2. Ran a pattern scan over all `src/**/*.ts` and `src/**/*.tsx` for common risk signals (type assertions, non-null assertions, `JSON.parse`, shell execution, `console.*`, `TODO/FIXME`, unhandled promises).
3. Delegated deep, line-by-line review to specialized code-reviewer agents for:
   - TypeScript API routes and core libraries
   - Rust workers and sidecars
   - Deployment scripts and Docker configuration
   - UI components and hooks
4. Spot-verified the highest-confidence findings and the status of prior-cycle aggregate issues.
5. Ran `tsc --noEmit` and all Rust unit tests as a final gate.

---

## Validation of Prior Aggregate Findings

| Prior issue | Current status | Evidence |
|---|---|---|
| `GET /api/v1/files` has no rate limit | **Fixed** | `src/app/api/v1/files/route.ts:156-168` now uses `rateLimit: "files:list"` and `consumeUserApiRateLimit`. |
| DB import corrupts boolean strings `"false"` | **Fixed** | `src/lib/db/import.ts:89-99` maps explicit true/false string tokens. |
| `AUTH_TRUST_HOST=true` production default | **Fixed** | `deploy-docker.sh:750,899,976`, `docker-compose.production.yml:115` default to `false`. |
| Judge IP allowlist defaults to allow-all | **Fixed** | `deploy-docker.sh:879,984` warns that requests will be denied; `src/lib/judge/ip-allowlist.ts:223-238` requires explicit opt-in (`JUDGE_ALLOW_ANY_JUDGE_IP=1`). |
| Workspace cleanup leaks in production | **Fixed** | `src/lib/compiler/execute.ts` uses Docker fallback cleanup; `judge-worker-rs/src/workspace.rs` uses privileged Docker helper. |
| Admin restore/import leaks snapshot path | **Fixed** | Responses now return `snapshotId`; path kept in server-side audit logs only (`src/app/api/v1/admin/restore/route.ts:197` is inside `recordAuditEventDurable`). |
| `createApiHandler` swallows unhandled error details | **Still open** | `src/lib/api/handler.ts:307-314` still returns only `internalServerError` without a discriminating code/message. |
| Global SSE advisory lock serializes all acquisitions | **Still open** | `src/lib/realtime/realtime-coordination.ts:101` still uses a single `"realtime:sse:acquire"` key. |
| CSRF check performs DB read on every mutation | **Still open** | `src/lib/security/csrf.ts:7-8` awaits `getTrustedAuthHosts()` with no in-memory cache. |
| `system-settings-config.ts` accepts malformed integer strings | **Still open** | `src/lib/system-settings-config.ts:99` uses `parseInt` without full-string validation; comment also claims 60 s cache but TTL is 15 s. |

---

## Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| CQ4-R01 | HIGH | High | `judge-worker-rs/src/runner.rs:481-523` | `probe_docker_capability` has no timeout |
| CQ4-R02 | HIGH | High | `judge-worker-rs/src/runner.rs:301-409` | Runner admin Docker endpoints lack timeouts |
| CQ4-U01 | HIGH | High | `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:43` | Bulk-create CSV drops the standard `password` column |
| CQ4-U02 | HIGH | High | `src/components/lecture/lecture-mode-provider.tsx:6-7`, `src/lib/actions/update-preferences.ts:41-44` | `lectureFontScale` client type wider than server action accepts |
| CQ4-U03 | HIGH | High | `src/components/discussions/discussion-thread-moderation-controls.tsx:60-90` | Optimistic moderation state not reverted on network error |
| CQ4-U04 | HIGH | High | `src/app/(public)/contests/[id]/layout.tsx:34`, `src/app/(public)/contests/manage/layout.tsx:38` | Contest full-navigation workaround breaks native mouse/modifier behavior |
| CQ4-U05 | HIGH | High | `src/components/contest/quick-create-contest-form.tsx:61-94` | Network errors swallowed in contest creation |
| CQ4-U06 | HIGH | High | `src/app/(public)/contests/join/contest-join-client.tsx:70-83` | `setState` after unmount in join redirect delay |
| CQ4-U07 | HIGH | High | `src/app/(public)/groups/[id]/group-members-manager.tsx:120-335` | `setState` after unmount in group members manager |
| CQ4-U08 | HIGH | High | `src/app/(public)/groups/[id]/group-instructors-manager.tsx:62-116` | `setState` after unmount in group instructors manager |
| CQ4-U09 | HIGH | High | `src/app/(public)/problems/create/create-problem-form.tsx:260-282` | Stale tag-suggestion race and unmounted `setState` |
| CQ4-U10 | HIGH | High | `src/app/(public)/problems/create/create-problem-form.tsx:361-409` | Unmounted `setState` during image upload |
| CQ4-U11 | HIGH | High | `src/app/(public)/problems/create/create-problem-form.tsx:207-257` | Unmounted `setState` during ZIP test-case import |
| CQ4-U12 | HIGH | High | `src/components/problem/problem-submission-form.tsx:323-364` | `executeSubmit` sets `isSubmitting(false)` after possible unmount |
| CQ4-U13 | HIGH | High | `src/components/submissions/submission-detail-client.tsx:186-205` | `handleRejudge` sets `rejudging(false)` after possible unmount |
| CQ4-U14 | HIGH | Medium | `src/hooks/use-unsaved-changes-guard.ts:251-265` | Navigation API traverse guard may fail to block back/forward |
| CQ4-A01 | MEDIUM | High | `src/lib/compiler/execute.ts:652` | `RUNNER_AUTH_DISABLED` does not actually disable runner authentication |
| CQ4-A02 | MEDIUM | High | `src/lib/db/import.ts:80-83` | Invalid timestamp strings passed through to database |
| CQ4-A03 | MEDIUM | High | `src/lib/actions/system-settings.ts:185`, `src/app/api/v1/admin/settings/route.ts:148` | Inconsistent `emailVerificationRequired` default between REST and server action |
| CQ4-A04 | MEDIUM | Medium | `src/app/api/v1/submissions/route.ts:69-71` | Cursor pagination trusts decoded timestamp without validity check |
| CQ4-A05 | MEDIUM | Medium | `src/lib/compiler/execute.ts:398-427` | `cleanupCompilerWorkspace` silently leaks if both cleanup paths fail |
| CQ4-A06 | MEDIUM | Medium | `src/lib/db/queries.ts:52` | Unsafe cast of `string[]` to `TemplateStringsArray` |
| CQ4-R03 | MEDIUM | High | `judge-worker-rs/src/main.rs:477-481`, `687-690` | Runner HTTP server aborted without graceful shutdown |
| CQ4-R04 | MEDIUM | High | `judge-worker-rs/src/runner.rs:832-833`, `990` | Runner `/run` does not clamp `time_limit_ms` |
| CQ4-R05 | MEDIUM | Medium | `judge-worker-rs/src/executor.rs:565-582` | Executor writes test-case input without size cap |
| CQ4-D01 | HIGH | High | `AGENTS.md:387-394`, `deploy-docker.sh:1246-1253` | `AGENTS.md` incorrectly claims `secret_token` backfill runs unconditionally |
| CQ4-D02 | HIGH | High | `scripts/rebuild-worker-language-images.sh:28`, `:80` | Helper script lacks `set -e`/`pipefail` |
| CQ4-D03 | HIGH | High | `docker-compose.test-backends.yml:29`, `:51`, `:60`, `:116` | Test compose uses unpinned docker-socket-proxy and weak default passwords |
| CQ4-D04 | HIGH | High | `docker/Dockerfile.judge-*` (many) | Language Dockerfiles download unpinned toolchains/installers |
| CQ4-D05 | HIGH | High | `Dockerfile.judge-worker:17-22` | Architecture verification only logs, never fails |
| CQ4-D06 | MEDIUM | High | `scripts/online-judge.nginx.conf:94-95`, `deploy-docker.sh:1647-1648` | Committed nginx catch-all `client_max_body_size` still `1m` |
| CQ4-D07 | MEDIUM | Medium | `scripts/backup-db.sh:112-123` | Retention loop re-counts newer backups per file (O(n²)) |
| CQ4-D08 | MEDIUM | High | `scripts/code-similarity-rs.service` | Sidecar systemd service lacks hardening |
| CQ4-D09 | MEDIUM | Medium | `deploy-docker.sh:486`, `:555`, `scripts/rebuild-worker-language-images.sh:107` | `docker builder prune -af` clears all build cache |
| CQ4-D10 | MEDIUM | Medium | `deploy-docker.sh:482`, `:554` | `docker container prune --filter until=24h` is a heuristic bound |
| CQ4-D11 | MEDIUM | High | `static-site/deploy.sh:18`, `:22`, `:70` | Static-site deploy script hardcodes production domain/email |
| CQ4-D12 | MEDIUM | Medium | `Dockerfile.judge-worker:10`, `:27`; `Dockerfile.code-similarity`; `Dockerfile.rate-limiter-rs` | Floating `rust:1-alpine` / `alpine:3.21` base tags |
| CQ4-D13 | MEDIUM | Medium | `deploy-docker.sh:1259-1260` | DB network name hardcoded to `judgekit_db` |
| CQ4-U15 | MEDIUM | High | `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:185`, `:217`, `:253` | Language build/remove/prune actions show spurious error toasts on unmount abort |
| CQ4-U16 | MEDIUM | High | `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:54`, `:73` | Chat-log fetches are not cancellable and can race |
| CQ4-U17 | MEDIUM | Medium | `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:90-157` | Files added after upload starts are ignored |
| CQ4-U18 | MEDIUM | Medium | `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:181-225` | Bulk-create dialog can be submitted while parse errors are displayed |
| CQ4-U19 | MEDIUM | Medium | `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:79` | `signOut` errors swallowed before `signIn` |
| CQ4-U20 | MEDIUM | Medium | `src/app/(auth)/recruit/[token]/page.tsx:171-212` | Returning redeemed users skip assignment deadline check |
| CQ4-U21 | MEDIUM | High | `src/hooks/use-submission-polling.ts:211-216` | SSE timeout stops polling instead of falling back to fetch |
| CQ4-U22 | MEDIUM | High | `src/hooks/use-server-source-draft.ts:105-115` | Failed server autosave is never retried |
| CQ4-U23 | MEDIUM | Medium | `src/hooks/use-server-source-draft.ts:69-96` | Server draft hydration can race with function-stub preload |
| CQ4-U24 | MEDIUM | High | `src/hooks/use-server-source-draft.ts:69-96` | Language switch after hydration never fetches new server draft |
| CQ4-U25 | MEDIUM | High | `src/hooks/use-unsaved-changes-guard.ts:182-185`, `:196-198` | `allowNextNavigation` bypass persists across navigations |
| CQ4-U26 | MEDIUM | High | `src/hooks/use-unsaved-changes-guard.ts:66-85` | `history.replaceState` navigations bypass the guard |
| CQ4-U27 | MEDIUM | Medium | `src/hooks/use-source-draft.ts:219-237` | Mutable `draftStore` held in `useMemo` |
| CQ4-U28 | MEDIUM | Medium | `src/hooks/use-source-draft.ts:135-137`, `:239` | `useSyncExternalStore` hydration subscription is a no-op |
| CQ4-U29 | MEDIUM | High | `src/hooks/use-keyboard-shortcuts.ts:39-61` | Keyboard shortcuts fire in contenteditable elements |
| CQ4-U30 | MEDIUM | Medium | `src/hooks/use-keyboard-shortcuts.ts:35-37` | `shortcutsRef` update lags by one commit |
| CQ4-U31 | MEDIUM | High | `src/components/discussions/discussion-post-form.tsx:36-61`, `discussion-thread-form.tsx:42-68`, `discussion-thread-moderation-controls.tsx:60-114` | Async discussion handlers set state after possible unmount |
| CQ4-U32 | MEDIUM | High | `src/components/layout/theme-toggle.tsx:95-97`, `src/components/lecture/lecture-mode-provider.tsx:72,79,84` | Server-action persistence errors silently swallowed |
| CQ4-U33 | MEDIUM | Medium | `src/components/layout/theme-toggle.tsx:91-99` | Theme persistence calls can fire out of order |
| CQ4-U34 | MEDIUM | High | `src/components/code/code-surface.tsx:405-411` | Initial language extension load races with prop changes |
| CQ4-U35 | MEDIUM | High | `src/components/code/code-surface.tsx:405`, `:422`, `:445` | Dynamic language/theme imports can throw unhandled rejections |
| CQ4-U36 | MEDIUM | High | `src/components/code/code-surface.tsx:432-457` | Switching from custom theme back to built-in disables syntax highlighting |
| CQ4-U37 | MEDIUM | High | `src/components/problem/problem-submission-form.tsx:164-220` | Anti-cheat snapshot timer does not reset on edits |
| CQ4-U38 | MEDIUM | Medium | `src/components/problem/problem-submission-form.tsx:191-209` | Anti-cheat snapshot retry timers not cleared on unmount |
| CQ4-U39 | MEDIUM | High | `src/components/exam/countdown-timer.tsx:193-198` | Comment and behavior mismatch for long background hides |
| CQ4-U40 | MEDIUM | Medium | `src/components/code/compiler-client.tsx:296` | Compiler client trusts server response shape without validation |
| CQ4-U41 | MEDIUM | High | Multiple delete-button / form components (see detail) | `.json().catch(() => ({}))` swallows non-JSON error responses |
| CQ4-U42 | MEDIUM | High | Multiple pages (see detail) | Non-null assertions bypass runtime null checks |
| CQ4-U43 | MEDIUM | High | Multiple select/search-param sites (see detail) | Type assertions on `Select` values and search-param filters |
| CQ4-U44 | MEDIUM | High | `src/app/(public)/practice/page.tsx:425-460` | Progress filter loads full problem/submission lists into memory |
| CQ4-U45 | MEDIUM | High | `src/app/(public)/problems/create/create-problem-form.tsx:441-461` | Test-case file inputs read arbitrarily large files |
| CQ4-A07 | LOW | High | `src/lib/system-settings-config.ts:159-173` | Cache TTL comment is stale |
| CQ4-A08 | LOW | Medium | `src/lib/compiler/execute.ts:244-254` | Command prefix validator accepts overly permissive suffixes |
| CQ4-A09 | LOW | Low | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:82` | Similarity pair enrichment can render `null (undefined)` names |
| CQ4-A10 | LOW | Low | `src/lib/compiler/execute.ts:187-192` | Shell validator ignores some shell special variables |
| CQ4-R06 | LOW | High | `judge-worker-rs/src/docker.rs:84-89` | `oci_runtime()` re-reads environment on every container spawn |
| CQ4-R07 | LOW | Medium | `judge-worker-rs/src/config.rs:321-340` | `validate_runtime_path` accepts relative paths |
| CQ4-R08 | LOW | High | `judge-worker-rs/src/workspace.rs:71-73`, `:164-165` | `workspace.rs` fails latest Clippy lints |
| CQ4-R09 | LOW | Medium | `judge-worker-rs/src/executor.rs` (multiple) | `String` errors make retry/telemetry classification impossible |
| CQ4-D14 | LOW | Medium | `deploy.sh:244` | Legacy deploy script inconsistent nginx body size / X-Forwarded-For |
| CQ4-D15 | LOW | Medium | `scripts/online-judge.nginx-http.conf:27` | HTTP-only dev template includes HSTS header |
| CQ4-D16 | LOW | Low | `scripts/backup-db.sh:37` | Password extraction brittle for quoted/newline values |
| CQ4-D17 | LOW | Low | `Dockerfile.judge-worker:40`; representative language Dockerfiles | Seccomp profile path assumes repo-root build context |
| CQ4-U46 | LOW | Medium | `src/hooks/use-editor-compartments.ts:9` | `useLazyRef` type assertion hides possible `null` |
| CQ4-U47 | LOW | Low | `src/hooks/use-submission-polling.ts:190-209` | `result` event assumed terminal could stop polling prematurely |
| CQ4-U48 | LOW | High | `src/hooks/use-source-draft.ts` | No cross-tab synchronization for localStorage drafts |
| CQ4-U49 | LOW | Medium | `src/hooks/use-unsaved-changes-guard.ts:76-84` | `sharedReplaceState` mutates history state shape unconditionally |
| CQ4-U50 | LOW | Low | `src/hooks/use-unsaved-changes-guard.ts:295-315` | `popstate` restoration may use wrong direction when indices missing |
| CQ4-U51 | LOW | Low | `src/hooks/use-editor-compartments.ts` | CodeMirror compartments initialized as render side effect |
| CQ4-U52 | LOW | Low | `src/components/problem/function-test-case-editor.tsx` | Keeps stale serialized input when args are invalid |
| CQ4-U53 | LOW | Low | `src/hooks/use-visibility-polling.ts:31-34` | No protection against async callbacks |
| CQ4-U54 | LOW | Low | `src/components/contest/anti-cheat-dashboard.tsx` | Similarity check not abortable on unmount |
| CQ4-U55 | LOW | Low | `src/components/exam/anti-cheat-monitor.tsx:69` | Anti-cheat snapshot POST has no abort/cleanup on unmount |
| CQ4-U56 | LOW | Low | `src/hooks/use-submission-polling.ts:360-362` | Cleanup calls `setIsPolling(false)` after unmount |
| CQ4-U57 | LOW | Low | `src/components/exam/exam-deadline-sync.tsx:59`, `:96-100` | `ExamDeadlineSync` fetch not aborted on unmount |
| CQ4-U58 | LOW | Medium | Multiple components (see detail) | Mount-only fetches lack unmount guards |
| CQ4-U59 | LOW | High | `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:181` | SMTP port can be submitted as `NaN` |
| CQ4-U60 | LOW | Medium | `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:48` | Footer link ID type assertion hides contract mismatch |
| CQ4-U61 | LOW | Medium | `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:240` | Workers stats fallback uses unsafe cast |
| CQ4-U62 | LOW | Medium | Multiple admin form dialogs (see detail) | Loading/dialog state set after potential unmount |
| CQ4-U63 | LOW | High | Multiple dashboard components (see detail) | Raw SQL used where Drizzle helpers are available |
| CQ4-U64 | LOW | High | Multiple public error boundaries (see detail) | Error boundaries only log in development |
| CQ4-U65 | LOW | Medium | `src/components/ui/sidebar.tsx:83` | Sidebar state cookie lacks explicit attributes |

---

## Detailed Findings

### HIGH

#### CQ4-R01 — `probe_docker_capability` has no timeout
- **File:** `judge-worker-rs/src/runner.rs:481-523`
- **Confidence:** High
- **Problem:** The Docker capability probe runs `tokio::process::Command::output().await` without a timeout and without `.kill_on_drop(true)`. `main.rs` awaits the probe at startup and again in a 60-second periodic re-probe loop.
- **Failure scenario:** If `dockerd` is wedged, the socket-proxy stalls, or registry access hangs, the worker never finishes startup (`/health` never becomes OK) and the periodic probe task freezes, so a mid-life socket-proxy regression is never detected.
- **Fix:** Wrap `probe_docker_capability` in `tokio::time::timeout` (e.g., 10–15 s), add `.kill_on_drop(true)` to the internal Docker commands, and return the timeout as a probe failure so the worker marks itself unhealthy.

#### CQ4-R02 — Runner admin Docker endpoints lack timeouts
- **File:** `judge-worker-rs/src/runner.rs:301-409`
- **Confidence:** High
- **Problem:** `docker_list_images`, `docker_inspect_image`, `docker_pull_image`, `docker_remove_image`, and `docker_build_image` all use `run_command` with no timeout and no `kill_on_drop`. The `/docker/build` endpoint is not gated by the runner semaphore.
- **Failure scenario:** A slow `docker pull` against an unreachable registry or a stuck `docker build` holds the runner executor indefinitely. An unbounded number of concurrent builds can also be spawned.
- **Fix:** Add `tokio::time::timeout` around every admin Docker invocation, set `.kill_on_drop(true)`, and return 504/503 on timeout. Gate `/docker/build` with the runner concurrency semaphore.

#### CQ4-U01 — Bulk-create CSV drops the standard `password` column
- **File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:43`
- **Confidence:** High
- **Problem:** `HEADER_ALIASES` maps `"password"` to `""`, so rows parsed from a standard `password` header are stored under key `""`. The `!password` check then rejects every row as missing a password.
- **Failure scenario:** An admin uploads a CSV with a `password` column; every row is rejected as missing a password, making bulk creation unusable.
- **Fix:** Change the alias to `password: "password"`.

#### CQ4-U02 — `lectureFontScale` client type is wider than the server action accepts
- **File:** `src/components/lecture/lecture-mode-provider.tsx:6-7`, `src/lib/actions/update-preferences.ts:41-44`
- **Confidence:** High
- **Problem:** The UI allows font scales `2.5x`–`4.0x`, but `updatePreferences` only accepts `["1.25", "1.5", "1.75", "2.0"]`. The action rejects the value and the `.catch` swallows the error.
- **Failure scenario:** A student selects `3.0x`; the UI shows the selection as saved, but the server persists nothing and the next page load reverts to the old value.
- **Fix:** Extend the server-action enum to include `"2.5", "3.0", "3.5", "4.0"`.

#### CQ4-U03 — Optimistic moderation state not reverted on network error
- **File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:60-90`
- **Confidence:** High
- **Problem:** `isPinned`/`isLocked` are flipped locally. If the PATCH fails with a network error, the `catch` block toasts but does not revert the state.
- **Failure scenario:** An instructor toggles a lock while offline; the UI shows the thread as locked, but the server still considers it unlocked, so later moderation actions behave inconsistently.
- **Fix:** Revert the optimistic update in the `catch` block, mirroring the non-OK revert logic.

#### CQ4-U04 — Contest full-navigation workaround breaks native mouse/modifier behavior
- **File:** `src/app/(public)/contests/[id]/layout.tsx:34`, `src/app/(public)/contests/manage/layout.tsx:38`
- **Confidence:** High
- **Problem:** The workaround for a Next.js RSC bug intercepts every click on `data-full-navigate` links and forces `window.location.href`, regardless of mouse button or modifier keys.
- **Failure scenario:** Middle-click, Cmd/Ctrl-click, Shift-click, and right-click on contest links are forced into the current tab, breaking new-tab behavior and context menus.
- **Fix:** Add an early return before `preventDefault()`:
  ```ts
  if (me.button !== 0 || me.ctrlKey || me.metaKey || me.shiftKey || me.altKey) return;
  ```

#### CQ4-U05 — Network errors swallowed in contest creation
- **File:** `src/components/contest/quick-create-contest-form.tsx:61-94`
- **Confidence:** High
- **Problem:** `apiFetch` can throw before `res.ok` is checked, but the `try/finally` has no `catch`.
- **Failure scenario:** A DNS/CORS/5xx proxy error rejects the promise; the button stops spinning and the user receives no feedback.
- **Fix:** Add a `catch` block that toasts a network/unknown-error message.

#### CQ4-U06 — `setState` after unmount in join redirect delay
- **File:** `src/app/(public)/contests/join/contest-join-client.tsx:70-83`
- **Confidence:** High
- **Problem:** After a successful join, the component awaits a 1-second sleep before `router.push`. If the user navigates away during that second, `setIsLoading(false)` runs on an unmounted component.
- **Failure scenario:** A fast user click after joining causes a React warning and possible stale state.
- **Fix:** Remove the artificial delay and navigate immediately, or guard post-await state updates with a `mounted` ref.

#### CQ4-U07 — `setState` after unmount in group members manager
- **File:** `src/app/(public)/groups/[id]/group-members-manager.tsx:120-335`
- **Confidence:** High
- **Problem:** `handleAddMember`, `handleBulkAddMembers`, `handlePasteEnroll`, and `handleRemoveMember` all call setters after `await` without guarding against unmount.
- **Failure scenario:** The card unmounts while a request is in flight; React warns about state updates on an unmounted component.
- **Fix:** Track a `mounted` ref and guard every post-await setter.

#### CQ4-U08 — `setState` after unmount in group instructors manager
- **File:** `src/app/(public)/groups/[id]/group-instructors-manager.tsx:62-116`
- **Confidence:** High
- **Problem:** `handleAdd` and `handleRemove` are fire-and-forget promises. If the component unmounts before the promise resolves, `setInstructors`/`setIsAdding(false)` run after unmount.
- **Failure scenario:** The group page unmounts during an add operation, causing a React warning.
- **Fix:** Add a `mounted` ref cleanup and guard post-await state updates.

#### CQ4-U09 — Stale tag-suggestion race and unmounted `setState`
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:260-282`
- **Confidence:** High
- **Problem:** The debounced `fetchSuggestions` effect does not cancel the in-flight fetch.
- **Failure scenario:** Typing quickly can leave an old request overwriting newer suggestions, and `setTagSuggestions` may run after unmount.
- **Fix:** Pass an `AbortController.signal` to `apiFetch`, abort it in the effect cleanup, and guard the setter with a mounted check.

#### CQ4-U10 — Unmounted `setState` during image upload
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:361-409`
- **Confidence:** High
- **Problem:** After inserting a placeholder, the upload awaits the file API. Navigating away before completion causes `setDescription`/`setIsUploadingImage` to run after unmount.
- **Failure scenario:** The author navigates away during a slow upload and React warns.
- **Fix:** Track a `mounted` ref and guard post-upload setters; consider passing an `AbortSignal` to `apiFetch`.

#### CQ4-U11 — Unmounted `setState` during ZIP test-case import
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:207-257`
- **Confidence:** High
- **Problem:** `handleZipImport` reads zip entries asynchronously and calls `setTestCases` only after all entries are read.
- **Failure scenario:** Navigating away during import causes a state update on an unmounted component.
- **Fix:** Add a cancellation/mounted guard and break the loop if the component unmounts.

#### CQ4-U12 — `executeSubmit` sets `isSubmitting(false)` after possible unmount
- **File:** `src/components/problem/problem-submission-form.tsx:323-364`
- **Confidence:** High
- **Problem:** `executeSubmit` awaits the submission API; if the form unmounts before the promise settles, `setIsSubmitting(false)` runs on an unmounted component.
- **Failure scenario:** The user navigates away after clicking Submit; React warns.
- **Fix:** Guard the `finally` block with `isMountedRef.current`.

#### CQ4-U13 — `handleRejudge` sets `rejudging(false)` after possible unmount
- **File:** `src/components/submissions/submission-detail-client.tsx:186-205`
- **Confidence:** High
- **Problem:** `handleRejudge` awaits the rejudge API; if the detail page unmounts, `setRejudging(false)` runs after unmount.
- **Failure scenario:** The user navigates away during a rejudge; React warns.
- **Fix:** Guard the `finally` block with a `mounted` ref.

#### CQ4-U14 — Navigation API traverse guard may silently fail to block back/forward
- **File:** `src/hooks/use-unsaved-changes-guard.ts:251-265`
- **Confidence:** Medium
- **Problem:** The handler returns early when `!event.cancelable && !navigateEvent.canIntercept`, then calls `event.preventDefault()` if `confirmNavigation` returns false. For non-cancelable traverse navigations, `preventDefault()` is a no-op.
- **Failure scenario:** The guard does not stop a non-cancelable back/forward navigation and unsaved edits are lost.
- **Fix:** Gate `preventDefault()` strictly on `event.cancelable`. For non-cancelable traverses, rely on the `beforeunload` and `popstate` paths.

---

### MEDIUM

#### CQ4-A01 — `RUNNER_AUTH_DISABLED` does not actually disable runner authentication
- **File:** `src/lib/compiler/execute.ts:652`
- **Confidence:** High
- **Problem:** `tryRustRunner` returns `null` whenever `RUNNER_AUTH_TOKEN` is empty, even if `RUNNER_AUTH_DISABLED=1` is set. The flag only suppresses the configuration error; the runner is never invoked without a token.
- **Failure scenario:** Operator sets `COMPILER_RUNNER_URL=http://worker:3001` and `RUNNER_AUTH_DISABLED=1` with no token. The route never calls the runner, falling back to local execution or returning "Compiler runner unavailable".
- **Fix:** Change the guard to `if (!COMPILER_RUNNER_URL) return null;` and only attach the `Authorization` header when `RUNNER_AUTH_TOKEN` is non-empty (or `RUNNER_AUTH_DISABLED` is not set).

#### CQ4-A02 — Invalid timestamp strings passed through to database
- **File:** `src/lib/db/import.ts:80-83`
- **Confidence:** High
- **Problem:** `convertValue` returns the raw string when `new Date(val)` yields an invalid date. Drizzle then attempts to insert a non-date string into a timestamp column.
- **Failure scenario:** An export contains a malformed timestamp like `"2024-13-45T00:00:00Z"`. The whole table import aborts with a confusing PostgreSQL error.
- **Fix:** Return `null` or throw a descriptive validation error when the date is invalid so the operator sees which row/column failed.

#### CQ4-A03 — Inconsistent `emailVerificationRequired` default
- **File:** `src/lib/actions/system-settings.ts:185`, `src/app/api/v1/admin/settings/route.ts:148`
- **Confidence:** High
- **Problem:** The server action defaults `emailVerificationRequired` to `true` when the key is present but nullish; the REST route defaults it to `false`.
- **Failure scenario:** The same admin setting diverges depending on whether the UI or API is used.
- **Fix:** Extract the default into a shared constant and use it in both writers.

#### CQ4-A04 — Cursor pagination trusts decoded timestamp without validity check
- **File:** `src/app/api/v1/submissions/route.ts:69-71`
- **Confidence:** Medium
- **Problem:** The cursor decoder accepts any string in `decoded.t` and constructs `new Date(decoded.t)` without checking for `Invalid Date`.
- **Failure scenario:** A client submits a base64 cursor with `"t": "not-a-date"`. The route throws a 500 instead of returning a clean 400.
- **Fix:** Validate `!Number.isNaN(cursorSubmittedAt.getTime())`; if invalid, return `apiError("invalidCursor", 400)`.

#### CQ4-A05 — `cleanupCompilerWorkspace` silently leaks if both cleanup paths fail
- **File:** `src/lib/compiler/execute.ts:398-427`
- **Confidence:** Medium
- **Problem:** When running as non-root, if `rm` fails and Docker-based cleanup also fails, the function logs and returns without surfacing the failure.
- **Failure scenario:** A long-running app server loses Docker connectivity; every local fallback run leaves a `compiler-XXXXXX` directory behind until disk fills.
- **Fix:** Return a boolean or throw after exhausting cleanup options so callers/health checks can count/metric leaked workspaces; optionally schedule a retry.

#### CQ4-A06 — Unsafe cast of `string[]` to `TemplateStringsArray`
- **File:** `src/lib/db/queries.ts:52`
- **Confidence:** Medium
- **Problem:** `buildSqlQuery` builds a plain `string[]` and casts it to `TemplateStringsArray`. Drizzle's `sql` helper may rely on `TemplateStringsArray.raw` in future versions.
- **Failure scenario:** A future Drizzle update reads `strings.raw`, causing `undefined` placeholders or a thrown error on every raw query.
- **Fix:** Construct a real template-strings array with a `raw` property: `Object.assign(strings, { raw: strings })` or use Drizzle's `sql.join`/`sql.raw` APIs.

#### CQ4-R03 — Runner HTTP server aborted without graceful shutdown
- **File:** `judge-worker-rs/src/main.rs:477-481`, `687-690`
- **Confidence:** High
- **Problem:** `runner_handle` is created by spawning `axum::serve(listener, app).await` with no graceful-shutdown signal. On SIGTERM/SIGINT the main loop waits for judge tasks and deregisters, then calls `handle.abort()`.
- **Failure scenario:** In-flight `/run` or `/docker/build` requests are abruptly dropped. An admin image build can be interrupted mid-layer.
- **Fix:** Wire a `tokio_util::sync::CancellationToken` into `axum::serve(...).with_graceful_shutdown(...)` and cancel it only after giving in-flight runner requests a short deadline.

#### CQ4-R04 — Runner `/run` does not clamp `time_limit_ms`
- **File:** `judge-worker-rs/src/runner.rs:832-833`, `990`
- **Confidence:** High
- **Problem:** `req.time_limit_ms.unwrap_or(DEFAULT_TIME_LIMIT_MS)` is passed straight into the Docker kill timeout with no upper bound.
- **Failure scenario:** A bug or malicious call sends `u64::MAX`, causing the runner container to run for an effectively unbounded time.
- **Fix:** Clamp to a shared maximum (e.g., reuse `executor::max_time_limit_ms()` or a runner-specific constant) and return `400 Bad Request` for out-of-range values.

#### CQ4-R05 — Executor writes test-case input without size cap
- **File:** `judge-worker-rs/src/executor.rs:565-582`
- **Confidence:** Medium
- **Problem:** `input: Some(test_case.input.clone())` is written to the container's stdin. The worker validates source code size but not per-test-case input size.
- **Failure scenario:** A compromised or buggy app server submits a test case with multi-megabyte input, causing memory pressure and potential OOM.
- **Fix:** Add a configurable `MAX_TEST_INPUT_BYTES` (e.g., 1 MiB) and reject submissions whose test inputs exceed it with `runtime_error`.

#### CQ4-D01 — `AGENTS.md` incorrectly claims `secret_token` backfill runs unconditionally
- **File:** `AGENTS.md:387-394`, `deploy-docker.sh:1246-1253`
- **Confidence:** High
- **Problem:** `AGENTS.md` states the Step 5b psql backfill "runs unconditionally on every deploy." The code only executes it when `ALLOW_SECRET_TOKEN_BACKFILL == "1"`.
- **Failure scenario:** An operator reads `AGENTS.md` during a `DRIZZLE_PUSH_FORCE=1` recovery and does not set the flag; `drizzle-kit push --force` drops the `secret_token` column while `secret_token_hash` remains null, locking out judge workers.
- **Fix:** Update `AGENTS.md` to accurately describe the `ALLOW_SECRET_TOKEN_BACKFILL=1` gating and sunset criterion.

#### CQ4-D02 — `rebuild-worker-language-images.sh` lacks `set -e`/`pipefail`
- **File:** `scripts/rebuild-worker-language-images.sh:28`, `:80`
- **Confidence:** High
- **Problem:** The helper is meant to recover a dedicated worker host, but `set -u` alone does not propagate pipeline/command failures.
- **Failure scenario:** A failed `docker build` inside the remote heredoc prints an error and continues, leaving the worker with a partial or broken language image set while reporting success.
- **Fix:** Add `set -euo pipefail` at line 28 and inside the remote heredoc at line 80.

#### CQ4-D03 — Test compose uses unpinned docker-socket-proxy and weak default passwords
- **File:** `docker-compose.test-backends.yml:29`, `:51`, `:60`, `:116`
- **Confidence:** High
- **Problem:** The test stack uses `tecnativa/docker-socket-proxy:latest` and defaults `POSTGRES_PASSWORD`/`MYSQL_ROOT_PASSWORD` to weak values while exposing judge workers that execute arbitrary user code.
- **Failure scenario:** A compromised `latest` proxy image or trivial default credentials on an externally reachable CI host lead to full Docker daemon compromise.
- **Fix:** Pin the proxy to the same digest used in production and require explicit strong passwords via `:?` or external secrets.

#### CQ4-D04 — Language Dockerfiles download unpinned toolchains/installers
- **File:** `docker/Dockerfile.judge-*` (many)
- **Confidence:** High
- **Problem:** Many language images use `curl ... | sh`, `apk add ... latest`, `git clone`, or tarball downloads without checksum verification.
- **Failure scenario:** A compromised upstream distribution or renamed release asset silently produces a broken or malicious judge image.
- **Fix:** Pin every external download to a version/hash and verify checksums in the Dockerfile.

#### CQ4-D05 — `Dockerfile.judge-worker` architecture verification only logs
- **File:** `Dockerfile.judge-worker:17-22`
- **Confidence:** High
- **Problem:** The multi-stage build computes `EXPECTED_ARCH` and `BINARY_ARCH` and prints them, but does not compare the values or abort on mismatch.
- **Failure scenario:** A server-side build runs on a mismatched platform and succeeds, producing a non-executable binary.
- **Fix:** Add an explicit comparison that exits non-zero when architectures do not match.

#### CQ4-D06 — Committed nginx catch-all `client_max_body_size` still `1m`
- **File:** `scripts/online-judge.nginx.conf:94-95`, `deploy-docker.sh:1647-1648`
- **Confidence:** High
- **Problem:** The committed HTTPS template scopes the catch-all `/` location to `1m`, while the runtime-generated config uses `50M`.
- **Failure scenario:** An operator manually copies or bases a hand-edit on the committed template; legitimate uploads larger than 1 MiB are rejected.
- **Fix:** Align the committed template with the generated config, or add a prominent comment explaining the generated value is authoritative.

#### CQ4-D07 — `backup-db.sh` retention loop re-counts newer backups per file
- **File:** `scripts/backup-db.sh:112-123`
- **Confidence:** Medium
- **Problem:** For every candidate backup file, the script re-runs `find ... -mtime -30 | wc -l` to recompute `NEWER_COUNT`. The `find ... | while read` pipeline also creates a subshell.
- **Failure scenario:** With thousands of backups, retention becomes O(n²) and may race with concurrent backups.
- **Fix:** Compute `NEWER_COUNT` once before the loop and use a `while read` loop fed by process substitution, or refactor to a single `find -delete` pass after the guard check.

#### CQ4-D08 — `code-similarity-rs.service` lacks systemd hardening
- **File:** `scripts/code-similarity-rs.service`
- **Confidence:** High
- **Problem:** `online-judge.service` and `online-judge-worker-rs.service` include `ProtectSystem=strict`, `PrivateTmp=true`, and `NoNewPrivileges=true`. The sidecar service omits these.
- **Failure scenario:** Increased blast radius if the similarity sidecar is ever run as a host-level systemd unit.
- **Fix:** Add the same hardening directives, adjusted only for paths the sidecar legitimately needs to write.

#### CQ4-D09 — `docker builder prune -af` clears all build cache
- **File:** `deploy-docker.sh:486`, `:555`; `scripts/rebuild-worker-language-images.sh:107`
- **Confidence:** Medium
- **Problem:** `-af` removes all unused build cache, not just dangling layers.
- **Failure scenario:** For ~100 language images this forces cold rebuilds, significantly increasing deploy time and network load.
- **Fix:** Prefer `docker builder prune -f` for routine cleanup; reserve `-af` for explicit deep-clean operations.

#### CQ4-D10 — `docker container prune --filter until=24h` is a heuristic bound
- **File:** `deploy-docker.sh:482`, `:554`
- **Confidence:** Medium
- **Problem:** The filter retains stopped containers younger than 24 hours.
- **Failure scenario:** A runaway container can leave many stopped instances within the window, allowing disk usage to grow unbounded during a busy deploy cycle.
- **Fix:** Add an explicit numeric cap on retained stopped containers or tighten the filter window, and surface container counts in the storage report.

#### CQ4-D11 — `static-site/deploy.sh` hardcodes production domain/email
- **File:** `static-site/deploy.sh:18`, `:22`, `:70`
- **Confidence:** High
- **Problem:** The script defaults to `oj.auraedu.me`, `static.auraedu.me`, and `admin@auraedu.me`.
- **Failure scenario:** Running it from a fresh checkout without overrides attempts to deploy to and request certificates for the production site.
- **Fix:** Make the domain/email required and drive them from env vars or a target env file.

#### CQ4-D12 — Floating `rust:1-alpine` / `alpine:3.21` base tags
- **File:** `Dockerfile.judge-worker:10`, `:27`; `Dockerfile.code-similarity`; `Dockerfile.rate-limiter-rs`
- **Confidence:** Medium
- **Problem:** `rust:1-alpine` points to the latest 1.x Rust release.
- **Failure scenario:** A future image update changes the toolchain, producing non-reproducible builds or breaking native dependencies.
- **Fix:** Pin to a specific digest for `rust:1-alpine` and `alpine:3.21` and update intentionally.

#### CQ4-D13 — `deploy-docker.sh` hardcodes DB network name
- **File:** `deploy-docker.sh:1259-1260`
- **Confidence:** Medium
- **Problem:** The Step 5b backfill detects the DB network with `grep -E '^judgekit_db$'`.
- **Failure scenario:** If `COMPOSE_PROJECT_NAME` is overridden, this network does not exist and the migration helper may attach to the wrong network or fail.
- **Fix:** Derive the network name from the actual running `judgekit-db` container's network attachment instead of hardcoding the default project name.

#### CQ4-U15 — Language build/remove/prune actions show spurious error toasts on unmount abort
- **File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:185`, `:217`, `:253`
- **Confidence:** High
- **Problem:** The cleanup effect aborts in-flight fetches on unmount. The `.catch()` handlers treat `AbortError` as a real failure and show error toasts; `.finally` setters can run after unmount.
- **Failure scenario:** Navigating away while a build is in progress shows a misleading error toast.
- **Fix:** Return early in `.catch` for `AbortError`; guard final setters with a mounted ref.

#### CQ4-U16 — Chat-log fetches are not cancellable and can race
- **File:** `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:54`, `:73`
- **Confidence:** High
- **Problem:** Rapid pagination or unmounting while a fetch is pending can call `setSessions`/`setMessages` after unmount, or an older fetch can overwrite a newer page.
- **Failure scenario:** The admin clicks through chat pages quickly; stale data overwrite the current page.
- **Fix:** Store an `AbortController` in a ref, abort the previous request before each new fetch, and guard state updates with a mounted ref.

#### CQ4-U17 — Files added after upload starts are ignored
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx:90-157`
- **Confidence:** Medium
- **Problem:** Users can still drop/select files while `isUploading` is true. `handleUpload` closes over the queue snapshot from render start, so newly added files are never uploaded.
- **Failure scenario:** Dropping additional files during an active upload silently discards them.
- **Fix:** Disable the dropzone/input while uploading, or derive the next pending item from functional state updates and skip auto-close until the queue is empty.

#### CQ4-U18 — Bulk-create dialog can be submitted while parse errors are displayed
- **File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:181-225`
- **Confidence:** Medium
- **Problem:** `parseError` may be set, but the Create button remains enabled and `handleSubmit` sends whatever `parsedRows` exist.
- **Failure scenario:** An admin sees a parse error but clicks Create anyway, sending incomplete or malformed data.
- **Fix:** Disable the Create button when `parseError` is truthy, or block submission and surface the error.

#### CQ4-U19 — `signOut` errors swallowed before `signIn`
- **File:** `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:79`
- **Confidence:** Medium
- **Problem:** If `signOut({ redirect: false })` rejects, the error is swallowed and `signIn` proceeds.
- **Failure scenario:** A candidate starts the assessment while the previous session is still active.
- **Fix:** Surface the error and stop before `signIn`, unless it is an `AbortError`.

#### CQ4-U20 — Returning redeemed users skip assignment deadline check
- **File:** `src/app/(auth)/recruit/[token]/page.tsx:171-212`
- **Confidence:** Medium
- **Problem:** The re-entry branch returns before the assignment deadline check.
- **Failure scenario:** A returning candidate proceeds toward the contest after the deadline has passed.
- **Fix:** Move the deadline check before the re-entry branch, or ensure the join handler always rejects post-deadline access.

#### CQ4-U21 — SSE timeout stops polling instead of falling back to fetch
- **File:** `src/hooks/use-submission-polling.ts:211-216`
- **Confidence:** High
- **Problem:** The server sends `event: timeout` after the SSE idle timeout and closes the stream. A submission still in `pending`/`queued`/`judging` will no longer receive updates.
- **Failure scenario:** A slow judge causes the client to stop polling and the user never sees the final result.
- **Fix:** Call `startFetchPolling()` in the timeout handler, mirroring the `onerror` fallback.

#### CQ4-U22 — Failed server autosave is never retried
- **File:** `src/hooks/use-server-source-draft.ts:105-115`
- **Confidence:** High
- **Problem:** `lastSavedRef.current = code` is assigned before the PUT begins. If the PUT fails, the next effect sees `sourceCode === lastSavedRef.current` and suppresses another save attempt.
- **Failure scenario:** A transient network blip causes the server draft to remain stale indefinitely until the user edits again.
- **Fix:** Move `lastSavedRef.current = code` into the `.then()`, or reset the ref in `.catch`.

#### CQ4-U23 — Server draft hydration can race with function-stub preload
- **File:** `src/hooks/use-server-source-draft.ts:69-96`
- **Confidence:** Medium
- **Problem:** A separate effect seeds a function-judging stub shortly after mount. If that stub populates `sourceCode` before the hydration GET resolves, `isTemplateLike` returns false and the server draft is skipped.
- **Failure scenario:** A user with a saved server draft for a function problem sees the stub instead of their saved code.
- **Fix:** Pass the problem's `functionSpec` into `useServerSourceDraft` or coordinate stub preload to run only after server hydration completes.

#### CQ4-U24 — Language switch after hydration never fetches new server draft
- **File:** `src/hooks/use-server-source-draft.ts:69-96`
- **Confidence:** High
- **Problem:** The hydration effect depends only on `[enabled, problemId]`. Switching language updates `languageRef.current` but triggers no new server fetch.
- **Failure scenario:** A server draft for the new language is never restored after the user changes language.
- **Fix:** Re-run the server fetch when `language` changes.

#### CQ4-U25 — `allowNextNavigation` bypass persists across navigations
- **File:** `src/hooks/use-unsaved-changes-guard.ts:182-185`, `:196-198`
- **Confidence:** High
- **Problem:** `allowNextNavigation()` sets `bypassNavigationRef.current = true`. The history-patch effect reads the flag and allows the navigation, but does not reset it.
- **Failure scenario:** Subsequent navigations also bypass confirmation while `isDirty` remains true.
- **Fix:** Reset `bypassNavigationRef.current = false` inside `sharedPushState`/`sharedReplaceState` after acting on the bypass.

#### CQ4-U26 — `history.replaceState` navigations bypass the guard
- **File:** `src/hooks/use-unsaved-changes-guard.ts:66-85`
- **Confidence:** High
- **Problem:** `sharedReplaceState` does not call `confirmNavigation(url)` before delegating.
- **Failure scenario:** Programmatic `router.replace('/other')` with unsaved changes leaves the page without confirmation.
- **Fix:** Call `active.confirmNavigation(url)` in `sharedReplaceState` and return early if the user cancels.

#### CQ4-U27 — Mutable `draftStore` held in `useMemo`
- **File:** `src/hooks/use-source-draft.ts:219-237`
- **Confidence:** Medium
- **Problem:** React does not guarantee `useMemo` identity across renders.
- **Failure scenario:** Hot reload, Strict Mode, or future concurrent behavior can recreate the store and drop its in-memory snapshot.
- **Fix:** Store the store instance in `useRef` and update its language list without recreating it, or lift state into `useReducer`/`useState`.

#### CQ4-U28 — `useSyncExternalStore` hydration subscription is a no-op
- **File:** `src/hooks/use-source-draft.ts:135-137`, `:239`
- **Confidence:** Medium
- **Problem:** `subscribeToHydration` returns a no-op unsubscribe while `getSnapshot` always returns `true`.
- **Failure scenario:** Violates the `useSyncExternalStore` contract and creates a server/client mismatch risk.
- **Fix:** Use a real one-shot subscription or replace the hydration gate with `useEffect` + `useState`.

#### CQ4-U29 — Keyboard shortcuts fire in contenteditable elements
- **File:** `src/hooks/use-keyboard-shortcuts.ts:39-61`
- **Confidence:** High
- **Problem:** Global shortcuts do not exclude `contenteditable` elements.
- **Failure scenario:** Shortcuts fire while the user is editing a rich-text field, causing unexpected actions.
- **Fix:** Add a guard for `((e.target as HTMLElement)?.closest?.("[contenteditable='true']"))`.

#### CQ4-U30 — `shortcutsRef` update lags by one commit
- **File:** `src/hooks/use-keyboard-shortcuts.ts:35-37`
- **Confidence:** Medium
- **Problem:** `shortcutsRef.current = shortcuts` is assigned inside `useEffect`, so a keydown between render and effect commit reads the previous shortcuts map.
- **Failure scenario:** A rapid keypress after a props change invokes the old handler.
- **Fix:** Assign the ref synchronously during render or use `useInsertionEffect`.

#### CQ4-U31 — Async discussion handlers set state after possible unmount
- **File:** `src/components/discussions/discussion-post-form.tsx:36-61`, `discussion-thread-form.tsx:42-68`, `discussion-thread-moderation-controls.tsx:60-114`
- **Confidence:** High
- **Problem:** Each handler awaits `apiFetch` and calls `setIsSubmitting(false)` in `finally`. If the component unmounts, React warns.
- **Failure scenario:** The user navigates away while submitting a post/thread/moderation action.
- **Fix:** Create an `AbortController` and use a mounted ref to guard final setters.

#### CQ4-U32 — Server-action persistence errors silently swallowed
- **File:** `src/components/layout/theme-toggle.tsx:95-97`, `src/components/lecture/lecture-mode-provider.tsx:72,79,84`
- **Confidence:** High
- **Problem:** Theme and lecture preference persistence use `.catch(() => {})`, discarding rate-limit, unauthorized, or validation failures.
- **Failure scenario:** The user sees a saved theme but the server rejected it; the change is lost on next load.
- **Fix:** Surface failures with `toast.error` and/or log them in development.

#### CQ4-U33 — Theme persistence calls can fire out of order
- **File:** `src/components/layout/theme-toggle.tsx:91-99`
- **Confidence:** Medium
- **Problem:** Rapid theme selections produce multiple uncoordinated `updatePreferences` calls whose resolutions may arrive out of order.
- **Failure scenario:** The DB ends up with an intermediate theme instead of the final selection.
- **Fix:** Serialize updates with a pending-promise ref or debounce the persistence call.

#### CQ4-U34 — Initial language extension load races with prop changes
- **File:** `src/components/code/code-surface.tsx:405-411`
- **Confidence:** High
- **Problem:** The initial mount effect starts a dynamic import for `initialEditorConfig.language`. If the parent changes the `language` prop before that import resolves, the initial effect's promise is not cancelled.
- **Failure scenario:** The editor highlights the wrong language after a prop change.
- **Fix:** Keep a `latestLanguageRef` and compare inside the `.then` callback, or move the initial load into the effect that reacts to `[language]`.

#### CQ4-U35 — Dynamic language/theme imports can throw unhandled rejections
- **File:** `src/components/code/code-surface.tsx:405`, `:422`, `:445`
- **Confidence:** High
- **Problem:** If a chunk fails to load, the promise rejects with no `.catch`.
- **Failure scenario:** The editor is left without a fallback extension and the error is reported as an unhandled rejection.
- **Fix:** Append `.catch(() => [])` to each dynamic import so the editor falls back to plain text.

#### CQ4-U36 — Switching from custom theme back to built-in disables syntax highlighting
- **File:** `src/components/code/code-surface.tsx:432-457`
- **Confidence:** High
- **Problem:** The custom-theme branch sets `highlightCompartmentRef.current.reconfigure([])`. When `editorThemeProp` changes back to a built-in theme, the built-in branch does not restore the default highlight.
- **Failure scenario:** Syntax highlighting disappears after toggling from a custom theme to a built-in theme.
- **Fix:** In the built-in-theme branch, also dispatch `highlightCompartmentRef.current.reconfigure(getHighlightExtension(resolvedTheme === "dark"))`.

#### CQ4-U37 — Anti-cheat snapshot timer does not reset on edits
- **File:** `src/components/problem/problem-submission-form.tsx:164-220`
- **Confidence:** High
- **Problem:** After a long idle period, the timer schedules the next snapshot 60 seconds out. If the user resumes typing during that window, the pending `setTimeout` is not rescheduled.
- **Failure scenario:** Snapshots are delayed well beyond the intended 10-second active-editing interval.
- **Fix:** Clear `snapshotTimerRef.current` and re-arm `tick` with the 10-second interval whenever `assignmentId` is present and `sourceCode` changes.

#### CQ4-U38 — Anti-cheat snapshot retry timers not cleared on unmount
- **File:** `src/components/problem/problem-submission-form.tsx:191-209`
- **Confidence:** Medium
- **Problem:** `sendSnapshot` schedules retry timeouts inside itself. The outer effect cleanup only clears `snapshotTimerRef.current`.
- **Failure scenario:** Retries can fire after the component unmounts.
- **Fix:** Track all active retry timeout IDs and clear them in the cleanup function.

#### CQ4-U39 — Comment and behavior mismatch for long background hides
- **File:** `src/components/exam/countdown-timer.tsx:193-198`
- **Confidence:** High
- **Problem:** The comment says threshold toasts are suppressed when the tab was hidden for more than 30 seconds, but `recalculate(!wasHiddenLong)` fires all crossed thresholds when the hide was long.
- **Failure scenario:** A student returning from a break gets toast spam for every crossed threshold.
- **Fix:** Pass `wasHiddenLong` instead of `!wasHiddenLong` to `recalculate`, or add an explicit suppression path for long hides.

#### CQ4-U40 — Compiler client trusts server response shape without validation
- **File:** `src/components/code/compiler-client.tsx:296`
- **Confidence:** Medium
- **Problem:** `result: data.data as CompilerResult` assumes the server returns every expected field.
- **Failure scenario:** Missing fields pass `undefined` into components expecting strings, causing runtime errors or blank output.
- **Fix:** Defensively validate/normalize the fields before casting.

#### CQ4-U41 — `.json().catch(() => ({}))` swallows non-JSON error responses
- **File:** `src/app/(public)/groups/[id]/assignment-delete-button.tsx:39`, `src/app/(public)/problems/[id]/problem-delete-button.tsx:44`, `src/app/(public)/groups/[id]/group-members-manager.tsx:138`, `:200`, `:254`, `:311`, `src/app/(public)/groups/[id]/group-instructors-manager.tsx:72`, `src/app/(public)/groups/edit-group-dialog.tsx:91`, `src/app/(public)/problem-sets/_components/problem-set-form.tsx:145`, `:177`, `:202`, `:239`, `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:284`, `src/app/(public)/problems/create/create-problem-form.tsx:524`, `src/app/(public)/groups/create-group-dialog.tsx:69`
- **Confidence:** High
- **Problem:** HTML 502/504 responses are silently swallowed and handlers display a generic message.
- **Failure scenario:** An operator cannot distinguish a server outage from a validation error.
- **Fix:** Check `response.headers.get("content-type")` or use a safe JSON helper that surfaces parse failures; log raw text in development.

#### CQ4-U42 — Non-null assertions bypass runtime null checks
- **File:** `src/app/(public)/contests/manage/page.tsx:186`, `src/app/(public)/practice/page.tsx:431`, `src/app/(public)/submissions/page.tsx:177`, `:191`, `:199`, `src/app/(public)/dashboard/_components/admin-dashboard.tsx:46`, `src/app/(public)/problems/create/create-problem-form.tsx:472`
- **Confidence:** High
- **Problem:** `!` assertions assume values are non-null.
- **Failure scenario:** A future schema or permission change allows a null value through and causes a runtime `TypeError`.
- **Fix:** Replace each `!` with an explicit guard that throws a clear invariant error or redirects/returns early.

#### CQ4-U43 — Type assertions on `Select` values and search-param filters
- **File:** `src/app/(public)/groups/[id]/assignment-form-dialog.tsx:433`, `:480`, `:500`, `src/app/(public)/groups/[id]/group-instructors-manager.tsx:151`, `src/app/(public)/groups/[id]/assignments/[assignmentId]/filter-form.tsx:79`, `src/app/(public)/problems/create/create-problem-form.tsx:595`, `:763`, `:805`, `src/app/(public)/contests/manage/[assignmentId]/page.tsx:255`, `:258`, `src/app/(public)/problems/page.tsx:157-158`, `src/app/(public)/submissions/page.tsx:134-143`, `src/app/(public)/rankings/page.tsx:115-116`, `src/app/(public)/practice/page.tsx:136-137`, `src/app/(public)/practice/problems/[id]/page.tsx:703`, `src/app/(public)/profile/editor-theme-picker.tsx:166`, `src/app/(public)/groups/page.tsx:42-43`, `src/app/(public)/problems/page.tsx:513`
- **Confidence:** High
- **Problem:** Runtime strings are cast to narrowed unions without validation.
- **Failure scenario:** Database enum drift or a misbehaving `Select` can persist invalid values to the API.
- **Fix:** Validate against known const arrays or a small Zod schema before casting.

#### CQ4-U44 — Progress filter loads full problem/submission lists into memory
- **File:** `src/app/(public)/practice/page.tsx:425-460`
- **Confidence:** High
- **Problem:** For non-"all" progress filters, the page fetches all matching public problem IDs and all user submissions, then filters in JavaScript.
- **Failure scenario:** As the catalog grows, this risks Vercel timeout or OOM.
- **Fix:** Push progress filtering into the database with a CTE before pagination.

#### CQ4-U45 — Test-case file inputs read arbitrarily large files
- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:441-461`
- **Confidence:** High
- **Problem:** `selectedFile.text()` is called without checking size.
- **Failure scenario:** A multi-hundred-megabyte file can freeze or crash the browser tab.
- **Fix:** Reject files larger than a configured test-case limit before calling `.text()` and show a toast.

---

### LOW

#### CQ4-A07 — Cache TTL comment is stale
- **File:** `src/lib/system-settings-config.ts:159-173`
- **Confidence:** High
- **Problem:** The JSDoc and inline comments describe a "60s in-memory cache", but `CACHE_TTL_MS` is `15_000`.
- **Failure scenario:** Future maintainers misconfigure timeouts or tune performance based on an incorrect 60 s assumption.
- **Fix:** Update comments to match the 15 s TTL.

#### CQ4-A08 — Command prefix validator accepts overly permissive suffixes
- **File:** `src/lib/compiler/execute.ts:244-254`
- **Confidence:** Medium
- **Problem:** `isValidCommandPrefix` accepts any suffix matching `/^[0-9.\-_]+$/`, letting names like `python3_malicious` or `gcc-evil` pass.
- **Failure scenario:** A compromised language image contains `gcc-pwned`; a malicious `compileCommand` starting with it passes strict validation.
- **Fix:** Restrict the suffix to version characters only (`/^[0-9.]+$/`).

#### CQ4-A09 — Similarity pair enrichment can render `null (undefined)` names
- **File:** `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:82`
- **Confidence:** Low
- **Problem:** The display name is built with `${u.name} (${u.username})` without null checks.
- **Failure scenario:** If schema invariants are violated, the UI shows malformed placeholder text.
- **Fix:** Use `u.name ?? ""` and `u.username ?? u.id` with a safer formatter.

#### CQ4-A10 — Shell validator ignores some shell special variables
- **File:** `src/lib/compiler/execute.ts:187-192`
- **Confidence:** Low
- **Problem:** The denylist does not match `$?`, `$#`, `$@`, `$*`, `$!`, `$-`, or positional `$0`–`$9`.
- **Failure scenario:** A malicious admin-configured command uses `$?` in an `&&` chain to hide logic; the validator accepts it.
- **Fix:** Extend the regex to reject `\$[?#@*!$0-9-]` in addition to the existing `\$[A-Za-z0-9_]`.`

#### CQ4-R06 — `oci_runtime()` re-reads environment on every container spawn
- **File:** `judge-worker-rs/src/docker.rs:84-89`
- **Confidence:** High
- **Problem:** `JUDGE_OCI_RUNTIME` is fetched and parsed on every call to `run_docker_once`.
- **Failure scenario:** Adds unnecessary syscalls and env lookups on the hot path.
- **Fix:** Cache the value in `Config` at startup.

#### CQ4-R07 — `validate_runtime_path` accepts relative paths
- **File:** `judge-worker-rs/src/config.rs:321-340`
- **Confidence:** Medium
- **Problem:** The validator rejects `..` and NUL but allows relative paths such as `./dead-letter` or `docker/seccomp-profile.json`.
- **Failure scenario:** A misconfigured production environment places the seccomp profile or dead-letter directory at a worker-relative path that changes with the working directory.
- **Fix:** Require absolute paths for `JUDGE_SECCOMP_PROFILE` and `DEAD_LETTER_DIR` in production, or resolve them against `current_dir()` and canonicalize.

#### CQ4-R08 — `workspace.rs` fails latest Clippy lints
- **File:** `judge-worker-rs/src/workspace.rs:71-73`, `:164-165`
- **Confidence:** High
- **Problem:** `cargo clippy --all-targets -- -D warnings` fails on `io::Error::new(ErrorKind::Other, ...)` and needless borrows.
- **Failure scenario:** CI that enforces Clippy breaks on Rust 1.93.
- **Fix:** Apply the two mechanical Clippy suggestions (`io::Error::other` and remove needless borrows).

#### CQ4-R09 — `String` errors make retry/telemetry classification impossible
- **File:** `judge-worker-rs/src/executor.rs` (multiple call sites)
- **Confidence:** Medium
- **Problem:** `report_error`, `report_panic`, `report_result`, and `report_with_retry` pass around `String` error messages.
- **Failure scenario:** Harder to add structured metrics or circuit-breakers later.
- **Fix:** Introduce a small `ReportError` enum with variants such as `Network`, `Serialization`, and `Filesystem`.

#### CQ4-D14 — Legacy `deploy.sh` inconsistent nginx body size / X-Forwarded-For
- **File:** `deploy.sh:244`
- **Confidence:** Medium
- **Problem:** The legacy script applies `client_max_body_size 50M` globally and sets `X-Forwarded-For $remote_addr` (overwriting any existing chain).
- **Failure scenario:** If still used for a dev/legacy deploy, it diverges from modern per-location limits and chain-preserving behavior.
- **Fix:** Either delete `deploy.sh` or align its generated nginx with the modern template and add a deprecation warning.

#### CQ4-D15 — HTTP-only dev template includes HSTS
- **File:** `scripts/online-judge.nginx-http.conf:27`
- **Confidence:** Medium
- **Problem:** The file is explicitly HTTP-only for local development, yet it sends `Strict-Transport-Security`.
- **Failure scenario:** Browsers that honor HSTS may refuse to connect to local HTTP endpoints after first contact.
- **Fix:** Remove the HSTS header from the HTTP-only dev template.

#### CQ4-D16 — `backup-db.sh` password extraction brittle for quoted/newline values
- **File:** `scripts/backup-db.sh:37`
- **Confidence:** Low
- **Problem:** The `grep | cut -d= -f2-` extraction fails if `POSTGRES_PASSWORD` contains newlines or if the env file contains quoted values.
- **Failure scenario:** A quoted password is passed to `pg_dump` with literal quotes, causing authentication failures.
- **Fix:** Source the env file in a sanitized way or use a proper key-value parser that respects quoting.

#### CQ4-D17 — Language Dockerfile seccomp path assumes repo-root build context
- **File:** `Dockerfile.judge-worker:40`; representative language Dockerfiles
- **Confidence:** Low
- **Problem:** `COPY docker/seccomp-profile.json ...` works only when the build context is the repo root.
- **Failure scenario:** Building from a subdirectory or filtered context fails with a missing file.
- **Fix:** Document the required build context in each Dockerfile comment or make the seccomp path an optional build argument.

#### CQ4-U46 — `useLazyRef` type assertion hides possible `null`
- **File:** `src/hooks/use-editor-compartments.ts:9`
- **Confidence:** Medium
- **Problem:** The return type assertion may hide that the value can be `null`.
- **Fix:** Return a stricter type or document the non-null assertion.

#### CQ4-U47 — `result` event assumed terminal could stop polling prematurely
- **File:** `src/hooks/use-submission-polling.ts:190-209`
- **Confidence:** Low
- **Problem:** The handler treats the `result` event as unconditionally terminal.
- **Failure scenario:** A non-terminal status delivered on the `result` channel stops polling.
- **Fix:** Only stop polling when `!ACTIVE_SUBMISSION_STATUSES.has(normalized.status)`.

#### CQ4-U48 — No cross-tab synchronization for localStorage drafts
- **File:** `src/hooks/use-source-draft.ts`
- **Confidence:** High
- **Problem:** Drafts stored in `localStorage` are not synchronized across tabs.
- **Failure scenario:** A user editing in two tabs overwrites their own work without warning.
- **Fix:** Add a `storage` event listener that re-reads the payload and calls `draftStore.replaceSnapshot`.

#### CQ4-U49 — `sharedReplaceState` mutates history state shape unconditionally
- **File:** `src/hooks/use-unsaved-changes-guard.ts:76-84`
- **Confidence:** Medium
- **Problem:** The wrapper injects keys into history state without checking the existing shape.
- **Fix:** Document the injected keys and consider namespacing under a single key.

#### CQ4-U50 — `popstate` restoration may use wrong direction when indices missing
- **File:** `src/hooks/use-unsaved-changes-guard.ts:295-315`
- **Confidence:** Low
- **Problem:** Direction fallback assumes `back` when indices are missing.
- **Fix:** Compare `window.location` before/after the popstate and use `history.back()`/`history.forward()` accordingly.

#### CQ4-U51 — CodeMirror compartments initialized as render side effect
- **File:** `src/hooks/use-editor-compartments.ts`
- **Confidence:** Low
- **Problem:** Compartments are created during render rather than in a lazy initializer.
- **Fix:** Use a lazy-init `useRef` callback or `useMemo` with an initializer function.

#### CQ4-U52 — Stale serialized input kept when function args are invalid
- **File:** `src/components/problem/function-test-case-editor.tsx`
- **Confidence:** Low
- **Problem:** The editor keeps the old serialized input after parsing fails.
- **Fix:** Store the invalid raw string and mark the case invalid, disabling submit until parsing succeeds.

#### CQ4-U53 — `use-visibility-polling.ts` does not protect against async callbacks
- **File:** `src/hooks/use-visibility-polling.ts:31-34`
- **Confidence:** Low
- **Problem:** The hook accepts any callback and does not guard against rejected promises.
- **Fix:** Wrap the call with `Promise.resolve(...).catch(...)` or forbid async callbacks in the type signature.

#### CQ4-U54 — Anti-cheat dashboard similarity check not abortable on unmount
- **File:** `src/components/contest/anti-cheat-dashboard.tsx`
- **Confidence:** Low
- **Problem:** The similarity POST is not tied to component lifetime.
- **Fix:** Add an `AbortController` local to the handler and check `signal.aborted` before updating state.

#### CQ4-U55 — Anti-cheat snapshot POST has no abort/cleanup on unmount
- **File:** `src/components/exam/anti-cheat-monitor.tsx:69`
- **Confidence:** Low
- **Problem:** The snapshot POST is not cancelled if the component unmounts.
- **Fix:** Pass an `AbortSignal` to `apiFetch` and abort on cleanup.

#### CQ4-U56 — Cleanup calls `setIsPolling(false)` after unmount
- **File:** `src/hooks/use-submission-polling.ts:360-362`
- **Confidence:** Low
- **Problem:** The cleanup function sets state after the hook may have unmounted.
- **Fix:** Remove the `setIsPolling(false)` call from cleanup; the `isLive` check already makes the returned `isPolling` false.

#### CQ4-U57 — `ExamDeadlineSync` fetch not aborted on unmount
- **File:** `src/components/exam/exam-deadline-sync.tsx:59`, `:96-100`
- **Confidence:** Low
- **Problem:** The deadline sync fetch has no cancellation.
- **Fix:** Create an `AbortController` in the effect and abort it in cleanup.

#### CQ4-U58 — Mount-only fetches lack unmount guards
- **File:** `src/components/contest/analytics-charts.tsx:557-559`, `src/components/contest/invite-participants.tsx:76-78`, `src/components/contest/access-code-manager.tsx:49-62`, `src/components/contest/anti-cheat-dashboard.tsx:169-188`, `src/components/contest/participant-anti-cheat-timeline.tsx`, `src/components/contest/recruiting-invitations-panel.tsx`, `src/components/submissions/_components/comment-section.tsx`
- **Confidence:** Medium
- **Problem:** Effects fetch data on mount and call setters after `await` without guarding unmount.
- **Failure scenario:** Navigating away before the fetch settles causes React warnings and potential stale state.
- **Fix:** Add a `cancelled` flag or `AbortController` and guard state updates.

#### CQ4-U59 — SMTP port can be submitted as `NaN`
- **File:** `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:181`
- **Confidence:** High
- **Problem:** The SMTP port input is not validated as a finite number before submission.
- **Failure scenario:** An empty or non-numeric value produces `NaN` and a confusing server error.
- **Fix:** Validate `Number(smtpPort)` is finite before submitting.

#### CQ4-U60 — Footer link ID type assertion hides contract mismatch
- **File:** `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:48`
- **Confidence:** Medium
- **Problem:** A cast is used to force a narrow ID type even though the source data may not provide it.
- **Fix:** Widen the prop type to `FooterLink[]` where `id?: string`, removing the cast.

#### CQ4-U61 — Workers stats fallback uses unsafe cast
- **File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:240`
- **Confidence:** Medium
- **Problem:** `{ data: null as unknown as WorkerStats }` suppresses null checks.
- **Failure scenario:** Render code that expects valid numeric fields receives `null`.
- **Fix:** Use a valid zeroed `WorkerStats` fallback or handle `null` explicitly in rendering.

#### CQ4-U62 — Loading/dialog state set after potential unmount in admin forms
- **File:** `src/app/(dashboard)/dashboard/admin/roles/role-delete-dialog.tsx:63`, `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:111`, `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:86`, `:173`, `src/app/(dashboard)/dashboard/admin/settings/footer-content-form.tsx:119`, `src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx:205`, `src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx:46`, `src/app/(dashboard)/dashboard/admin/users/user-actions.tsx:54`, `:77`
- **Confidence:** Medium
- **Problem:** Async handlers set loading/dialog state after `await` without a mounted guard.
- **Failure scenario:** Navigating away during an operation causes React warnings.
- **Fix:** Guard post-await setters with a mounted ref.

#### CQ4-U63 — Raw SQL used where Drizzle helpers are available
- **File:** `src/app/(public)/dashboard/_components/instructor-dashboard.tsx:57`, `src/app/(public)/groups/[id]/analytics/page.tsx:72`, `src/app/(public)/dashboard/_components/student-dashboard.tsx:35`, `:59`, `src/app/(public)/dashboard/_components/candidate-dashboard.tsx:100`
- **Confidence:** High
- **Problem:** Hand-written `sql` templates are used for queries that Drizzle helpers could express.
- **Failure scenario:** Refactors and type safety are harder; alias-rewrite footguns are more likely.
- **Fix:** Replace with `inArray`, `countDistinct`, or Drizzle query-builder equivalents.

#### CQ4-U64 — Error boundaries only log in development
- **File:** `src/app/(public)/contests/manage/error.tsx:22`, `src/app/(public)/problems/error.tsx:20`, `src/app/(public)/groups/error.tsx:20`
- **Confidence:** High
- **Problem:** `console.error` is only useful locally; production errors are lost.
- **Failure scenario:** Production incidents go undetected until a user reports them.
- **Fix:** Integrate a production error reporter or log to a server-side endpoint unconditionally.

#### CQ4-U65 — Sidebar state cookie lacks explicit attributes
- **File:** `src/components/ui/sidebar.tsx:83`
- **Confidence:** Medium
- **Problem:** The sidebar state cookie is written without explicit `SameSite` or `Secure` attributes.
- **Failure scenario:** Browser defaults may expose the cookie to CSRF requests over HTTP in some deployments.
- **Fix:** Set `SameSite=Lax` (and `Secure` over HTTPS) explicitly.

---

## Supplemental App-Server Findings (Final Exhaustive Pass)

A final line-by-line pass over the boundary-layer Next.js app server code (`src/app/api/**/*.ts`, `src/lib/**/*.ts`, `src/lib/**/*.tsx`) uncovered the following additional issues. These are **not** duplicated from the main findings above unless a distinct failure mode is described.

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-01 | CRITICAL | High | `src/lib/files/validation.ts:118-139` | ZIP decompressed-size validator trusts attacker-controlled metadata |
| C4-NEW-02 | HIGH | High | `src/lib/files/storage.ts:19-26` | `resolveStoredPath` rejects valid nanoid filenames starting with `_` or `-` |
| C4-NEW-03 | HIGH | High | `src/app/api/v1/submissions/route.ts:69-71`, `:86-100` | Cursor pagination accepts invalid decoded timestamps |
| C4-NEW-04 | MEDIUM | Medium | `src/app/api/v1/submissions/route.ts:385-392` | Global judge-queue cap excludes `judging` submissions |
| C4-NEW-05 | MEDIUM | High | `src/app/api/v1/files/[id]/route.ts:201-222` | File delete returns success when disk artifact remains orphaned |
| C4-NEW-06 | MEDIUM | Medium | `src/lib/compiler/execute.ts:681` | `tryRustRunner` sidecar timeout keeps requests open for two minutes |
| C4-NEW-07 | MEDIUM | Medium | `src/lib/compiler/execute.ts:988-1012` | `cleanupOrphanedContainers` trusts `docker ps` JSON shape without validation |
| C4-NEW-08 | MEDIUM | High | `src/lib/security/rate-limit.ts:53-63` | Eviction deletes active rate-limit blocks by `lastAttempt` instead of `blockedUntil` |
| C4-NEW-09 | MEDIUM | Medium | `src/lib/api/handler.ts:203-206` | Role-only auth config silently rejects custom roles |
| C4-NEW-10 | LOW | Medium | `src/app/api/v1/files/route.ts:130-134` | Audit resource label uses raw upload filename |

### CRITICAL

#### C4-NEW-01 — ZIP decompressed-size validator trusts attacker-controlled metadata
- **File:** `src/lib/files/validation.ts:118-139`
- **Confidence:** High
- **Problem:** `validateZipDecompressedSize` takes a fast path when `entry._data.uncompressedSize` is present and within configured limits, returning success without streaming actual decompressed bytes. ZIP local file headers are attacker-controlled and `uncompressedSize` can be set arbitrarily.
- **Failure scenario:** A user uploads a ZIP whose metadata claims each entry is 1 byte but whose real decompressed total is multi-gigabytes. The server accepts the file; downstream processing materializes the payload and exhausts memory.
- **Fix:** Remove the metadata fast path and always run the streaming slow path (`measureEntryStreamedSize`). If the fast path must remain for performance, gate it on a non-forgeable check and still stream any entry whose metadata size exceeds a low threshold.

### HIGH

#### C4-NEW-02 — `resolveStoredPath` rejects valid nanoid filenames starting with `_` or `-`
- **File:** `src/lib/files/storage.ts:19-26`
- **Confidence:** High
- **Problem:** `SAFE_STORED_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]+$/` requires the first character to be alphanumeric. The default `nanoid()` alphabet is `A-Za-z0-9_-`, so generated IDs can begin with `_` or `-`.
- **Failure scenario:** Roughly 3% of file uploads fail with a 500 after the DB row is inserted. Existing files whose stored names start with `_` or `-` also become unreadable/undeletable.
- **Fix:** Relax the regex to allow `_` and `-` as the first character while retaining the `..` guard, e.g. `/^[a-zA-Z0-9._-]+$/`, and add a unit test covering the full nanoid output distribution.

#### C4-NEW-03 — Cursor pagination accepts invalid decoded timestamps
- **File:** `src/app/api/v1/submissions/route.ts:69-71`, `:86-100`
- **Confidence:** High
- **Problem:** After base64-decoding a cursor, the code constructs `cursorSubmittedAt = new Date(decoded.t)` without validating the result. An `Invalid Date` object is truthy and is passed to Drizzle comparison helpers.
- **Failure scenario:** A client submits a cursor containing `"t": "not-a-date"`. The endpoint throws a 500 instead of returning a clean `invalidCursor` 400.
- **Fix:** Guard the parsed date:
  ```ts
  if (Number.isNaN(cursorSubmittedAt.getTime())) {
    return apiError("invalidCursor", 400);
  }
  ```

### MEDIUM

#### C4-NEW-04 — Global judge-queue cap excludes `judging` submissions
- **File:** `src/app/api/v1/submissions/route.ts:385-392`
- **Confidence:** Medium
- **Problem:** The global queue-limit query counts only `pending` and `queued` statuses, omitting `judging`.
- **Failure scenario:** Under load with long-running judges, the server accepts more concurrent work than the operator's global limit intends.
- **Fix:** Include `"judging"` in the `IN (...)` clause, or rename/comment the setting to clarify it caps only queued-not-yet-claimed work.

#### C4-NEW-05 — File delete returns success when disk artifact remains orphaned
- **File:** `src/app/api/v1/files/[id]/route.ts:201-222`
- **Confidence:** High
- **Problem:** The DELETE handler deletes the DB row first, records an audit event, and then best-effort deletes the on-disk file. If disk deletion fails, the response is still `{deleted: true}`.
- **Failure scenario:** A permissions or I/O error leaves the artifact on disk while the API and audit trail report success.
- **Fix:** Either delete the disk artifact before the DB row and abort on failure, or return a non-2xx status when disk cleanup fails and do not record the audit as successfully deleted.

#### C4-NEW-06 — `tryRustRunner` sidecar timeout keeps requests open for two minutes
- **File:** `src/lib/compiler/execute.ts:681`
- **Confidence:** Medium
- **Problem:** The fetch uses `AbortSignal.timeout(Math.max(timeLimitMs * 4, 120_000))`, so even a 5 s compiler run waits 120 s before detecting an unresponsive sidecar.
- **Failure scenario:** If the runner sidecar becomes unresponsive, every compiler-run request waits two minutes, tying up Next.js workers.
- **Fix:** Use a small connection/read timeout (e.g., 5–10 s) to detect an unavailable sidecar and fall back immediately; apply a larger ceiling only when actively waiting for a result from a healthy sidecar.

#### C4-NEW-07 — `cleanupOrphanedContainers` trusts `docker ps` JSON shape
- **File:** `src/lib/compiler/execute.ts:988-1012`
- **Confidence:** Medium
- **Problem:** Each `docker ps --format '{{json .}}'` line is parsed with `JSON.parse` and destructured for `Names`, `Status`, and `CreatedAt` without schema validation.
- **Failure scenario:** A future Docker version that renames a field causes the function to silently stop matching containers, so stale containers accumulate.
- **Fix:** Validate parsed lines with a small Zod schema and log unexpected shapes.

#### C4-NEW-08 — Rate-limit eviction deletes active blocks
- **File:** `src/lib/security/rate-limit.ts:53-63`
- **Confidence:** High
- **Problem:** `evictStaleEntries` deletes rows where `lastAttempt < cutoff` (24 h old). With exponential backoff, `blockedUntil` can be far in the future (up to `blockMs * 2^5`), so an active block can be removed because its `lastAttempt` is old.
- **Failure scenario:** A brute-force client receives a 32 h block but can resume after 24 h because the evictor removed the still-active block.
- **Fix:** Evict only rows that are both stale and no longer blocking:
  ```ts
  and(lt(rateLimits.lastAttempt, cutoff), or(isNull(rateLimits.blockedUntil), lt(rateLimits.blockedUntil, cutoff)))
  ```

#### C4-NEW-09 — Role-only auth config silently rejects custom roles
- **File:** `src/lib/api/handler.ts:203-206`
- **Confidence:** Medium
- **Problem:** The role check is `if (isUserRole(user.role) && !auth.roles.includes(user.role))`. For custom roles, `isUserRole` is `false`, so the role check is skipped entirely; endpoints protected only by `roles` remain inaccessible to custom admin-like roles.
- **Failure scenario:** A deployment defines a custom admin-like role; endpoints protected only by `roles: ["admin"]` reject that role.
- **Fix:** Add explicit capability requirements to every endpoint that must support custom roles, or document that `roles` arrays are intentionally restricted to built-in roles.

### LOW

#### C4-NEW-10 — Audit resource label uses raw upload filename
- **File:** `src/app/api/v1/files/route.ts:130-134`
- **Confidence:** Medium
- **Problem:** `recordAuditEvent` receives `resourceLabel: file.name`, the raw client-provided filename, instead of the sanitized `originalName` persisted to the database.
- **Failure scenario:** Audit logs and downstream consumers may display a filename that differs from the stored value or ingest unusually long labels.
- **Fix:** Use `sanitizedOriginalName` for the audit resource label.

---

---

## Supplemental Rust Workers and Sidecars Findings

A final line-by-line pass over the three Rust crates (`judge-worker-rs`, `rate-limiter-rs`, `code-similarity-rs`) uncovered the following additional issues. These are distinct from the `CQ4-Rxx` findings already recorded above unless a new failure mode is described.

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-R01 | HIGH | High | `judge-worker-rs/src/docker.rs:408-413` | `docker run` child spawned without `kill_on_drop(true)` |
| C4-NEW-R02 | HIGH | High | `judge-worker-rs/src/runner.rs:444-452` | `constant_time_eq` leaks expected token length |
| C4-NEW-R03 | HIGH | High | `judge-worker-rs/src/api.rs:190-194` | Unbounded poll response body deserialized into memory |
| C4-NEW-R04 | HIGH | High | `rate-limiter-rs/src/main.rs:323-325` | Integer overflow in block-duration calculation |
| C4-NEW-R05 | HIGH | High | `rate-limiter-rs/src/main.rs:242-245` | `window_ms = 0` bypasses the rate limit entirely |
| C4-NEW-R06 | HIGH | High | `rate-limiter-rs/src/main.rs:248`, `:322` | `max_attempts = 0` permanently blocks every key |
| C4-NEW-R07 | HIGH | High | `code-similarity-rs/src/main.rs:126-140` | CPU-bound `/compute` work has no timeout or cancellation |
| C4-NEW-R08 | MEDIUM | High | `judge-worker-rs/src/config.rs:362-364` | Non-HTTP schemes accepted as "secure" judge URLs |
| C4-NEW-R09 | MEDIUM | High | `judge-worker-rs/src/executor.rs:453-454` | Submission run limit can override operator compile-memory limit |
| C4-NEW-R10 | MEDIUM | High | `judge-worker-rs/src/runner.rs:907` | Runner compile timeout has no upper bound |
| C4-NEW-R11 | MEDIUM | High | `judge-worker-rs/src/workspace.rs:79-117` | `Drop` performs blocking synchronous cleanup |
| C4-NEW-R12 | MEDIUM | High | `rate-limiter-rs/src/main.rs:323-327` | `block_ms = 0` produces a zero-duration block |
| C4-NEW-R13 | MEDIUM | High | `rate-limiter-rs/src/main.rs:357-381`, `:510-515` | Eviction task is not cancelled during graceful shutdown |
| C4-NEW-R14 | MEDIUM | High | `rate-limiter-rs/src/main.rs:359` | Eviction interval uses default `Burst` missed-tick behavior |
| C4-NEW-R15 | MEDIUM | High | `rate-limiter-rs/src/main.rs:434-438`, `:499-502` | Invalid `RATE_LIMITER_HOST` / `RATE_LIMITER_PORT` env values silently fall back |
| C4-NEW-R16 | MEDIUM | High | `code-similarity-rs/src/similarity.rs:30-39` | Unterminated block comments leak trailing source content |
| C4-NEW-R17 | MEDIUM | High | `code-similarity-rs/src/main.rs:243-246` | Graceful shutdown waits indefinitely for open connections |
| C4-NEW-R18 | LOW | Medium | `judge-worker-rs/src/runner.rs:444-452` | `constant_time_eq` length leak in runner (same pattern as C4-NEW-R02) |
| C4-NEW-R19 | LOW | Medium | `rate-limiter-rs/src/main.rs:121-130` | `constant_time_eq` leaks expected token length |
| C4-NEW-R20 | LOW | High | `code-similarity-rs/src/main.rs:96-138` | Error responses always return an empty `pairs` body |
| C4-NEW-R21 | LOW | Medium | `code-similarity-rs/src/main.rs:45-54` | `constant_time_eq` leaks expected token length |
| C4-NEW-R22 | LOW | Medium | `code-similarity-rs/src/similarity.rs:102`, `:221-227`, `:229-265` | Non-ASCII identifiers are not normalized |
| C4-NEW-R23 | LOW | High | `code-similarity-rs/src/main.rs:185-189`, `:232-235` | Host/port parsing silently falls back on invalid input |

### HIGH

#### C4-NEW-R01 — `docker run` child spawned without `kill_on_drop(true)`
- **File:** `judge-worker-rs/src/docker.rs:408-413`
- **Confidence:** High
- **Problem:** `run_docker_once` spawns the `docker run` CLI process without `.kill_on_drop(true)`. In the timeout and error branches the `child` variable is dropped without waiting for or killing the CLI process.
- **Failure scenario:** If `dockerd` is wedged, the `tokio::time::timeout` fires and the code calls `docker kill`/`docker rm -f`. Those calls also time out after 10 s. The original `docker run` CLI process remains alive because `kill_on_drop` is false, so it is reparented and keeps running. Each subsequent timed-out submission spawns another leaked CLI process, eventually exhausting the worker's PID/file-descriptor budget and freezing the hot execution path.
- **Fix:** Add `.kill_on_drop(true)` to the `tokio::process::Command` at line 408 so dropping `child` terminates the CLI process immediately.

#### C4-NEW-R02 — `constant_time_eq` leaks expected token length
- **File:** `judge-worker-rs/src/runner.rs:444-452`
- **Confidence:** High
- **Problem:** The helper claims to perform constant-time comparison, but it returns `false` immediately when `a.len() != b.len()`. Only the loop after the length check is constant-time.
- **Failure scenario:** An attacker on the same internal network who can measure runner `/run` (or admin endpoint) response times can learn the exact length of `RUNNER_AUTH_TOKEN` by submitting bearer tokens of varying lengths and observing which ones take slightly longer. This reduces the brute-force search space for the token.
- **Fix:** Remove the early length check and always run the XOR loop over the full expected length, or replace the hand-rolled comparison with `subtle::ConstantTimeEq`.

#### C4-NEW-R03 — Unbounded poll response body deserialized into memory
- **File:** `judge-worker-rs/src/api.rs:190-194`
- **Confidence:** High
- **Problem:** `ApiClient::poll` calls `response.json::<PollResponse>()` with no body-size cap. `TestCase.input` and `expected_output` are unbounded `String`s.
- **Failure scenario:** A compromised app server (or a bug that stores oversized test data) returns a single submission whose test inputs total hundreds of megabytes. The worker OOMs while deserializing JSON, before the per-field size checks in `executor.rs` ever run. This turns a server-side data corruption into a worker crash/DoS.
- **Fix:** Read the response body as bytes with an explicit maximum length (e.g., `response.bytes().await` plus a `MAX_POLL_BODY_BYTES` check) and deserialize with `serde_json::from_slice` only after the size check passes.

#### C4-NEW-R04 — Integer overflow in block-duration calculation
- **File:** `rate-limiter-rs/src/main.rs:323-325`
- **Confidence:** High
- **Problem:** The block duration is computed as `(req.block_ms * multiplier).min(MAX_BLOCK_MS)`. The multiplication happens before the clamp, so pathological `block_ms` values overflow `u64`.
- **Failure scenario:** A caller/config sets `block_ms` near `u64::MAX / 16`. In release builds the product wraps before `.min()` is applied, producing an arbitrary (often tiny or zero) block duration while the response still says `blocked: true`. In debug builds the worker panics.
- **Fix:** Use saturating arithmetic or validate the input first:
  ```rust
  let block_duration = Duration::from_millis(req.block_ms.saturating_mul(multiplier).min(MAX_BLOCK_MS));
  ```
  Better, reject `block_ms > MAX_BLOCK_MS` (or `> MAX_BLOCK_MS / multiplier`) at the top of `record_failure` with `400 Bad Request`.

#### C4-NEW-R05 — `window_ms = 0` bypasses the rate limit entirely
- **File:** `rate-limiter-rs/src/main.rs:242-245`
- **Confidence:** High
- **Problem:** The window-expiry check `e.window_started_at + Duration::from_millis(req.window_ms) <= now` is always true when `window_ms` is `0`, so `attempts` is reset to `0` on every request.
- **Failure scenario:** A misconfigured caller or malicious request sends `windowMs: 0` with `maxAttempts: 2`. Every `/check` returns `allowed: true` with a fresh attempt counter, completely bypassing rate limiting.
- **Fix:** Reject `window_ms == 0` in both `/check` and `/record-failure` with `StatusCode::BAD_REQUEST`.

#### C4-NEW-R06 — `max_attempts = 0` permanently blocks every key
- **File:** `rate-limiter-rs/src/main.rs:248` and `:322`
- **Confidence:** High
- **Problem:** The threshold checks are `e.attempts >= req.max_attempts`. When `max_attempts` is `0`, every `/check` immediately returns `allowed: false`, and the first `/record-failure` immediately triggers a block.
- **Failure scenario:** A caller typo or bug sends `maxAttempts: 0`. All legitimate traffic for that key is denied with no path to recovery except `/reset`.
- **Fix:** Reject `max_attempts == 0` in both handlers with `StatusCode::BAD_REQUEST`.

#### C4-NEW-R07 — CPU-bound `/compute` work has no timeout or cancellation
- **File:** `code-similarity-rs/src/main.rs:126-140`
- **Confidence:** High
- **Problem:** `tokio::task::spawn_blocking` runs `compute_similarity` without an internal deadline and without cancellation. The TypeScript client aborts after 25 s and falls back to the TS implementation, but the Rust task keeps pinning CPU/memory until it finishes. A body-capped 500-submission payload can take tens of seconds, so repeated requests can exhaust the sidecar.
- **Failure scenario:** A contest with 500 large submissions triggers a `/compute` call. The client times out at 25 s, but the rayon-backed computation continues for another 30 s. A second and third concurrent request pile up and the sidecar becomes unresponsive.
- **Fix:** Wrap the `spawn_blocking` join handle in `tokio::time::timeout` (e.g., 25-30 s) and return `504 GATEWAY_TIMEOUT`. For true cancellation, pass an `AtomicBool` into `compute_similarity` and check it between groups/pairs so rayon can bail out early.

### MEDIUM

#### C4-NEW-R08 — Non-HTTP schemes accepted as "secure" judge URLs
- **File:** `judge-worker-rs/src/config.rs:362-364`
- **Confidence:** High
- **Problem:** `validate_secure_judge_urls_with_override` only enters its security checks for URLs whose scheme is exactly `"http"`. Any other scheme (`file:`, `javascript:`, `ftp:`, `data:`, etc.) is silently accepted.
- **Failure scenario:** An operator misconfigures `JUDGE_BASE_URL=file:///tmp/fake` or `javascript://...`. The function reports success, but `reqwest` later fails or, worse, the scheme reaches code that interprets it. The validation gives a false assurance that the URL is secure.
- **Fix:** Reject any scheme other than `http` or `https`, then apply the existing local/non-local HTTP logic.

#### C4-NEW-R09 — Submission run limit can override operator compile-memory limit
- **File:** `judge-worker-rs/src/executor.rs:453-454`
- **Confidence:** High
- **Problem:** Compile memory is computed as `compilation_memory_limit_mb().max(submission.memory_limit_mb.min(MAX_MEMORY_LIMIT_MB))`. If the operator lowers `JUDGE_COMPILE_MEMORY_MB`, a problem author can still raise compile memory by setting a high `memory_limit_mb`.
- **Failure scenario:** An operator sets `JUDGE_COMPILE_MEMORY_MB=128` to bound compile-phase RAM. A submission with `memory_limit_mb=1024` forces the compile container to run with 1024 MiB, defeating the operator's cap and allowing memory-heavy compile attacks.
- **Fix:** Use `compilation_memory_limit_mb()` directly, or cap it with the submission limit rather than taking the maximum: `submission.memory_limit_mb.min(compilation_memory_limit_mb())`.

#### C4-NEW-R10 — Runner compile timeout has no upper bound
- **File:** `judge-worker-rs/src/runner.rs:907`
- **Confidence:** High
- **Problem:** The runner's compile timeout is `(time_limit_ms.saturating_mul(2)).max(MIN_COMPILE_TIMEOUT_MS)`. There is no clamp to a worker ceiling before the value is passed into the Docker kill timeout.
- **Failure scenario:** A malicious or buggy request sends `time_limit_ms: u64::MAX`. The compile-phase Docker container is told to wait ~584 million years before killing, effectively hanging the runner concurrency slot. This is distinct from the run-phase clamp reported in `CQ4-R04`.
- **Fix:** Clamp the compile timeout to the same ceiling used by the executor (e.g., `compile_timeout_ms_for_submission`) or to a runner-specific maximum, and return `400 Bad Request` for out-of-range inputs.

#### C4-NEW-R11 — `Drop` performs blocking synchronous cleanup
- **File:** `judge-worker-rs/src/workspace.rs:79-117`
- **Confidence:** High
- **Problem:** `SandboxWorkspace::drop` runs synchronous `chown_recursive`, `std::fs::remove_dir_all`, and `cleanup_with_docker` (which calls `Command::output()`). `Drop` cannot await, so these operations block the async runtime task and hold the judge concurrency permit until they finish.
- **Failure scenario:** A submission writes a large artifact tree (e.g., a C++ build with thousands of files) or the temp filesystem is slow. Cleanup blocks the task thread for seconds, preventing other submissions from using that concurrency slot and potentially starving the runtime if several slow cleanups coincide.
- **Fix:** Provide an explicit async `cleanup()` method that runs `chown_recursive`/`remove_dir_all` inside `tokio::task::spawn_blocking`, and call it before dropping the workspace. Keep `Drop` as a best-effort fallback only for panic/unwind paths.

#### C4-NEW-R12 — `block_ms = 0` produces a zero-duration block
- **File:** `rate-limiter-rs/src/main.rs:323-327`
- **Confidence:** High
- **Problem:** When the failure threshold is reached with `block_ms = 0`, the code sets `blocked_until = now + 0` and returns `blocked: true`, but the block expires instantly.
- **Failure scenario:** Callers receive a "blocked" response but can retry immediately, defeating the block semantics and allowing unthrottled brute-force retries.
- **Fix:** Treat `block_ms == 0` as invalid (`400 Bad Request`) or clamp it to a minimum meaningful duration.

#### C4-NEW-R13 — Eviction task is not cancelled during graceful shutdown
- **File:** `rate-limiter-rs/src/main.rs:357-381` and `:510-515`
- **Confidence:** High
- **Problem:** `spawn_eviction_task` creates a detached infinite loop. `shutdown_signal()` drains HTTP connections, but nothing signals the eviction task to stop, and the main function does not await it.
- **Failure scenario:** In environments with a long shutdown timeout (e.g., Kubernetes `terminationGracePeriodSeconds`), the eviction loop continues running after the server has stopped accepting requests. If the process is killed mid-sweep, an in-progress eviction is aborted without completing.
- **Fix:** Pass a `tokio_util::sync::CancellationToken` into `spawn_eviction_task`, cancel it when `shutdown_signal()` fires, and await the task's join handle before exiting.

#### C4-NEW-R14 — Eviction interval uses default `Burst` missed-tick behavior
- **File:** `rate-limiter-rs/src/main.rs:359`
- **Confidence:** High
- **Problem:** `tokio::time::interval` defaults to `MissedTickBehavior::Burst`. If the eviction task is delayed (CPU pressure, GC pauses, lock contention), it fires multiple ticks rapidly to catch up.
- **Failure scenario:** After a stall, the sweeper runs back-to-back, contending on the `DashMap` shards and causing latency spikes for concurrent `/check` and `/record-failure` calls.
- **Fix:** Configure the interval for cleanup-friendly behavior:
  ```rust
  interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
  ```

#### C4-NEW-R15 — Invalid `RATE_LIMITER_HOST` / `RATE_LIMITER_PORT` env values silently fall back
- **File:** `rate-limiter-rs/src/main.rs:434-438` and `:499-502`
- **Confidence:** High
- **Problem:** `port.parse().ok()` silently falls back to `3001` on a bad `RATE_LIMITER_PORT`. The `format!("{host}:{port}").parse()` silently falls back to `127.0.0.1:{port}` on a bad host.
- **Failure scenario:** An operator typo (e.g., `RATE_LIMITER_PORT=3001x`) makes the service bind to the default instead of failing fast. If another service already occupies `3001`, the sidecar crashes later with a confusing "address in use" error, or two services collide on the same port.
- **Fix:** Fail startup with a clear error when an explicitly set env value is invalid:
  ```rust
  let port: u16 = std::env::var("RATE_LIMITER_PORT")
      .ok()
      .map(|p| p.parse().expect("RATE_LIMITER_PORT must be a valid u16"))
      .unwrap_or(3001);
  ```

#### C4-NEW-R16 — Unterminated block comments leak trailing source content
- **File:** `code-similarity-rs/src/similarity.rs:30-39`
- **Confidence:** High
- **Problem:** The block-comment scanner consumes bytes until `*/` or EOF. When `*/` is not found, `i` stops at `len - 1`, the `if i + 1 < len` guard is false, and the outer loop emits the final byte(s) of the file instead of consuming them.
- **Failure scenario:** A malformed submission ending in `/* explanation` keeps the trailing character(s) of the explanation in the normalized text, while a correctly terminated version strips them. Similarity scores for otherwise-identical submissions diverge depending on whether the trailing comment is closed.
- **Fix:** In the unterminated branch set `i = len` (consume to EOF) instead of falling through:
  ```rust
  if i + 1 < len { i += 2; } else { i = len; }
  continue;
  ```
  Also tighten the existing test to assert that `"never closed"` is absent.

#### C4-NEW-R17 — Graceful shutdown waits indefinitely for open connections
- **File:** `code-similarity-rs/src/main.rs:243-246`
- **Confidence:** High
- **Problem:** `axum::serve(...).with_graceful_shutdown(...)` has no hard deadline. A long-running `/compute` request or an idle keep-alive connection can block SIGTERM/SIGINT handling forever.
- **Failure scenario:** During a deploy, the orchestrator sends SIGTERM while a similarity check is running. The process never exits cleanly and is eventually SIGKILLed, preventing clean metrics flush or dependency shutdown.
- **Fix:** Combine the shutdown signal with a hard deadline, e.g.:
  ```rust
  tokio::time::timeout(Duration::from_secs(30), axum::serve(...).with_graceful_shutdown(shutdown_signal()))
      .await
      .ok();
  ```

### LOW

#### C4-NEW-R18 — `constant_time_eq` length leak in runner (same pattern as C4-NEW-R02)
- **File:** `judge-worker-rs/src/runner.rs:444-452`
- **Confidence:** Medium
- **Problem:** Same as C4-NEW-R02, retained here to map the runner finding to the LOW-severity list for completeness.
- **Failure scenario:** See C4-NEW-R02.
- **Fix:** See C4-NEW-R02.

#### C4-NEW-R19 — `constant_time_eq` leaks expected token length
- **File:** `rate-limiter-rs/src/main.rs:121-130`
- **Confidence:** Medium
- **Problem:** The helper returns `false` immediately when the two slices differ in length. This makes the comparison time depend on whether the attacker-supplied token length matches the secret length.
- **Failure scenario:** An attacker on the same network segment can probe token length through timing measurements, reducing the brute-force search space.
- **Fix:** Use the well-vetted `subtle` crate (`subtle::constant_time_eq`), or compare fixed-length hashes of the tokens (e.g., HMAC-SHA256) so length is always known and equal.

#### C4-NEW-R20 — Error responses always return an empty `pairs` body
- **File:** `code-similarity-rs/src/main.rs:96-138`
- **Confidence:** High
- **Problem:** Every error path (413, 400, 500) serializes `ComputeResponse { pairs: Vec::new() }`. The current TypeScript client checks `response.ok` and handles this correctly, but the contract is weak: a future client or test that ignores status cannot distinguish "invalid threshold" from "no similar pairs".
- **Failure scenario:** A monitoring script sees HTTP 400 + `{ pairs: [] }` and logs "0 flagged pairs" instead of "invalid request".
- **Fix:** Return a small structured error body, e.g., `{ error: "too_many_submissions", max: 500 }`, or at least vary the error response type so callers can discriminate without relying solely on status.

#### C4-NEW-R21 — `constant_time_eq` leaks expected token length
- **File:** `code-similarity-rs/src/main.rs:45-54`
- **Confidence:** Medium
- **Problem:** The function returns `false` immediately when the supplied token length differs from the expected token length. The loop itself is constant-time, but the early length comparison is not.
- **Failure scenario:** An attacker on the docker network can measure response times to infer the expected bearer-token length before attempting to brute-force the token.
- **Fix:** Compare fixed-length hashes of the tokens (e.g., HMAC-SHA256) using `subtle::ConstantTimeEq`, or pad/truncate both to a fixed length before comparison.

#### C4-NEW-R22 — Non-ASCII identifiers are not normalized
- **File:** `code-similarity-rs/src/similarity.rs:102`, `:221-227`, `:229-265`
- **Confidence:** Medium
- **Problem:** `normalize_source` indexes raw bytes and casts them to `char`; `is_identifier_start`/`is_identifier_char` accept only ASCII letters and `_`. Valid Unicode identifiers (Rust, Python 3, Korean variable names) are therefore treated as opaque non-identifier tokens and never replaced with placeholders.
- **Failure scenario:** Two structurally-identical Python submissions that use Korean variable names are scored lower than two equivalent submissions using English names, because the English identifiers are normalized to `v1`, `v2`, … while the Korean identifiers are compared literally.
- **Fix:** Either document the ASCII-only normalization assumption, or switch identifier detection to Unicode identifier rules (e.g., `unicode-ident`/`unicode-xid`) and operate on `char`s instead of raw bytes.

#### C4-NEW-R23 — Host/port parsing silently falls back on invalid input
- **File:** `code-similarity-rs/src/main.rs:185-189`, `:232-235`
- **Confidence:** High
- **Problem:** Invalid `CODE_SIMILARITY_PORT` is silently replaced with `3002`, and an invalid `host:port` combination is silently replaced with `127.0.0.1:{port}`. No error is logged.
- **Failure scenario:** A typo like `CODE_SIMILARITY_PORT=3002x` causes the service to bind on the default port instead of failing fast, making config drift hard to diagnose.
- **Fix:** Parse the port with `parse::<u16>()` and `expect`/`unwrap_or_else` with a clear error and `process::exit(1)`. Parse `SocketAddr` from the combined string and fail on error rather than falling back.

---

---

## Supplemental Admin API Routes Findings

A focused pass over all routes under `src/app/api/v1/admin/` uncovered the following additional issues. These are distinct from the findings already recorded above unless a new angle is described.

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-A01 | HIGH | High | `src/lib/db/export-with-files.ts:208-296` (called from `src/app/api/v1/admin/backup/route.ts:89-97`) | Backup/export materializes entire database and all uploads in memory |
| C4-NEW-A02 | HIGH | High | `src/app/api/v1/admin/settings/route.ts:87-99`, `:115-168` | REST settings PUT silently drops many schema-validated fields |
| C4-NEW-A03 | MEDIUM | High | `src/lib/db/export-with-files.ts:141-159` (called from `src/app/api/v1/admin/restore/route.ts:95`) | Restore ZIP size enforcement trusts forged local-file-header metadata |
| C4-NEW-A04 | MEDIUM | High | `src/lib/db/export-with-files.ts:398-438` (called from `src/app/api/v1/admin/restore/route.ts:186-220`) | Restore file-write phase is non-atomic and only verifies existence |
| C4-NEW-A05 | MEDIUM | High | `src/lib/db/export.ts:314-373`; `src/lib/db/import.ts:215-225` | Import/restore/validate trust exports whose row lengths do not match column lists |
| C4-NEW-A06 | MEDIUM | High | `src/app/api/v1/admin/migrate/import/route.ts:149-274` | Deprecated JSON-body import path embeds admin password in request body |
| C4-NEW-A07 | MEDIUM | High | `src/app/api/v1/admin/submissions/export/route.ts:45-50` | Submissions export endpoint has no rate limit |
| C4-NEW-A08 | MEDIUM | Medium | `src/app/api/v1/admin/restore/route.ts:249-251`; `src/app/api/v1/admin/migrate/import/route.ts:275-277` | Failed restore/import attempts are not durably audited |
| C4-NEW-A09 | MEDIUM | High | `src/app/api/v1/admin/tags/[id]/route.ts:28-32` | Tag update does not guard duplicate names |
| C4-NEW-A10 | MEDIUM | High | `src/app/api/v1/admin/tags/route.ts:41-48` | Tag creation does not pre-validate unique names |
| C4-NEW-A11 | MEDIUM | High | `src/app/api/v1/admin/plugins/[id]/route.ts:53-78` | Plugin config update has a read-modify-write race |
| C4-NEW-A12 | MEDIUM | High | `src/app/api/v1/admin/workers/[id]/route.ts:86-98` | Workers force-remove resets active `judging` submissions to `pending` |
| C4-NEW-A13 | MEDIUM | High | Multiple admin mutation routes | Security-critical admin mutations use buffered audit events |
| C4-NEW-A14 | MEDIUM | High | `src/app/api/v1/admin/backup/route.ts:76-87`; `src/app/api/v1/admin/migrate/export/route.ts:73-82` | Backup/migrate-export audit events recorded before transfer completes |
| C4-NEW-A15 | MEDIUM | High | `src/app/api/v1/admin/docker/images/prune/route.ts:34-61` | Unbounded concurrency in stale-image prune check |
| C4-NEW-A16 | MEDIUM | High | `src/app/api/v1/admin/languages/[language]/route.ts:48-58` | PATCH language stores untrimmed `dockerImage`, `runCommand`, `compileCommand`, `dockerfile` |
| C4-NEW-A17 | MEDIUM | High | `src/app/api/v1/admin/languages/[language]/route.ts:60-87` | PATCH language update-then-select race can return `{data: null}` |
| C4-NEW-A18 | MEDIUM | High | `src/app/api/v1/admin/languages/route.ts:74-89` | POST language allows whitespace-only required fields to be stored as empty strings |
| C4-NEW-A19 | LOW | High | `src/app/api/v1/admin/settings/route.ts:198-218` | Settings audit details omit `smtpPass` changes |
| C4-NEW-A20 | LOW | Medium | `src/app/api/v1/admin/settings/route.ts:23-29`, `:36-41`, `:222-227` | Settings GET mutates the database row in place when redacting secrets |
| C4-NEW-A21 | LOW | Medium | `src/app/api/v1/admin/migrate/validate/route.ts:10-91` | Migrate-validate endpoint has no rate limit |
| C4-NEW-A22 | LOW | High | `src/app/api/v1/admin/settings/route.ts:91`, `:94` | Duplicate `sessionMaxAgeSeconds` in `allowedConfigKeys` |
| C4-NEW-A23 | LOW | High | `src/app/api/v1/admin/test-email/route.ts:18-19`, `:28-32` | Test-email endpoint returns non-standard error bodies |
| C4-NEW-A24 | LOW | High | `src/app/api/v1/admin/chat-logs/route.ts:12-15` | Chat-logs route relies on default auth plus manual capability check |
| C4-NEW-A25 | LOW | High | `src/app/api/v1/admin/docker/images/prune/route.ts:53` | Prune stale check silently skips images when `info.Created` is not a valid date |
| C4-NEW-A26 | LOW | High | `src/app/api/v1/admin/docker/images/prune/route.ts:31-61` and `src/app/api/v1/admin/docker/images/route.ts:21-53` | Stale-image detection logic is duplicated between GET and POST prune |

### HIGH

#### C4-NEW-A01 — Backup/export materializes entire database and all uploads in memory
- **File:** `src/lib/db/export-with-files.ts:208-296` (called from `src/app/api/v1/admin/backup/route.ts:89-97`)
- **Confidence:** High
- **Problem:** `streamBackupWithFiles` accumulates the whole streamed DB export into `dbChunks`, `JSON.parse`s it, reads every uploaded file into a `Buffer`, builds a complete JSZip object, then calls `zip.generateAsync({ type: "uint8array" })` to create one giant `Uint8Array` before returning a `ReadableStream` that simply enqueues the blob.
- **Failure scenario:** On a production instance with hundreds of megabytes of uploads, `POST /api/v1/admin/backup?includeFiles=true` allocates well over the backup size before streaming a byte, causing the Next.js worker to OOM and crash the app server.
- **Fix:** Stream the ZIP to the response incrementally. Use JSZip’s `generateInternalStream`/`StreamHelper` or switch to `archiver`/`node-stream-zip` so each file is piped into the response as it is read, without accumulating DB export text or file buffers in memory.

#### C4-NEW-A02 — REST settings PUT silently drops many schema-validated fields
- **File:** `src/app/api/v1/admin/settings/route.ts:87-99`, `:115-168`
- **Confidence:** High
- **Problem:** After Zod validation, the route filters `restConfig` against `allowedConfigKeys`, which omits `homePageContent`, `footerContent`, `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`, `smtpFrom`, `defaultLocale`, `communityUpvoteEnabled`, and `communityDownvoteEnabled`. The route also has no explicit `hasOwnInput` writes for these fields. They are accepted by `systemSettingsSchema` but never persisted.
- **Failure scenario:** An admin automation `PUT`s `{ smtpHost: "smtp.example.com", smtpPort: 587 }` to `/api/v1/admin/settings`. The endpoint returns 200, but mail settings remain unchanged and outbound email continues to fail. The same call through the server action works, so the two writers diverge.
- **Fix:** Add the missing keys to `allowedConfigKeys` (or, better, mirror the server action and write each validated field with an explicit `hasOwnInput` guard) and include them in the audit `details`.

### MEDIUM

#### C4-NEW-A03 — Restore ZIP size enforcement trusts forged local-file-header metadata
- **File:** `src/lib/db/export-with-files.ts:141-159` (called from `src/app/api/v1/admin/restore/route.ts:95`)
- **Confidence:** High
- **Problem:** `enforceBackupZipSizeLimits` takes the fast path when `entry._data.uncompressedSize` is present. ZIP local file headers are attacker-controlled, so a crafted backup can claim tiny per-entry sizes while actually decompressing to gigabytes. This is the same class of flaw as `C4-NEW-01`, now reachable through the restore/import ZIP path.
- **Failure scenario:** An attacker uploads a 90 MB `.zip` whose metadata claims 1 byte per entry. The route accepts it, then `dbEntry.async("text")` and `streamEntryToStaging` materialize multi-gigabyte content, exhausting disk or memory.
- **Fix:** Remove the metadata fast path (or gate it on a non-forgeable check) and always run the streaming size measurement before extracting any entry.

#### C4-NEW-A04 — Restore file-write phase is non-atomic and only verifies existence
- **File:** `src/lib/db/export-with-files.ts:398-438` (called from `src/app/api/v1/admin/restore/route.ts:186-220`)
- **Confidence:** High
- **Problem:** `restoreParsedBackupFiles` calls `writeUploadedFile(storedName, buffer)`, which overwrites the target file directly with `node:fs/promises.writeFile`. If the process crashes mid-write, a truncated file remains. The post-write check only confirms the file exists, not that its contents or checksum match the manifest.
- **Failure scenario:** A crash during restore leaves a 20 MB truncated upload where the manifest promised 100 MB. The DB transaction has already committed, so the API returns success and later file reads return corrupt data.
- **Fix:** Write to a temp file next to the target, `fsync`, then `rename` atomically. Re-compute and compare the sha256 after the rename against the manifest before returning success.

#### C4-NEW-A05 — Import/restore/validate trust exports whose row lengths do not match column lists
- **File:** `src/lib/db/export.ts:314-373` (`validateExport`); `src/lib/db/import.ts:215-225`
- **Confidence:** High
- **Problem:** `validateExport` checks `rowCount === rows.length` but never verifies that each `row.length === columns.length`. `importDatabase` maps values positionally, so a short row inserts `undefined` and a long row silently drops trailing values.
- **Failure scenario:** A malformed `users` export has columns `[id, username, email]` but rows with only `[id, username]`. Every imported user is created with `email: undefined` (persisted as `null`) without raising an error.
- **Fix:** In `validateExport`, iterate each table’s rows and return an error like `${tableName}: row ${i} length (${row.length}) does not match columns (${columns.length})` when they differ.

#### C4-NEW-A06 — Deprecated JSON-body import path embeds admin password in request body
- **File:** `src/app/api/v1/admin/migrate/import/route.ts:149-274`
- **Confidence:** High
- **Problem:** When `ALLOW_JSON_IMPORT_PASSWORD=1`, the route accepts `{ password, data }` and verifies `password` from the parsed JSON body. Passwords in JSON bodies can be logged by reverse proxies, request-logging middleware, or audit systems that do not redact arbitrary nested `password` fields.
- **Failure scenario:** An operator enables the flag for a migration script. A load-balancer/request logger captures the full request body and now contains the admin password in plaintext.
- **Fix:** Remove the JSON-body path at the documented sunset date, or require the password from a header (e.g., `X-Import-Password`) which existing logging redaction already covers.

#### C4-NEW-A07 — Submissions export endpoint has no rate limit
- **File:** `src/app/api/v1/admin/submissions/export/route.ts:45-50`
- **Confidence:** High
- **Problem:** `createApiHandler` is configured without `rateLimit`. The handler runs a query with up to four left joins and returns up to 10,000 rows per request.
- **Failure scenario:** A compromised admin session or misbehaving integration calls the endpoint in a tight loop, saturating the DB connection pool and causing cascading latency for other requests.
- **Fix:** Add `rateLimit: "admin:submissions-export"` (or similar) with a conservative limit such as 10 requests per minute.

#### C4-NEW-A08 — Failed restore/import attempts are not durably audited
- **File:** `src/app/api/v1/admin/restore/route.ts:249-251`; `src/app/api/v1/admin/migrate/import/route.ts:275-277`
- **Confidence:** Medium
- **Problem:** The top-level `catch` blocks log the error and return a 500, but they do not write a durable audit event. Destructive import attempts that fail validation or rollback are visible only in server logs.
- **Failure scenario:** An attacker with a stolen admin session repeatedly attempts to overwrite the database. Each attempt is rate-limited and fails, but the security team cannot find a durable audit trail of the attempts.
- **Fix:** Add `recordAuditEventDurable` in the `catch` path with a `system_settings.database_restore_failed` / `data_import_failed` action and truncated details before returning the error.

#### C4-NEW-A09 — Tag update does not guard duplicate names
- **File:** `src/app/api/v1/admin/tags/[id]/route.ts:28-32`
- **Confidence:** High
- **Problem:** `PATCH` builds the update payload and executes `db.update(tags)` without checking whether `body.name` already belongs to another tag. The `tags.name` column has a unique constraint, so a duplicate rename causes a PostgreSQL unique-violation error that `createApiHandler` returns as a generic 500.
- **Failure scenario:** An admin renames tag A to the same name as tag B. The UI shows an internal server error instead of a clear "name already exists" conflict.
- **Fix:** Query for an existing tag with the target name (excluding the current `params.id`) before updating and return `apiError("tagNameExists", 409)` when found.

#### C4-NEW-A10 — Tag creation does not pre-validate unique names
- **File:** `src/app/api/v1/admin/tags/route.ts:41-48`
- **Confidence:** High
- **Problem:** `POST` inserts a new tag without first checking for a duplicate name. A client sending a duplicate name hits the unique constraint and receives a 500 instead of a 409.
- **Failure scenario:** An admin creates a tag that already exists; the route throws an unhandled DB error.
- **Fix:** Check `db.select({ id: tags.id }).from(tags).where(eq(tags.name, body.name))` before insert and return `apiError("tagNameExists", 409)` when a row exists.

#### C4-NEW-A11 — Plugin config update has a read-modify-write race
- **File:** `src/app/api/v1/admin/plugins/[id]/route.ts:53-78`
- **Confidence:** High
- **Problem:** The handler reads the existing plugin row, calls `preparePluginConfigForStorage` with the existing config, and then performs an upsert. All of this happens outside a transaction and without row locking. Two concurrent PATCH requests to the same plugin read the same base config; the later write can overwrite the earlier one, and secret-preservation semantics may clear a secret that the other request intended to keep.
- **Failure scenario:** Admin A and admin B edit different fields of the same plugin concurrently. Admin A saves first, then admin B's request (based on stale existing config) overwrites admin A's change.
- **Fix:** Wrap the `select` + `preparePluginConfigForStorage` + `insert ... onConflictDoUpdate` in `execTransaction` and lock the row with `.for("update")`.

#### C4-NEW-A12 — Workers force-remove resets active `judging` submissions to `pending`
- **File:** `src/app/api/v1/admin/workers/[id]/route.ts:86-98`
- **Confidence:** High
- **Problem:** The `DELETE` handler resets every submission assigned to the worker whose status is `queued` or `judging` back to `pending`. If the worker is still alive and actively judging a submission, that submission will be picked up by another worker and judged twice.
- **Failure scenario:** An admin force-removes a worker that is temporarily slow to heartbeat. A submission that is mid-judgment is returned to `pending` and re-claimed by a second worker, producing duplicate results.
- **Fix:** Split the statuses: reset only `queued` submissions to `pending`. For `judging` submissions, either set them to `internal_error` or require the worker to be `offline`/`stale` before the force-remove is accepted.

#### C4-NEW-A13 — Security-critical admin mutations use buffered audit events
- **Files/lines:** `src/app/api/v1/admin/api-keys/route.ts:95-105` (create), `src/app/api/v1/admin/api-keys/[id]/route.ts:94-104` (update), `:127-136` (delete), `src/app/api/v1/admin/plugins/[id]/route.ts:81-94` (config update), `:109-119` (toggle), `src/app/api/v1/admin/tags/route.ts:50-60` (create), `src/app/api/v1/admin/tags/[id]/route.ts:40-50` (update), `:69-79` (delete), `src/app/api/v1/admin/workers/[id]/route.ts:109-118` (force-remove), `src/app/api/v1/admin/chat-logs/route.ts:37-47` (transcript view), `:120-132` (list view)
- **Confidence:** High
- **Problem:** These handlers call `recordAuditEvent` (fire-and-forget, batched) for security-critical actions. The in-memory buffer can lose up to five seconds of events on a hard crash or OOM. The codebase already has `recordAuditEventDurable` for exactly this class of action, but these routes do not use it.
- **Failure scenario:** A malicious or compromised admin creates an API key or views a chat transcript; the audit trail entry is lost if the app process crashes before the next flush.
- **Fix:** Replace `recordAuditEvent(...)` with `await recordAuditEventDurable(...)` for all of the calls above.

#### C4-NEW-A14 — Backup/migrate-export audit events recorded before transfer completes
- **File:** `src/app/api/v1/admin/backup/route.ts:76-87` and `src/app/api/v1/admin/migrate/export/route.ts:73-82`
- **Confidence:** High
- **Problem:** Both routes call the buffered `recordAuditEvent` immediately before returning the streaming `Response`. If the client aborts or the worker OOMs/crashes during the stream, the audit row either never flushes or records a successful download/export that never completed.
- **Failure scenario:** A compliance check shows `system_settings.backup_downloaded`, but the actual backup stream failed halfway through because the client disconnected; there is no durable failure or partial-transfer record.
- **Fix:** Use `recordAuditEventDurable` and emit it from the stream’s `close`/`error` handlers, or wrap the stream so a durable completion/failure audit is written only after the response finishes.

#### C4-NEW-A15 — Unbounded concurrency in stale-image prune check
- **File:** `src/app/api/v1/admin/docker/images/prune/route.ts:34-61`
- **Confidence:** High
- **Problem:** The `POST /prune` handler maps every returned judge image into a concurrent `stat` + `inspectDockerImage` pair via `Promise.all(images.map(...))`. There is no `pLimit` cap, while the sibling `GET /admin/docker/images` route uses `pLimit(5)` for the identical stale-detection logic.
- **Failure scenario:** On a host with many judge images (or after a bulk build), the route spawns tens to hundreds of concurrent `docker inspect` processes/socket calls, exhausting file descriptors or the Docker socket and causing the admin prune request itself (and concurrent Docker operations) to fail or time out.
- **Fix:** Reuse the `getStaleImages` helper from `src/app/api/v1/admin/docker/images/route.ts` (which already uses `pLimit(5)`), or add `pLimit(5)` to the prune handler before mapping over `images`.

#### C4-NEW-A16 — PATCH language stores untrimmed string fields
- **File:** `src/app/api/v1/admin/languages/[language]/route.ts:48-58`
- **Confidence:** High
- **Problem:** The `dockerImage` validator calls `.trim()`, but the stored value is `body.dockerImage` verbatim. The other string fields are stored verbatim without any trim. This is inconsistent with `POST /admin/languages`, which trims every stored string.
- **Failure scenario:** An admin PATCHes `dockerImage: "  judge-python:latest  "`. The allowlist check passes because it trims, but the database stores the value with surrounding spaces. The worker later pulls/runs `"  judge-python:latest  "`, which fails. Similarly, whitespace-only `runCommand`/`compileCommand` values pass the `min(1)` check but are stored as whitespace and later fail when executed.
- **Fix:** Trim before storing, mirroring the POST handler:
  ```ts
  if (body.dockerImage !== undefined) updateValues.dockerImage = body.dockerImage.trim();
  if (body.compileCommand !== undefined) updateValues.compileCommand = body.compileCommand?.trim() || null;
  if (body.runCommand !== undefined) updateValues.runCommand = body.runCommand.trim();
  if (body.dockerfile !== undefined) updateValues.dockerfile = body.dockerfile?.trim() || null;
  ```

#### C4-NEW-A17 — PATCH language update-then-select race can return `{data: null}`
- **File:** `src/app/api/v1/admin/languages/[language]/route.ts:60-87`
- **Confidence:** High
- **Problem:** After updating the row, the route re-selects it and returns `apiSuccess(updated)`. If the language row is deleted between the existence check/update and the re-select (e.g., by a concurrent admin delete), `updated` is `undefined` and the route returns HTTP 200 with `{data: null}`.
- **Failure scenario:** Two admins edit languages concurrently; one deletes the language just as another saves a PATCH. The PATCH caller receives a 200 with null data and may treat it as a successful update rather than a missing resource.
- **Fix:** Guard the re-select result and return a 404 when the row no longer exists:
  ```ts
  if (!updated) return notFound("language");
  return apiSuccess(updated);
  ```

#### C4-NEW-A18 — POST language allows whitespace-only required fields to be stored as empty strings
- **File:** `src/app/api/v1/admin/languages/route.ts:74-89`
- **Confidence:** High
- **Problem:** `displayName`, `extension`, and `runCommand` are required (`min(1)`), but the schema does not reject strings that are only whitespace. The handler then trims them and stores empty strings.
- **Failure scenario:** An admin client accidentally sends `"   "` for `displayName` or `extension`. The request succeeds (201) and creates a language with empty display/extension names, breaking UI lists and file-extension handling.
- **Fix:** Add a `.refine()` (or trim + revalidate) to required string fields in `addLanguageSchema` so that whitespace-only values are rejected with a clear validation error:
  ```ts
  displayName: z.string().min(1).max(100).refine((s) => s.trim().length > 0, "required"),
  extension: z.string().min(1).max(20).refine((s) => s.trim().length > 0, "required"),
  runCommand: z.string().min(1).max(500).refine((s) => s.trim().length > 0, "required"),
  ```

### LOW

#### C4-NEW-A19 — Settings audit details omit `smtpPass` changes
- **File:** `src/app/api/v1/admin/settings/route.ts:198-218`
- **Confidence:** High
- **Problem:** The audit `details` object redacts and includes `hcaptchaSecret` but does not include `smtpPass`, even though the route encrypts and stores it. The twin server action audits both secret keys redacted.
- **Failure scenario:** An admin updates `smtpPass` via the REST API; the audit row does not reflect that a secret credential was changed, making incident response harder.
- **Fix:** Add `...(hasOwnInput("smtpPass") ? { smtpPass: typeof smtpPass === "string" && smtpPass.length > 0 ? "••••••••" : null } : {})` to the audit details.

#### C4-NEW-A20 — Settings GET mutates the database row in place when redacting secrets
- **File:** `src/app/api/v1/admin/settings/route.ts:23-29`, `:36-41`, `:222-227`
- **Confidence:** Medium
- **Problem:** `redactSecretSettings` assigns redacted values directly into the object returned by `getSystemSettings`. If Drizzle or a future cache ever returns a shared object reference, concurrent requests could see redacted values instead of real secrets.
- **Failure scenario:** A future optimization caches the settings row; a GET request redacts the cached object, and a subsequent PUT/usage reads the redacted value instead of the real secret.
- **Fix:** Clone the settings object before redacting (e.g., `const response = { ...settings }; redactSecretSettings(response);`).

#### C4-NEW-A21 — Migrate-validate endpoint has no rate limit
- **File:** `src/app/api/v1/admin/migrate/validate/route.ts:10-91`
- **Confidence:** Medium
- **Problem:** The route accepts up to a 100 MB upload and runs `validateExport`, which iterates every table in the export. It does not call `consumeApiRateLimit`.
- **Failure scenario:** An authenticated client repeatedly POSTs large exports for validation, consuming CPU and memory.
- **Fix:** Add `await consumeApiRateLimit(request, "admin:migrate-validate")` near the other admin gates.

#### C4-NEW-A22 — Duplicate `sessionMaxAgeSeconds` in `allowedConfigKeys`
- **File:** `src/app/api/v1/admin/settings/route.ts:91`, `:94`
- **Confidence:** High
- **Problem:** The key `sessionMaxAgeSeconds` appears twice in the `allowedConfigKeys` array. It is harmless today but signals list drift and could mask future duplicates.
- **Failure scenario:** None functional; maintenance/confusion risk.
- **Fix:** Remove the duplicate entry.

#### C4-NEW-A23 — Test-email endpoint returns non-standard error bodies
- **File:** `src/app/api/v1/admin/test-email/route.ts:18-19`, `:28-32`
- **Confidence:** High
- **Problem:** The handler returns `NextResponse.json({ error: "emailNotConfigured" }, { status: 503 })` and `NextResponse.json({ error: "sendFailed", detail: ... }, { status: 500 })` directly. These bodies omit the `requestId` field and the structured `error`/`message` taxonomy that `apiError`/`buildErrorBody` provide elsewhere.
- **Failure scenario:** A client or test expecting the standard `{ error, requestId }` shape receives a different payload and cannot correlate the failure with request logs.
- **Fix:** Use `apiError("emailNotConfigured", 503)` and `apiError("sendFailed", 500, result.error)` instead of raw `NextResponse.json`.

#### C4-NEW-A24 — Chat-logs route relies on default auth plus manual capability check
- **File:** `src/app/api/v1/admin/chat-logs/route.ts:12-15`
- **Confidence:** High
- **Problem:** `createApiHandler` is invoked without an `auth` config, so it defaults to requiring any authenticated user. The route then manually enforces `system.chat_logs`. The enforcement is correct, but the pattern is inconsistent with every other admin route and makes the intended capability gate easy to miss during refactoring.
- **Failure scenario:** A future change removes or weakens the manual `resolveCapabilities` check while leaving the default `auth: true`, silently widening access.
- **Fix:** Add `auth: { capabilities: ["system.chat_logs"] }` to `createApiHandler` and remove the manual `forbidden()` gate (or keep it as defense-in-depth).

#### C4-NEW-A25 — Prune stale check silently skips images when `info.Created` is not a valid date
- **File:** `src/app/api/v1/admin/docker/images/prune/route.ts:53`
- **Confidence:** High
- **Problem:** The prune route casts `info.Created` to string and constructs a `Date` without validating the result. If `info.Created` is missing, malformed, or returns an unexpected object, `new Date(...).getTime()` returns `NaN`, and `fileStat.mtimeMs > NaN` is always false, so the image is never pruned.
- **Failure scenario:** A future Docker version or the remote worker returns `Created` as a numeric timestamp or omits it. The prune request reports success with zero stale images while the images are actually stale.
- **Fix:** Copy the NaN guard from the `GET /admin/docker/images` handler (`route.ts:37-40`):
  ```ts
  const imageCreated = new Date(info.Created as string).getTime();
  if (Number.isNaN(imageCreated)) return;
  ```

#### C4-NEW-A26 — Stale-image detection logic is duplicated between GET and POST prune
- **File:** `src/app/api/v1/admin/docker/images/prune/route.ts:31-61` and `src/app/api/v1/admin/docker/images/route.ts:21-53`
- **Confidence:** High
- **Problem:** The same Dockerfile-mtime vs image-Created comparison appears in both handlers. The GET version is better (has NaN guard and concurrency limit); the prune version is a partially hardened copy.
- **Failure scenario:** Future fixes (e.g., handling missing Dockerfile, NaN dates, concurrency limits) are applied to one copy but not the other, reintroducing bugs.
- **Fix:** Export `getStaleImages` from `src/app/api/v1/admin/docker/images/route.ts` and call it from `prune/route.ts`, or move the helper into `src/lib/docker/client.ts`.

---

## Prioritized Recommendations

1. **Fix the ZIP metadata bypass** (`C4-NEW-01`) before any production restore/import or file-upload path is considered safe.
2. **Stream backup/export to avoid OOM** (`C4-NEW-A01`) so large backups do not crash the app server.
3. **Fix the REST settings writer** (`C4-NEW-A02`) so schema-validated fields such as SMTP and locale settings are actually persisted.
4. **Fix the stored-name regex** (`C4-NEW-02`) to prevent intermittent upload failures and orphaned DB rows.
5. **Validate cursor timestamps** (`C4-NEW-03`) to eliminate a 500 surface on a paginated endpoint.
6. **Fix rate-limiter configuration edge cases** (`C4-NEW-R04`, `C4-NEW-R05`, `C4-NEW-R06`, `C4-NEW-R12`) so `window_ms=0`, `max_attempts=0`, and block-duration overflow cannot bypass or permanently enforce blocking.
7. **Bound the code-similarity CPU request** (`C4-NEW-R07`) with a server-side timeout and cooperative cancellation so client aborts do not leave long-running rayon work behind.
8. **Fix the runner-auth opt-out** (`CQ4-A01`) so `RUNNER_AUTH_DISABLED=1` actually enables unauthenticated runner calls.
9. **Add timeouts and graceful shutdown to the Rust runner** (`CQ4-R01`, `CQ4-R02`, `CQ4-R03`, `CQ4-R04`) to prevent hung Docker commands from wedging workers.
10. **Harden the three new Rust worker HIGH findings** (`C4-NEW-R01`, `C4-NEW-R02`, `C4-NEW-R03`) for leaked CLI processes, timing-side-channel auth, and unbounded poll bodies.
11. **Fix the admin MEDIUM correctness issues** (`C4-NEW-A03`–`A08`, `C4-NEW-A09`–`A18`) covering restore/import trust/atomicity, rate-limit gaps, tag/plugin/worker/language races and validation, and durable audit logging.
12. **Fix the UI HIGH-severity correctness bugs** (`CQ4-U01`, `CQ4-U02`, `CQ4-U03`, `CQ4-U04`, `CQ4-U05`, `CQ4-U21`, `CQ4-U36`, `CQ4-U39`) before release.
13. **Systematically eliminate `setState`-after-unmount leaks** (`CQ4-U06`–`U13`, `CQ4-U15`, `CQ4-U16`, `CQ4-U31`, `CQ4-U58`, `CQ4-U62`) by introducing a reusable `useMounted` hook and applying it consistently.
14. **Harden deployment/infrastructure HIGH findings** (`CQ4-D01`–`CQ4-D05`) to prevent docs-induced operational errors, silent build failures, supply-chain drift, and non-fatal architecture mismatches.
15. **Tighten API, admin, and Rust boundary-layer validation** (`CQ4-A02`, `CQ4-A04`, `CQ4-A06`, `C4-NEW-04`, `C4-NEW-05`, `C4-NEW-08`, `C4-NEW-R08`, `C4-NEW-R09`, `C4-NEW-R10`, `C4-NEW-R11`, `C4-NEW-A19`–`A26`) and fix the stale cache comment (`CQ4-A07`).
16. **Address the still-open prior findings** (`createApiHandler` error taxonomy, global SSE advisory lock, per-mutation CSRF DB read, malformed integer parsing) in the next planning cycle.

---

## Positive Observations

- The Cycle 3 remediation passes are real: boolean import, `/files` rate limiting, `AUTH_TRUST_HOST`, judge IP allowlist, workspace cleanup, and restore/import path leakage are all resolved or fail-closed in the current tree.
- `createApiHandler` enforces capability checks, CSRF, audit logging, and request IDs consistently across API routes.
- The Rust worker has strong panic isolation, monotonic-clock rate limiting, fail-closed sidecar auth, and regression tests for sandbox cleanup.
- `deploy-docker.sh` honors the app-server/worker-server split, avoids `docker system prune --volumes`, segments compose networks, and uses digest-pinned `docker-socket-proxy` in production.
- TypeScript and all Rust test suites pass cleanly.

---

*End of Cycle 4 code-quality review.*
