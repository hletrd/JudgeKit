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

---

## Supplemental App-Server API Routes Findings

A final focused pass over the remaining non-admin route files under `src/app/api/` uncovered the following additional issues. These are distinct from the findings already recorded above unless a new failure mode is described.

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-API-01 | HIGH | High | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:119-128`, `:216-234` | Active-contest problem-change guard is non-atomic with update |
| C4-NEW-API-02 | HIGH | High | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:101-121` | Score override upsert races and can throw 500 on unique constraint |
| C4-NEW-API-03 | HIGH | High | `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:38` | Recruiting invitation creation uses wrong rate-limit bucket (`api-keys:create`) |
| C4-NEW-API-04 | HIGH | High | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:50-53` | Anti-cheat POST bypasses enrollment/access check when anti-cheat is disabled |
| C4-NEW-API-05 | HIGH | High | `src/app/api/v1/judge/deregister/route.ts:73-95` | Self-service deregister resets active `judging` submissions to `pending` |
| C4-NEW-API-06 | HIGH | High | `src/app/api/v1/plugins/chat-widget/chat/route.ts:386-520` | Chat route does not propagate client disconnect / AbortSignal to LLM calls |
| C4-NEW-API-07 | MEDIUM | High | Multiple user/group/assignment/member routes (see detail) | Security-critical mutations use buffered `recordAuditEvent` |
| C4-NEW-API-08 | MEDIUM | High | Multiple GET/export/list routes (see detail) | No rate limits on read/export endpoints |
| C4-NEW-API-09 | MEDIUM | High | `src/app/api/v1/users/[id]/route.ts:26-27`, `:41-54`, `:56-71` | Route schema allows `null` for `email`/`className` but inner validation rejects it |
| C4-NEW-API-10 | MEDIUM | Medium | `src/app/api/v1/groups/[id]/route.ts:166-188` | PATCH returns HTTP 200 with `{data: null}` if group is deleted concurrently |
| C4-NEW-API-11 | MEDIUM | Medium | `src/app/api/v1/groups/[id]/members/bulk/route.ts:52-55`, `:124` | Skipped-count math double-counts overlapping `userIds`/`usernames` |
| C4-NEW-API-12 | MEDIUM | High | `src/app/api/v1/problems/import/route.ts:37-42` | Import route drops explicit `sortOrder` from test cases |
| C4-NEW-API-13 | MEDIUM | High | `src/app/api/v1/problems/import/route.ts:8-47` | Import route creates problems without an audit event |
| C4-NEW-API-14 | MEDIUM | High | `src/app/api/v1/submissions/[id]/events/route.ts:353-357` | SSE `close()` releases coordination slot without catching rejection |
| C4-NEW-API-15 | MEDIUM | High | `src/app/api/v1/problems/[id]/route.ts:266-278`, `src/app/api/v1/submissions/[id]/rejudge/route.ts:116-133`, `src/app/api/v1/submissions/[id]/comments/route.ts:91-104` | Destructive/relevant mutations use buffered `recordAuditEvent` |
| C4-NEW-API-16 | MEDIUM | High | Multiple recruiting-invitation routes (see detail) | Security-critical recruiting invitation mutations use buffered audit events |
| C4-NEW-API-17 | MEDIUM | High | `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:121`; `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:134` | Recruiting invitation emails dispatched without rejection handling |
| C4-NEW-API-18 | MEDIUM | High | Multiple community routes (see detail) | Moderation-critical community mutations use buffered audit events |
| C4-NEW-API-19 | MEDIUM | High | `src/app/api/v1/contests/quick-create/route.ts:120-130` | Contest quick-create uses buffered audit event |
| C4-NEW-API-20 | MEDIUM | High | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:274` | `eventTypeFilter` query param passed unvalidated to Drizzle enum column |
| C4-NEW-API-21 | MEDIUM | High | `src/app/api/v1/contests/quick-create/route.ts:108-117` | Quick-create allows duplicate `problemIds`, causing unhandled unique-constraint 500 |
| C4-NEW-API-22 | MEDIUM | High | Multiple recruiting-invitation sub-routes (see detail) | Recruiting invitation sub-routes lack rate limits |
| C4-NEW-API-23 | MEDIUM | High | `src/app/api/v1/files/bulk-delete/route.ts:28-39` | Bulk delete reports success while disk artifacts may remain orphaned |
| C4-NEW-API-24 | MEDIUM | High | `src/app/api/v1/files/route.ts:41` | File upload materializes the entire upload in memory |
| C4-NEW-API-25 | MEDIUM | High | `src/app/api/v1/plugins/chat-widget/chat/route.ts:73`, `:386-520` | No ceiling on chat `maxTokens` configuration |
| C4-NEW-API-26 | LOW | Medium | `src/app/api/v1/auth/forgot-password/route.ts`, `reset-password/route.ts`, `verify-email/route.ts`, `src/app/api/v1/groups/[id]/assignments/route.ts` | Manual handlers bypass `createApiHandler` standard error/request-ID contract |
| C4-NEW-API-27 | LOW | Low | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:54-58` | Assignment detail GET mutates typed response object to strip secret fields |
| C4-NEW-API-28 | LOW | High | `src/app/api/v1/problems/[id]/route.ts:256-264` | Problem DELETE returns non-standard 409 body missing `requestId` |
| C4-NEW-API-29 | LOW | High | `src/app/api/v1/problems/[id]/draft/route.ts:14-20` | Draft source-code cap is character-based, not byte-based |
| C4-NEW-API-30 | LOW | High | `src/app/api/v1/code-snapshots/route.ts:15-20` | Snapshot source-code cap is character-based, not byte-based |
| C4-NEW-API-31 | LOW | Medium | `src/app/api/v1/submissions/[id]/rejudge/route.ts:84-103`, `:135` | Rejudge can return 200 `{ data: null }` after concurrent deletion |
| C4-NEW-API-32 | LOW | High | `src/app/api/v1/recruiting/validate/route.ts:27,32,58,80` | Public validate endpoint returns non-standard error bodies |
| C4-NEW-API-33 | LOW | High | `src/app/api/v1/contests/[assignmentId]/participants/route.ts:59-63` | `totalCount` returns paged count, not total matching count |
| C4-NEW-API-34 | LOW | Medium | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79` | Strict Origin check is silently skipped when `AUTH_URL` host is unset in production |

### HIGH

#### C4-NEW-API-01 — Active-contest problem-change guard is non-atomic with update
- **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:119-128`, `:216-234`
- **Confidence:** High
- **Problem:** The PATCH handler checks whether a contest has already started (`now.getTime() >= startsAt`) **outside** the update transaction and rejects problem changes if so. The actual mutation in `updateAssignmentWithProblems` re-checks for existing submissions but does **not** re-check the active window.
- **Failure scenario:** An admin edits problems just before a scheduled contest starts. Between the route-level check and the transaction commit, the contest becomes active and no submissions exist yet. The update succeeds, changing the problem set for an active exam.
- **Fix:** Move the active-window guard into `updateAssignmentWithProblems` so it runs inside the same transaction that commits the mutation, using `getDbNowUncached()` and re-selecting the assignment row with `.for("update")` or checking it within the transaction.

#### C4-NEW-API-02 — Score override upsert races and can throw 500 on unique constraint
- **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:101-121`
- **Confidence:** High
- **Problem:** The POST handler deletes the existing override and then inserts a new one. The schema defines a unique index on `(assignmentId, problemId, userId)`, but the handler does not lock the row and does not handle `23505` unique-violation errors.
- **Failure scenario:** Two staff members submit an override for the same participant/problem concurrently. Both transactions pass the existence check, both delete, both insert, and one receives a PostgreSQL unique-violation error that bubbles up as an unhandled 500.
- **Fix:** Either (a) select the existing row with `.for("update")` inside the transaction before delete+insert, or (b) replace the two-step delete/insert with a single `insert(...).onConflictDoUpdate(...)` so PostgreSQL serializes the writes safely.

#### C4-NEW-API-03 — Recruiting invitation creation uses wrong rate-limit bucket
- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:38`
- **Confidence:** High
- **Problem:** `POST /api/v1/contests/:assignmentId/recruiting-invitations` configures `rateLimit: "api-keys:create"`. It should use a recruiting-specific limit such as `"recruiting:invitations:create"`.
- **Failure scenario:** A user with the `recruiting.manage_invitations` capability can consume the API-key creation budget while creating invitations, potentially denying API-key creation to admins. Conversely, if `"api-keys:create"` is more permissive than the intended recruiting limit, the route allows more invitation creation than intended.
- **Fix:** Change the rate-limit key to `"recruiting:invitations:create"` (or reuse the key already defined for the bulk route) and ensure the rate-limit configuration in `src/lib/security/rate-limit.ts` includes it.

#### C4-NEW-API-04 — Anti-cheat POST bypasses enrollment/access check when anti-cheat is disabled
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:50-53`
- **Confidence:** High
- **Problem:** The handler returns `apiSuccess({ logged: false })` immediately when `assignment.enableAntiCheat` is false, **before** the enrollment/access-token check at lines 82-91. This allows any authenticated user to successfully call the endpoint for any existing windowed/standard contest, even if they are not enrolled and have no access token.
- **Failure scenario:** An attacker iterates assignment IDs. A response of `{ logged: false }` vs `403 forbidden` leaks that the assignment exists, is not `examMode === "none"`, and has anti-cheat disabled. It also represents an authorization bypass on a student-facing endpoint.
- **Fix:** Move the enrollment/access-token verification (lines 82-91) to occur **before** the `enableAntiCheat` short-circuit, or at minimum return `{ logged: false }` only after the access check passes.

#### C4-NEW-API-05 — Self-service deregister resets active `judging` submissions to `pending`
- **File:** `src/app/api/v1/judge/deregister/route.ts:73-95`
- **Confidence:** High
- **Problem:** The deregister transaction selects submissions whose status is `pending`, `queued`, **or `judging`** and resets them all to `pending`. `C4-NEW-A12` already identified the same flaw in the admin force-remove path; the worker's own deregister endpoint has the same behavior.
- **Failure scenario:** A worker that is slow to complete but still alive shuts down (or is induced to deregister) while it holds a `judging` submission. The submission is returned to `pending` and immediately claimed by another worker, so the same source code is judged twice in parallel. The second result overwrites the first in the database, but side effects (leaderboard invalidation, auto-review triggers, resource usage) run twice.
- **Fix:** In the deregister transaction, reset only `queued` submissions to `pending`. For submissions currently in `judging`, either leave them claimed and let the stale-claim timeout reap them, or transition them to `internal_error` so an admin can retry them explicitly.

#### C4-NEW-API-06 — Chat route does not propagate client disconnect / AbortSignal to LLM calls
- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:386-520`
- **Confidence:** High
- **Problem:** The route makes upstream LLM calls (`provider.stream`, `provider.chatWithTools`, `provider.stream` for the forced-final response) but never passes an `AbortSignal`. The provider interface does not accept a signal either. Next.js provides `req.signal`, which fires when the client disconnects.
- **Failure scenario:** A user closes the browser tab or the request times out at the reverse proxy while a tool loop is mid-execution or while the LLM is still generating. The server continues to hold the HTTP connection, consume tokens, and run DB tool queries for up to the hard-coded 25-second provider timeout plus up to 5 × 10-second tool timeouts. Under load this leaks connections, memory, and API quota.
- **Fix:** Add an optional `signal?: AbortSignal` field to the provider params, thread it into the underlying `fetch` calls, create an `AbortController` linked to `req.signal` in the route, and pass a combined signal to every `provider.stream` and `provider.chatWithTools` call.

### MEDIUM

#### C4-NEW-API-07 — Security-critical mutations use buffered `recordAuditEvent`
- **Files/lines:**
  - `src/app/api/v1/users/route.ts:156-170` (user create)
  - `src/app/api/v1/users/bulk/route.ts:153-166` (bulk user create)
  - `src/app/api/v1/users/[id]/route.ts:506` (permanent delete), `:514-526` (access deactivation)
  - `src/app/api/v1/groups/[id]/route.ts:239-251` (group delete), `:171-186` (group update)
  - `src/app/api/v1/groups/[id]/members/route.ts:144-158` (member add)
  - `src/app/api/v1/groups/[id]/members/bulk/route.ts:126-145` (bulk member add)
  - `src/app/api/v1/groups/[id]/members/[userId]/route.ts:80-94` (member remove)
  - `src/app/api/v1/groups/[id]/instructors/route.ts` POST (`:55-113`) and DELETE (`:115-141`)
  - `src/app/api/v1/groups/[id]/assignments/route.ts:183-198` (assignment create)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:255-273` (assignment update), `:317-329` (assignment delete)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:130-146` (override upsert), `:218-232` (override delete)
- **Confidence:** High
- **Problem:** These routes call the batched `recordAuditEvent`, which can lose up to five seconds of events on a crash/OOM. The codebase already provides `recordAuditEventDurable` for exactly this class of action (`C4-NEW-A13` documented it for admin routes; the same reasoning applies to user/group/assignment access changes).
- **Failure scenario:** A compromised admin session bulk-creates users, deletes a group, or removes members; the app process crashes before the audit buffer flushes, and the security-relevant action leaves no durable audit trail.
- **Fix:** Replace `recordAuditEvent(...)` with `await recordAuditEventDurable(...)` for all of the calls above. Keep buffered logging only for high-frequency, low-stakes events.

#### C4-NEW-API-08 — No rate limits on read/export endpoints
- **Files/lines:**
  - `src/app/api/v1/users/[id]/route.ts:279` (GET user)
  - `src/app/api/v1/groups/route.ts:14` (GET groups list)
  - `src/app/api/v1/groups/[id]/route.ts:17` (GET group detail + roster)
  - `src/app/api/v1/groups/[id]/members/route.ts:15` (GET members)
  - `src/app/api/v1/groups/[id]/instructors/route.ts:20` (GET instructors)
  - `src/app/api/v1/groups/[id]/assignments/route.ts:19` (GET assignments list)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:20` (GET assignment detail)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:93` (GET exam session — polled every 60 s by active examinees)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/route.ts:10` (GET exam sessions list)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:152` (GET overrides)
  - `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:16` (GET CSV export)
- **Confidence:** High
- **Problem:** These `createApiHandler` GET/list/export endpoints omit `rateLimit`. Several are cheap but enumerable; the export endpoint builds a CSV and the exam-session GET is polled by every active windowed participant.
- **Failure scenario:** A script or compromised session enumerates user/group/roster endpoints in a tight loop, or a large group repeatedly hits the CSV export, consuming DB connections and Next.js workers.
- **Fix:** Add conservative `rateLimit` keys to each `createApiHandler` config (e.g., `"users:view"`, `"groups:list"`, `"assignments:export"`, `"exam-session:view"`).

#### C4-NEW-API-09 — Route schema allows `null` for `email`/`className` but inner validation rejects it
- **File:** `src/app/api/v1/users/[id]/route.ts:26-27`, `:41-54`, `:56-71`
- **Confidence:** High
- **Problem:** `adminPatchUserSchema` declares `email` and `className` as `.optional().nullable()`. `getProfileFields` copies `body.email`/`body.className` into `profileFields` whenever they are not `undefined`, and then `validateProfileFields` validates against `adminUpdateUserSchema`/`updateProfileSchema`, whose `email` and `className` fields are `.optional()` but **not** `.nullable()`.
- **Failure scenario:** An admin PATCHes `{ email: null }` or `{ className: null }`. The route schema accepts the body, but the inner `profileSchema.partial().safeParse(...)` fails with a Zod validation error and the route returns a generic 400 instead of clearing the field.
- **Fix:** Align the schemas. Either remove `.nullable()` from `adminPatchUserSchema` if null is not intended, or add `.nullable()` to `adminUpdateUserSchema.email` and `updateProfileSchema.className` and explicitly handle `null` as a clear operation in the update logic.

#### C4-NEW-API-10 — Group PATCH returns HTTP 200 with `{data: null}` on concurrent deletion
- **File:** `src/app/api/v1/groups/[id]/route.ts:166-188`
- **Confidence:** Medium
- **Problem:** After updating the group row, the handler re-selects it and returns `apiSuccess(updated)`. If another request deletes the group between the `update` and the re-select, `updated` is `undefined` and the route returns 200 with null data.
- **Failure scenario:** Two admins act concurrently; one deletes the group just as another saves an edit. The PATCH caller sees a 200 with empty data and may treat it as a successful update.
- **Fix:** Guard the re-select:
  ```ts
  if (!updated) return notFound("Group");
  return apiSuccess(updated);
  ```

#### C4-NEW-API-11 — Bulk member enrollment skipped-count is inaccurate when identifiers overlap
- **File:** `src/app/api/v1/groups/[id]/members/bulk/route.ts:52-55`, `:124`
- **Confidence:** Medium
- **Problem:** `totalRequested = userIds.length + trimmedUsernames.length` counts raw request identifiers, while `enrolled` counts unique, valid, not-already-enrolled students. If the same user appears in both `userIds` and `usernames`, `totalRequested` is 2 but only 1 can ever be enrolled, so `skipped = totalRequested - enrolled` over-reports skips.
- **Failure scenario:** A CSV paste list contains a username that is also in the `userIds` array. The response reports 1 enrolled and 1 skipped, even though only one unique identifier was requested.
- **Fix:** Compute `skipped` from the count of unique requested identifiers minus `enrolled`, or track duplicates explicitly in the response.

#### C4-NEW-API-12 — Import route drops explicit `sortOrder` from test cases
- **File:** `src/app/api/v1/problems/import/route.ts:37-42`
- **Confidence:** High
- **Problem:** The import schema accepts `sortOrder` on each test case, but the handler maps cases to `{ input, expectedOutput, isVisible }` and discards `sortOrder`. `createProblemWithTestCases` then reassigns ordering by array index.
- **Failure scenario:** An author exports a problem with carefully ordered visible/hidden test cases, imports it elsewhere, and the explicit ordering is silently replaced by positional order. For problems where visible cases are interleaved with hidden cases, this can change the judging presentation.
- **Fix:** Preserve the imported value, falling back to the array index when absent:
  ```ts
  testCases: problem.testCases.map((tc, index) => ({
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    isVisible: tc.isVisible,
    sortOrder: tc.sortOrder ?? index,
  })),
  ```

#### C4-NEW-API-13 — Import route creates problems without an audit event
- **File:** `src/app/api/v1/problems/import/route.ts:8-47`
- **Confidence:** High
- **Problem:** `POST /api/v1/problems/import` calls `createProblemWithTestCases(...)` but never records an audit event. The sibling `POST /api/v1/problems` route records `problem.created` with actor, visibility, and test-case count.
- **Failure scenario:** An operator bulk-imports problems via the API; compliance and incident-response workflows have no durable record of who created the problem or when.
- **Fix:** After `createProblemWithTestCases`, fetch the created problem and emit `await recordAuditEventDurable({ actorId: user.id, actorRole: user.role, action: "problem.created", resourceType: "problem", resourceId: created.id, resourceLabel: created.title, summary: `Imported problem "${created.title}"`, details: { visibility: created.visibility, testCaseCount: created.testCases.length }, request: req });`.

#### C4-NEW-API-14 — SSE `close()` releases coordination slot without catching rejection
- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:353-357`
- **Confidence:** High
- **Problem:** Inside the `ReadableStream` `close()` callback, the shared-coordination branch uses `void releaseSharedSseConnectionSlot(sharedConnectionKey)`. If the DB delete throws, the promise rejection is unhandled.
- **Failure scenario:** During a database connectivity blip, an aborting SSE connection triggers an unhandled rejection. In production Node configurations that treat unhandled rejections as fatal, this can crash the Next.js worker.
- **Fix:** Mirror the defensive pattern already used in the outer `catch`:
  ```ts
  if (useSharedCoordination) {
    releaseSharedSseConnectionSlot(sharedConnectionKey).catch((err) => {
      logger.debug({ err }, "[sse] failed to release connection slot in close");
    });
  } else {
    removeConnection(connId);
  }
  ```

#### C4-NEW-API-15 — Destructive/relevant mutations use buffered audit events
- **Files:**
  - `src/app/api/v1/problems/[id]/route.ts:266-278` (problem DELETE)
  - `src/app/api/v1/submissions/[id]/rejudge/route.ts:116-133` (submission rejudge)
  - `src/app/api/v1/submissions/[id]/comments/route.ts:91-104` (comment creation)
- **Confidence:** High
- **Problem:** These routes call `recordAuditEvent` (fire-and-forget, batched). The codebase already provides `recordAuditEventDurable` for security-critical/admin actions, but these destructive or sensitive mutations do not use it.
- **Failure scenario:** A crash or OOM within the 5-second audit batch window loses the record of a problem deletion, a rejudge (including the contest-finished warning), or a feedback comment added to a submission.
- **Fix:** Replace `recordAuditEvent(...)` with `await recordAuditEventDurable(...)` in the three locations.

#### C4-NEW-API-16 — Recruiting invitation security-critical mutations use buffered audit events
- **Files/lines:**
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:75-84` (account password reset)
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:132-142` (token regeneration)
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:222-236` (update / revoke)
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:255-264` (delete)
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:106-120` (single create)
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:106-116` (bulk create)
- **Confidence:** High
- **Problem:** All of these handlers call `recordAuditEvent` (in-memory, batched, fire-and-forget). The codebase already provides `recordAuditEventDurable` for security-critical actions because the buffered batch can lose up to ~5 s of events on a crash/OOM.
- **Failure scenario:** A compromised or malicious admin creates/revokes/deletes recruiting invitations or resets a candidate account password; the app server crashes before the next audit flush and the action leaves no durable audit trail.
- **Fix:** Replace each `recordAuditEvent(...)` call above with `await recordAuditEventDurable(...)`.

#### C4-NEW-API-17 — Recruiting invitation emails dispatched without rejection handling
- **Files/lines:**
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:121`
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:134`
- **Confidence:** High
- **Problem:** Both sites call `void dispatchRecruitingInvitationEmail(...)`. The `void` operator ignores the returned promise; if the dispatcher throws, the rejection becomes an unhandled promise rejection.
- **Failure scenario:** An admin regenerates a token or creates an invitation with a candidate email. A transient mail failure crashes the process or pollutes logs with an unhandled rejection instead of being logged gracefully.
- **Fix:** Attach a `.catch((err) => logger.warn(...))` handler, or `await` the dispatch inside the `try` block when the response does not depend on it.

#### C4-NEW-API-18 — Community moderation mutations use buffered audit events
- **Files/lines:**
  - `src/app/api/v1/community/threads/route.ts:53-66` (thread creation)
  - `src/app/api/v1/community/threads/[id]/route.ts:50-63` (thread moderation)
  - `src/app/api/v1/community/threads/[id]/route.ts:89-98` (thread deletion)
  - `src/app/api/v1/community/threads/[id]/posts/route.ts:63-76` (reply creation)
  - `src/app/api/v1/community/posts/[id]/route.ts:30-40` (reply deletion)
- **Confidence:** High
- **Problem:** These routes use `recordAuditEvent` for moderation/security actions. Thread/post deletion and moderation are destructive and should be durably audited.
- **Failure scenario:** A moderator deletes harassing content or a thread; a server crash before the buffered flush loses the audit record, hampering compliance investigations.
- **Fix:** Replace `recordAuditEvent` with `await recordAuditEventDurable(...)` for all community moderation/deletion actions.

#### C4-NEW-API-19 — Contest quick-create uses buffered audit event
- **File:** `src/app/api/v1/contests/quick-create/route.ts:120-130`
- **Confidence:** High
- **Problem:** `POST /api/v1/contests/quick-create` creates a hidden group, a windowed assignment, and associated problems, but audits the action with the buffered `recordAuditEvent`.
- **Failure scenario:** A new contest/group is created by an admin; a crash immediately after the response loses the creation audit record.
- **Fix:** Change to `await recordAuditEventDurable(...)`.

#### C4-NEW-API-20 — Anti-cheat `eventTypeFilter` passed unvalidated to Drizzle enum column
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:274`
- **Confidence:** High
- **Problem:** `eventTypeFilter` from `req.nextUrl.searchParams` is concatenated directly into `eq(antiCheatEvents.eventType, eventTypeFilter)`. There is no check that the value is one of the known anti-cheat event types.
- **Failure scenario:** An admin UI bug or a malicious caller passes `eventType=heartbeatX`. Drizzle/PostgreSQL rejects the value and the route returns a generic 500 instead of a clean `invalidEventType` 400.
- **Fix:** Validate against the known event-type set before querying:
  ```ts
  const VALID_EVENT_TYPES = new Set([...CLIENT_EVENT_TYPES, "heartbeat"]);
  if (eventTypeFilter && !VALID_EVENT_TYPES.has(eventTypeFilter)) {
    return apiError("invalidEventType", 400);
  }
  ```

#### C4-NEW-API-21 — Quick-create allows duplicate `problemIds`
- **File:** `src/app/api/v1/contests/quick-create/route.ts:108-117`
- **Confidence:** High
- **Problem:** The schema validates that `problemPoints` length matches `problemIds` length, but it does not enforce that `problemIds` are unique. The `assignment_problems` table almost certainly has a unique index on `(assignment_id, problem_id)`.
- **Failure scenario:** A UI/client bug submits `problemIds: ["p1", "p1"]`. The transaction aborts with a PostgreSQL unique-violation error that `createApiHandler` surfaces as a generic 500.
- **Fix:** Add a uniqueness check after length validation in the Zod schema or handler and return `apiError("duplicateProblemIds", 400)`.

#### C4-NEW-API-22 — Recruiting invitation sub-routes lack rate limits
- **Files/lines:**
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:14`
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:50,60,242`
  - `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts:7`
- **Confidence:** High
- **Problem:** The single-create route has the wrong rate-limit key (C4-NEW-API-03); the bulk-create, per-invitation GET/PATCH/DELETE, and stats routes have **no** `rateLimit` config at all. Bulk creation in particular can insert many rows per request and is attractive for abuse.
- **Failure scenario:** A compromised admin session repeatedly hits the bulk-create or stats endpoints, consuming DB connections and CPU.
- **Fix:** Add appropriate `rateLimit` keys:
  - bulk create: `"recruiting:invitations:bulk-create"`
  - per-invitation GET/PATCH/DELETE: `"recruiting:invitations:read"` / `"recruiting:invitations:update"` / `"recruiting:invitations:delete"`
  - stats: `"recruiting:invitations:stats"`

#### C4-NEW-API-23 — Bulk delete reports success while disk artifacts may remain orphaned
- **File:** `src/app/api/v1/files/bulk-delete/route.ts:28-39`
- **Confidence:** High
- **Problem:** The route deletes DB rows first and then best-effort deletes disk files one-by-one, swallowing errors. `C4-NEW-05` covers the same issue on the single-file `DELETE` handler; the bulk path repeats the pattern.
- **Failure scenario:** An admin bulk-deletes 100 files. The DB transaction succeeds, but a permissions problem or transient I/O error prevents deletion of 10 of the on-disk artifacts. The API still returns `{ deleted: 100 }`, and the orphaned files are no longer referenced by any DB row.
- **Fix:** Either (a) perform disk cleanup before the DB delete and abort the transaction if any file cannot be removed, or (b) collect per-file cleanup failures and return a partial-success response such as `{ deleted: 90, failed: ["id1", "id2"] }`.

#### C4-NEW-API-24 — File upload materializes the entire upload in memory
- **File:** `src/app/api/v1/files/route.ts:41`
- **Confidence:** High
- **Problem:** `const rawBuffer = Buffer.from(await file.arrayBuffer())` loads the complete uploaded file into the Next.js worker's heap before any validation or disk write. The route does enforce size limits and ZIP streaming, but the initial materialization applies to every upload regardless of type.
- **Failure scenario:** With a configured non-image attachment limit of 50 MB and a modest number of concurrent uploads, the worker can hold hundreds of megabytes of upload buffers simultaneously, increasing GC pressure and the risk of OOM. The streaming ZIP slow path in `validation.ts` does not help here because the buffer is already allocated.
- **Fix:** For non-image, non-ZIP attachments, stream `file.stream()` directly to a temporary file on disk and perform magic-byte checks on the stream. Materialize a `Buffer` only for the paths that require it (image processing via `sharp`, ZIP validation via `JSZip`). Cap the number of in-flight buffered uploads.

#### C4-NEW-API-25 — No ceiling on chat `maxTokens` configuration
- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:73`, `:386-520`
- **Confidence:** High
- **Problem:** `pluginConfigSchema` validates `maxTokens` only as `z.number().int().positive()`. The route passes this value straight to the LLM provider. There is no upper bound.
- **Failure scenario:** A misconfigured or compromised admin plugin setting (e.g., `maxTokens: 1_000_000`) causes the chat route to request extremely long completions. This wastes API budget, increases response latency, and can exhaust memory when the provider streams back a multi-megabyte response.
- **Fix:** Add a reasonable ceiling to the schema, e.g. `z.number().int().positive().max(8192)` (or the largest value supported by all configured providers), and document the cap in the plugin settings UI. Consider also bounding `rateLimitPerMinute`.

### LOW

#### C4-NEW-API-26 — Manual handlers bypass `createApiHandler` standard error/request-ID contract
- **Files/lines:**
  - `src/app/api/v1/auth/forgot-password/route.ts`
  - `src/app/api/v1/auth/reset-password/route.ts`
  - `src/app/api/v1/auth/verify-email/route.ts`
  - `src/app/api/v1/groups/[id]/assignments/route.ts:19-94` (GET) and `:96-205` (POST)
- **Confidence:** Medium
- **Problem:** These routes implement auth, CSRF, rate limiting, and JSON parsing manually. Their error responses use ad-hoc shapes (`{ error: "..." }`) without the `requestId` field, `X-Request-Id` header, `X-Content-Type-Options: nosniff`, and standard `Cache-Control` that `createApiHandler` adds automatically.
- **Failure scenario:** A client receiving a 400/429 from forgot-password cannot correlate the response with request logs via `requestId`, and monitoring that expects the standard `{ error, requestId }` shape misses the event.
- **Fix:** Migrate the routes to `createApiHandler`, or at least wrap error responses with `buildErrorBody(code, requestId)` and add the `X-Request-Id`/`nosniff` headers.

#### C4-NEW-API-27 — Assignment detail GET mutates typed response object to strip secret fields
- **File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:54-58`
- **Confidence:** Low
- **Problem:** The handler deletes `accessCode` and `freezeLeaderboardAt` from the typed `assignment` object before returning it. This relies on the object being mutable and on the cast to `{ ... }` with optional keys.
- **Failure scenario:** A future Drizzle version or cache layer returns a frozen/shared object; the `delete` throws or silently affects other callers. It also breaks type safety if the column names change.
- **Fix:** Build a new response object with explicitly selected fields for non-managers instead of mutating the query result.

#### C4-NEW-API-28 — Problem DELETE returns non-standard 409 body missing `requestId`
- **File:** `src/app/api/v1/problems/[id]/route.ts:256-264`
- **Confidence:** High
- **Problem:** The conflict response is built with raw `NextResponse.json({ details: blockedDetails, error: "problemDeleteBlocked" }, { status: 409 })`, bypassing `apiError`/`buildErrorBody`. Consequently the response lacks the `requestId` field and the standard `{ error, requestId }` envelope.
- **Failure scenario:** A client or test expecting the standard error envelope receives a different shape and cannot correlate the failure with request logs via `X-Request-Id`.
- **Fix:** Use `apiError("problemDeleteBlocked", 409, undefined, { details: blockedDetails })`.

#### C4-NEW-API-29 — Draft source-code cap is character-based, not byte-based
- **File:** `src/app/api/v1/problems/[id]/draft/route.ts:14-20`
- **Confidence:** High
- **Problem:** `MAX_SOURCE_BYTES = 65536` and the schema uses `z.string().max(MAX_SOURCE_BYTES)`, which counts Unicode characters. The submission route enforces the same number as bytes (`Buffer.byteLength(..., "utf8")`). A draft containing many multi-byte characters can therefore exceed the submission byte cap while passing draft validation.
- **Failure scenario:** A user saves a draft that is accepted by the autosave endpoint but later rejected on submit, producing a confusing UX.
- **Fix:** Add a byte-length refine:
  ```ts
  sourceCode: z.string().max(MAX_SOURCE_BYTES).refine(
    (v) => Buffer.byteLength(v, "utf8") <= MAX_SOURCE_BYTES,
    "sourceCodeTooLarge"
  ),
  ```

#### C4-NEW-API-30 — Snapshot source-code cap is character-based, not byte-based
- **File:** `src/app/api/v1/code-snapshots/route.ts:15-20`
- **Confidence:** High
- **Problem:** The schema caps `sourceCode` at `256 * 1024` characters (`z.string().max(...)`). The intended storage/anti-cheat budget is presumably bytes; multi-byte source can exceed it.
- **Failure scenario:** A single code snapshot can store more bytes than the 256 KiB budget intended for the `code_snapshots` table.
- **Fix:** Add a byte-length refine or reuse a shared byte-aware validator consistent with the submission/draft routes.

#### C4-NEW-API-31 — Rejudge can return 200 `{ data: null }` after concurrent deletion
- **File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:84-103`, `:135`
- **Confidence:** Medium
- **Problem:** After the transaction resets the submission, the handler re-queries it. If the submission is deleted between the reset and the re-query, `updated` is `undefined` and `apiSuccess(updated)` returns HTTP 200 with `{ data: null }`.
- **Failure scenario:** A concurrent admin or cleanup job deletes the submission during a rejudge. The caller receives a success response for a resource that no longer exists, and the audit event references an invalid submission ID.
- **Fix:** Guard the re-query:
  ```ts
  if (!updated) return notFound("Submission");
  return apiSuccess(updated);
  ```

#### C4-NEW-API-32 — Public recruiting validate endpoint returns non-standard error bodies
- **File:** `src/app/api/v1/recruiting/validate/route.ts:27,32,58,80`
- **Confidence:** High
- **Problem:** The handler returns raw `NextResponse.json({ error: "..." }, { status: ... })` and `NextResponse.json({ data: { valid: true } })`. These shapes omit the `requestId` and the structured `{ error, message, requestId }` taxonomy used by `apiError`/`buildErrorBody` elsewhere.
- **Failure scenario:** A client or monitoring script expecting the standard error shape cannot correlate failures with request logs.
- **Fix:** Use `apiError("invalidJson", 400)`, `apiError("invalidToken", 400)`, and `apiSuccess({ valid: true })` / `apiSuccess({ valid: false })` (or a dedicated `apiError("tokenInvalid", 400)` if the public contract must hide validity).

#### C4-NEW-API-33 — Participant list `totalCount` is actually the returned count
- **File:** `src/app/api/v1/contests/[assignmentId]/participants/route.ts:59-63`
- **Confidence:** High
- **Problem:** The response returns `totalCount: participants.length`. Because the query is capped at `PARTICIPANT_LIST_LIMIT` (500), `totalCount` is at most 500 and does not reflect the true number of enrolled participants.
- **Failure scenario:** A contest with 600 enrolled participants shows `totalCount: 500`, misleading the management UI and making it impossible to detect truncation without an extra count query.
- **Fix:** Run a separate `COUNT(*)` query and return that as `totalCount`, while keeping `participants.length` or a separate `returnedCount` field if needed.

#### C4-NEW-API-34 — Strict Origin check silently skipped when `AUTH_URL` host is unset
- **File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79`
- **Confidence:** Medium
- **Problem:** In production, the handler fetches the expected host via `getAuthUrlObject()?.host`. If `AUTH_URL` is not configured, `expectedHost` is undefined and the entire strict-origin block is skipped, falling back to the weaker global CSRF check.
- **Failure scenario:** A production deployment omits or misconfigures `AUTH_URL`. The anti-cheat endpoint's stricter origin requirement (intended to prevent scripted confederate attacks) is silently disabled.
- **Fix:** When `process.env.NODE_ENV === "production"` and `expectedHost` is empty, fail closed with `apiError("forbidden", 403)` and log a configuration warning.

---

---

## Supplemental Judge/Submissions/Files API Routes Findings

A focused review of the remaining `src/app/api/v1/judge/`, `src/app/api/v1/submissions/`, and `src/app/api/v1/files/` route files uncovered the additional issues below. These are distinct from the findings already recorded above (e.g., `C4-NEW-03`, `C4-NEW-04`, `C4-NEW-05`, `C4-NEW-10`, `C4-NEW-API-05`, `C4-NEW-API-14`, `C4-NEW-API-15`, `C4-NEW-API-23`, `C4-NEW-API-24`, `C4-NEW-API-31`).

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-API-35 | HIGH | High | `src/app/api/v1/files/[id]/route.ts:72-79` | File download rate limit is consumed before authentication |
| C4-NEW-API-36 | MEDIUM | High | `src/app/api/v1/submissions/[id]/rejudge/route.ts:36-71` | Rejudge resets an active `judging` submission without stopping the owning worker |
| C4-NEW-API-37 | MEDIUM | High | `src/app/api/v1/judge/heartbeat/route.ts:22-87` | Judge heartbeat has no rate limit |
| C4-NEW-API-38 | LOW | High | `src/app/api/v1/files/[id]/route.ts:138-150` | File download success response omits standard request-ID/contract headers |
| C4-NEW-API-39 | MEDIUM | High | `src/app/api/v1/submissions/[id]/route.ts:12`, `src/app/api/v1/submissions/[id]/queue-status/route.ts:12`, `src/app/api/v1/submissions/[id]/comments/route.ts:13`, `src/app/api/v1/judge/poll/route.ts:30` | Read/worker-reporting endpoints in scope lack rate limits |
| C4-NEW-API-40 | LOW | High | `src/app/api/v1/submissions/route.ts:35-38`, `:51-53`, `:144-149`; `src/app/api/v1/files/route.ts:170-173` | Unvalidated list-query parameters can cause 500s |
| C4-NEW-API-41 | LOW | High | `src/app/api/v1/judge/poll/route.ts:229-261` | Judge poll final path can return 200 `{ data: null }` after concurrent deletion |
| C4-NEW-API-42 | MEDIUM | High | `src/app/api/v1/files/[id]/route.ts:204-213`, `src/app/api/v1/files/bulk-delete/route.ts:41-51` | File deletion audit events are buffered, not durable |
| C4-NEW-API-43 | LOW | High | `src/app/api/v1/files/route.ts:170-174`, `src/lib/validators/files.ts:9-14` | Files list route ignores its own `fileListQuerySchema` validator |
| C4-NEW-API-44 | LOW | Medium | `src/app/api/v1/judge/register/route.ts:58-78` | Worker registration does not emit an audit event |

### HIGH

#### C4-NEW-API-35 — File download rate limit is consumed before authentication
- **File:** `src/app/api/v1/files/[id]/route.ts:72-79`
- **Confidence:** High
- **Problem:** `GET /api/v1/files/:id` calls `consumeApiRateLimit(request, "files:download")` before `getApiUser`. The limiter key is IP-based, so every unauthenticated request consumes the per-IP bucket.
- **Failure scenario:** An attacker or misconfigured client hammers file-download URLs without credentials. The shared IP bucket fills, and legitimate authenticated users behind the same IP (or NAT/proxy) receive 429 even though they have not yet been identified.
- **Fix:** Move the rate-limit check to after `getApiUser` and switch to per-user limiting, mirroring the list route:
  ```ts
  const user = await getApiUser(request);
  if (!user) return unauthorized();
  const rateLimitResponse = await consumeUserApiRateLimit(request, user.id, "files:download");
  if (rateLimitResponse) return rateLimitResponse;
  ```

### MEDIUM

#### C4-NEW-API-36 — Rejudge resets an active `judging` submission without stopping the owning worker
- **File:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:36-71`
- **Confidence:** High
- **Problem:** The rejudge transaction resets `queued` **and `judging`** submissions to `pending`, clears the claim token, and decrements `activeTasks`. It does not coordinate with the worker that currently owns the `judging` claim. `C4-NEW-API-05` already identified the same flaw in the worker deregister path.
- **Failure scenario:** An admin clicks "rejudge" on a slow submission while a worker is still running it. The worker continues to execute the same source code in its container. The submission is immediately reclaimable by another worker, so two workers can run the identical source concurrently until the first worker's poll is rejected. This wastes CPU, memory, and judge capacity, and can produce confusing worker logs.
- **Fix:** Either (a) reject rejudge when `current.status === "judging"` unless a force flag is provided and an explicit cancel signal is sent to the owning worker, or (b) transition `judging` rejudges to an `internal_error` status so an admin can retry after confirming the original worker has stopped.

#### C4-NEW-API-37 — Judge heartbeat has no rate limit
- **File:** `src/app/api/v1/judge/heartbeat/route.ts:22-87`
- **Confidence:** High
- **Problem:** The heartbeat handler does not call any rate-limit helper. It authenticates the worker via `isJudgeAuthorizedForWorker` and the per-worker secret, then updates the worker row and awaits `sweepStaleWorkers(now)`.
- **Failure scenario:** A compromised worker secret is used to POST heartbeats in a tight loop. Each call writes to `judge_workers` and runs the staleness sweep over all workers, driving DB load and potentially delaying legitimate worker heartbeats.
- **Fix:** Add a per-worker rate limit after authentication:
  ```ts
  const rateLimitResponse = await consumeUserApiRateLimit(request, workerId, "judge:heartbeat");
  if (rateLimitResponse) return rateLimitResponse;
  ```
  Ensure `"judge:heartbeat"` is configured in the rate-limit map.

#### C4-NEW-API-39 — Read/worker-reporting endpoints in scope lack rate limits
- **Files:**
  - `src/app/api/v1/submissions/[id]/route.ts:12` (submission detail GET)
  - `src/app/api/v1/submissions/[id]/queue-status/route.ts:12` (queue status GET)
  - `src/app/api/v1/submissions/[id]/comments/route.ts:13` (comments GET)
  - `src/app/api/v1/judge/poll/route.ts:30` (judge result POST)
- **Confidence:** High
- **Problem:** These routes either use `createApiHandler` without `rateLimit` or are manual handlers without any limiter call. The detail/queue/comments endpoints are cheap to enumerate; `judge/poll` accepts a worker result and writes to the DB, so a leaked worker secret could be used to flood fake verdicts.
- **Failure scenario:** A script iterates submission IDs to scrape details/queue status/comments, or a compromised worker spams fabricated judge results, consuming DB connections and Next.js workers.
- **Fix:** Add `rateLimit` configs (or `consumeUserApiRateLimit` calls) keyed on user/worker ID:
  - `submissions:detail`, `submissions:queue_status`, `comments:read`
  - `judge:poll` per `submission.judgeWorkerId`

#### C4-NEW-API-42 — File deletion audit events are buffered, not durable
- **Files:** `src/app/api/v1/files/[id]/route.ts:204-213`, `src/app/api/v1/files/bulk-delete/route.ts:41-51`
- **Confidence:** High
- **Problem:** Both deletion routes call the batched `recordAuditEvent`. The codebase provides `recordAuditEventDurable` for actions that must survive a crash, but file deletions use the buffered path.
- **Failure scenario:** An admin deletes sensitive files; the app server crashes before the audit batch flushes; the deletion leaves no durable audit trail.
- **Fix:** Replace both calls with `await recordAuditEventDurable(...)`.

### LOW

#### C4-NEW-API-38 — File download success response omits standard request-ID/contract headers
- **File:** `src/app/api/v1/files/[id]/route.ts:138-150`
- **Confidence:** High
- **Problem:** The route is a manual handler (not `createApiHandler`). Its streaming 200 response is built with `new NextResponse(webStream, { headers: ... })`, so it does not include the `X-Request-Id` header or the standard response envelope used by `apiSuccess`. Error paths do use `apiError`, which adds the request ID, so success and error responses have different contracts.
- **Failure scenario:** A client or observability pipeline cannot correlate a successful file download with request logs via `X-Request-Id`.
- **Fix:** Add the request ID to the manual response headers (e.g., reuse the correlation ID already computed by the edge middleware), or refactor the route to use a streaming-compatible helper that preserves the standard contract.

#### C4-NEW-API-40 — Unvalidated list-query parameters can cause 500s
- **Files:**
  - `src/app/api/v1/submissions/route.ts:35-38`, `:51-53`, `:144-149`
  - `src/app/api/v1/files/route.ts:170-173`
- **Confidence:** High
- **Problem:** `problemId`, `assignmentId`, `category`, and `search` are read from `req.nextUrl.searchParams` and passed directly to Drizzle. Only `status` is validated. Invalid UUIDs (`assignmentId=not-a-uuid`) or unknown category strings reach PostgreSQL and surface as generic 500s.
- **Failure scenario:** A malformed query string causes an internal server error instead of a clean 400, triggering alerts and hiding the real client error.
- **Fix:** Validate query parameters with Zod before building the `where` clause. For files, use the existing `fileListQuerySchema`; for submissions, add a similar `submissionListQuerySchema`.

#### C4-NEW-API-41 — Judge poll final path can return 200 `{ data: null }` after concurrent deletion
- **File:** `src/app/api/v1/judge/poll/route.ts:229-261`
- **Confidence:** High
- **Problem:** After the final-status transaction commits, the handler re-queries the submission and returns `apiSuccess(updated)`. If the submission is deleted between the transaction and the re-query, `updated` is `undefined`.
- **Failure scenario:** A concurrent cleanup job deletes the submission just as the worker reports the final verdict. The worker receives HTTP 200 with `{ data: null }` instead of a 404, and the audit event references a missing submission ID.
- **Fix:** Guard the re-query:
  ```ts
  if (!updated) return apiError("submissionNotFound", 404);
  return apiSuccess(updated);
  ```

#### C4-NEW-API-43 — Files list route ignores its own `fileListQuerySchema` validator
- **File:** `src/app/api/v1/files/route.ts:170-174`, `src/lib/validators/files.ts:9-14`
- **Confidence:** High
- **Problem:** `fileListQuerySchema` already exists and covers `page`, `limit`, `category`, and `search`, but the GET handler reads these values manually from `searchParams` and only coerces `page`/`limit` via `parsePagination`. Invalid `category` values therefore bypass the schema.
- **Failure scenario:** Same as `C4-NEW-API-40` for the files list: an invalid category yields a 500 from PostgreSQL.
- **Fix:** Apply `fileListQuerySchema.parse(Object.fromEntries(searchParams))` (or `safeParse` with a 400 response) and use the parsed `category` and `search` values.

#### C4-NEW-API-44 — Worker registration does not emit an audit event
- **File:** `src/app/api/v1/judge/register/route.ts:58-78`
- **Confidence:** Medium
- **Problem:** Registering a new judge worker is a security-relevant provisioning action (it creates credentials that can claim submissions), yet the route logs an info message and returns the plaintext secret without recording an audit event.
- **Failure scenario:** A leaked shared `JUDGE_AUTH_TOKEN` is used to register a rogue worker; there is no durable record of when the worker was created or which IP did it.
- **Fix:** Emit `await recordAuditEventDurable({ actorRole: "system", action: "judge.worker.registered", resourceType: "judge_worker", resourceId: worker.id, resourceLabel: hostname, details: { ipAddress, concurrency, version }, request });` after the insert. Since the caller is token-authenticated rather than user-authenticated, omit or null `actorId` if the schema allows.

## Supplemental Security/Auth/API/CSRF/Rate-Limit/IP/Compiler/Capability Library Findings

A focused review of the core boundary libraries (`src/lib/api/*`, `src/lib/auth/*`, `src/lib/security/*`, `src/lib/capabilities/*`, and `src/lib/compiler/execute.ts`) uncovered the additional issues below. These are distinct from the route-level findings already recorded above.

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-45 | MEDIUM | High | `src/lib/auth/permissions.ts:79-85`, `:99-111` | `assertRole` and `assertGroupAccess` reject custom roles |
| C4-NEW-46 | MEDIUM | Medium | `src/lib/auth/config.ts:337-342`, `:357-364` | Login event recording is fire-and-forget without rejection handling |
| C4-NEW-47 | MEDIUM | High | `src/lib/api/api-key-auth.ts:96-104` | API-key `lastUsedAt` update is unawaited and failures are only logged |
| C4-NEW-48 | MEDIUM | High | `src/lib/api/handler.ts:116-122` | `createApiHandler` accepts and reflects arbitrary client request IDs |
| C4-NEW-49 | LOW | High | `src/lib/security/api-rate-limit.ts:131-143` | Rate-limit 429 headers report `now + windowMs` instead of the bucket reset time |
| C4-NEW-50 | LOW | High | `src/lib/security/sandbox-gate.ts:77-82` | Sandbox email-verification bypass only recognizes built-in staff roles |
| C4-NEW-51 | LOW | High | `src/lib/auth/sign-out.ts:80-94` | `handleSignOutWithCleanup` can call `setIsSigningOut` after unmount |
| C4-NEW-52 | LOW | Medium | `src/lib/compiler/execute.ts:564-580` | Compiler output truncation can split multi-byte UTF-8 characters |
| C4-NEW-53 | LOW | High | `src/lib/security/sensitive-settings.ts:57-61` | `touchesSensitiveSettingsKey` treats `undefined` values as sensitive-key presence |

### MEDIUM

#### C4-NEW-45 — `assertRole` and `assertGroupAccess` reject custom roles
- **File:** `src/lib/auth/permissions.ts:79-85`, `:99-111`
- **Confidence:** High
- **Problem:** Both helpers guard with `isUserRole(session.user.role)`, which only accepts the five built-in role strings. Custom roles that exist in the DB and hold the required capabilities are rejected with "Forbidden", even though `createApiHandler` supports custom roles via capability checks. This creates an authz inconsistency: a server action or page using these helpers cannot be accessed by a custom role, while an API route using the wrapper with the same capabilities can.
- **Failure scenario:** An operator creates a custom role with the same capabilities as `instructor`. A user with that role can access problems/groups through API routes but receives 403 from server actions or pages that call `assertGroupAccess` or `assertRole`.
- **Fix:** Replace the `isUserRole` guard with a capability or level check that understands custom roles (e.g., `resolveCapabilities(role)` or `getRoleLevel(role)`), or provide a dedicated `canManageRoleAsync`-style helper.

#### C4-NEW-46 — Login event recording is fire-and-forget without rejection handling
- **File:** `src/lib/auth/config.ts:337-342`, `:357-364`
- **Confidence:** Medium
- **Problem:** The `signIn` event and callback call `recordLoginEventWithContext(...)` without `await` and without `.catch(...)`. If the audit insert throws (DB overload, serialization failure, disk full), the resulting promise rejection is unhandled and can crash the Node process or pollute logs.
- **Failure scenario:** A login surge causes audit inserts to fail. The login succeeds but the unhandled rejection takes down the Next.js worker, denying subsequent requests.
- **Fix:** `await` the call inside a try/catch, or at minimum attach `.catch((err) => logger.error(...))` so a failed audit never propagates as an unhandled rejection.

#### C4-NEW-47 — API-key `lastUsedAt` update is unawaited and failures are only logged
- **File:** `src/lib/api/api-key-auth.ts:96-104`
- **Confidence:** High
- **Problem:** After a successful API-key authentication, the `lastUsedAt` UPDATE is started with `void db.update(...).catch(...)` and never awaited. The request returns success while the update is still in flight, and a failure produces only a warn log.
- **Failure scenario:** Under heavy API-key traffic, many concurrent UPDATEs race for the same key; `lastUsedAt` becomes unreliable for compromise investigations. A failed update is invisible to metrics and alerting.
- **Fix:** Await the update before returning, or move it to a bounded background writer with failure metrics. If latency is critical, at least increment a failure counter and expose it in health/metrics.

#### C4-NEW-48 — `createApiHandler` accepts and reflects arbitrary client request IDs
- **File:** `src/lib/api/handler.ts:116-122`
- **Confidence:** High
- **Problem:** `getOrCreateRequestId` reads the `x-request-id` header verbatim and uses it for the request lifecycle. There is no length limit, format validation, or sanitization. A client can inject any string (including newlines, high-unicode, or very long values) into logs, error bodies, and the response `X-Request-Id` header.
- **Failure scenario:** A malicious client sends `x-request-id: <script>…` or a multi-kilobyte value. The value appears in structured logs and is reflected back in the response header, breaking log parsers and creating a log-injection vector.
- **Fix:** Validate the header against a UUID/v4 or nanoid format, cap length (e.g., 64 characters), and fall back to `randomUUID()` when invalid.

### LOW

#### C4-NEW-49 — Rate-limit 429 headers report `now + windowMs` instead of the bucket reset time
- **File:** `src/lib/security/api-rate-limit.ts:131-143`
- **Confidence:** High
- **Problem:** `rateLimitedResponse` sets `Retry-After` to the full window and `X-RateLimit-Reset` to `nowMs + windowMs` for every blocked request. For a bucket opened 59 seconds ago with a 60-second window, a client is told to wait 60 seconds instead of 1 second.
- **Failure scenario:** A legitimate client limited early in the window backs off far longer than necessary, reducing throughput and producing confusing observability data.
- **Fix:** Return `windowStartedAt + windowMs` (or `blockedUntil`, whichever is later) in the headers.

#### C4-NEW-50 — Sandbox email-verification bypass only recognizes built-in staff roles
- **File:** `src/lib/security/sandbox-gate.ts:77-82`
- **Confidence:** High
- **Problem:** The staff bypass is a hard-coded list of built-in role strings (`instructor`, `admin`, `super_admin`, `assistant`). A custom role with equivalent or higher privileges does not bypass the verified-email requirement, even though the capability system treats custom roles uniformly.
- **Failure scenario:** An operator creates a custom `senior_instructor` role with `system.settings` and `problems.create`. A user with that role cannot use the compiler/playground without verifying email, while a built-in instructor can.
- **Fix:** Use capability or level checks (`resolveCapabilities`/`getRoleLevel`) instead of string matching for the staff bypass.

#### C4-NEW-51 — `handleSignOutWithCleanup` can call `setIsSigningOut` after unmount
- **File:** `src/lib/auth/sign-out.ts:80-94`
- **Confidence:** High
- **Problem:** The helper awaits `signOut`, which triggers a navigation. The component may unmount before the promise resolves, yet `setIsSigningOut(false)` is called in the catch path.
- **Failure scenario:** A user with a slow network clicks sign out and navigates away before `signOut` resolves. React logs a warning and a state leak may occur.
- **Fix:** Use a mounted ref or `AbortController` and guard the setter; better, return the promise and let the caller manage loading state.

#### C4-NEW-52 — Compiler output truncation can split multi-byte UTF-8 characters
- **File:** `src/lib/compiler/execute.ts:564-580`
- **Confidence:** Medium
- **Problem:** `stdout += chunk.toString("utf8", 0, remaining)` truncates at a byte boundary. If a multi-byte UTF-8 code point straddles the boundary, the output contains a malformed partial character.
- **Failure scenario:** A program emits non-ASCII output near the 128 MiB cap. The returned output ends with a replacement character or truncated bytes, confusing diff-based checkers and corrupting logs.
- **Fix:** Buffer the final chunk, decode it as a complete string, and slice by Unicode code points (or characters) rather than raw bytes.

#### C4-NEW-53 — `touchesSensitiveSettingsKey` treats `undefined` values as sensitive-key presence
- **File:** `src/lib/security/sensitive-settings.ts:57-61`
- **Confidence:** High
- **Problem:** The check returns true whenever a sensitive key exists as an own property, regardless of value. A request that explicitly sets a sensitive key to `undefined` triggers password reconfirmation even though no value is being changed.
- **Failure scenario:** A UI form serializes all fields and sends `undefined` for unchanged sensitive keys. Every settings save demands the user's password, degrading UX and training users to ignore the prompt.
- **Fix:** Treat `undefined` as absent; only require reconfirmation when the value is not `undefined`.

## Supplemental Admin Docker and Language API Routes Findings

A focused review of the admin Docker image routes (`src/app/api/v1/admin/docker/images/build/route.ts`, `prune/route.ts`, `route.ts`) and the admin language config routes (`src/app/api/v1/admin/languages/[language]/route.ts`, `route.ts`) uncovered the additional issues below. These are distinct from the findings already recorded above (e.g., `C4-NEW-A15`–`C4-NEW-A18`, `C4-NEW-A25`, `C4-NEW-A26`, `C4-NEW-API-08`).

### Findings Register

| ID | Severity | Confidence | File(s) | Title |
|---|---|---|---|---|
| C4-NEW-API-45 | MEDIUM | High | `src/app/api/v1/admin/docker/images/build/route.ts:19`, `prune/route.ts:11`, `route.ts:55,93,165`; `src/app/api/v1/admin/languages/route.ts:24,50`, `[language]/route.ts:21,35` | Admin Docker and language routes lack rate limits |
| C4-NEW-API-46 | MEDIUM | Medium | `src/app/api/v1/admin/docker/images/build/route.ts:119` | Docker build route has no in-progress lock, allowing overlapping builds |
| C4-NEW-API-47 | MEDIUM | Medium | `src/app/api/v1/admin/docker/images/build/route.ts:119`, `route.ts:131`, `prune/route.ts:63` | Long-running Docker build/pull/prune operations do not cancel on client disconnect |
| C4-NEW-API-48 | LOW | High | `src/app/api/v1/admin/docker/images/prune/route.ts:36,44` | Prune stale check skips trusted-registry images because Dockerfile path contains `/` |
| C4-NEW-API-49 | LOW | High | `src/app/api/v1/admin/languages/route.ts:91-106`, `[language]/route.ts:69-79` | Language audit events record untrimmed input values |
| C4-NEW-API-50 | LOW | Medium | `src/app/api/v1/admin/docker/images/route.ts:60` | Docker image list filter regex allows path-like reference values |
| C4-NEW-API-51 | LOW | Medium | `src/app/api/v1/admin/languages/[language]/route.ts:52-58` | PATCH language builds an untyped `Record<string, unknown>` update object |

### MEDIUM

#### C4-NEW-API-45 — Admin Docker and language routes lack rate limits
- **Files:** `src/app/api/v1/admin/docker/images/build/route.ts:19`, `prune/route.ts:11`, `route.ts:55,93,165`; `src/app/api/v1/admin/languages/route.ts:24,50`, `[language]/route.ts:21,35`
- **Confidence:** High
- **Problem:** None of the admin Docker routes use `rateLimit` in their `createApiHandler` config. The language GET and PATCH handlers also omit `rateLimit` (only the POST handler already has `"languages:create"`). Build and pull can run for minutes and consume worker/network resources; prune/delete are destructive bulk operations; the list endpoints are enumerable.
- **Failure scenario:** A compromised admin session or a runaway script repeatedly triggers build/pull/prune/list, exhausting the Docker socket, DB connections, or Next.js workers. Without per-route keys, monitoring cannot distinguish abuse from legitimate admin activity.
- **Fix:** Add conservative `rateLimit` keys:
  - Docker: `"docker:images:build"`, `"docker:images:prune"`, `"docker:images:list"`, `"docker:images:pull"`, `"docker:images:delete"`
  - Languages: `"languages:view"` (GET list/detail), `"languages:update"` (PATCH)

#### C4-NEW-API-46 — Docker build route has no in-progress lock, allowing overlapping builds
- **File:** `src/app/api/v1/admin/docker/images/build/route.ts:119`
- **Confidence:** Medium
- **Problem:** After validating the Dockerfile, the route immediately awaits `buildDockerImage(langConfig.dockerImage, dockerfilePath)`. There is no check for an in-progress build for the same image tag, so concurrent POSTs (or rapid admin UI clicks) launch overlapping builds.
- **Failure scenario:** Two overlapping builds of `judge-python:latest` run concurrently. They contend for the same tag, waste worker CPU/memory, and may produce inconsistent layers or interleaved build logs. The audit trail also records two separate `docker_image.built` events for the same tag.
- **Fix:** Maintain an in-memory (or distributed) set of in-progress builds keyed by image tag. Return `409` with code `"buildInProgress"` when a build for the same tag is already running, or await the existing build and return its result.

#### C4-NEW-API-47 — Long-running Docker build/pull/prune operations do not cancel on client disconnect
- **Files:** `src/app/api/v1/admin/docker/images/build/route.ts:119`, `route.ts:131` (POST pull), `prune/route.ts:63`
- **Confidence:** Medium
- **Problem:** The handlers await `buildDockerImage`, `pullDockerImage`, and `removeDockerImages` without passing the request's `AbortSignal` to the Docker client helpers. `buildDockerImage` and `pullDockerImage` in `src/lib/docker/client.ts` do not currently accept a `signal` option. If the client disconnects, the long-running Docker work continues.
- **Failure scenario:** An admin starts a multi-minute image build or pull and closes the browser/tab. The build/pull keeps consuming network and Docker resources; the worker may still be running stale work when a newer request arrives.
- **Fix:** Add an optional `signal?: AbortSignal` parameter to `buildDockerImage`, `pullDockerImage`, and the bulk remove helper, and pass `req.signal` from the route handlers. Wire the signal into the local `spawn`/`execFile` calls and the remote `fetch` calls so the operation aborts promptly on disconnect.

### LOW

#### C4-NEW-API-48 — Prune stale check skips trusted-registry images
- **File:** `src/app/api/v1/admin/docker/images/prune/route.ts:36,44`
- **Confidence:** High
- **Problem:** The route calls `isAllowedJudgeDockerImage(img.repository)`, which can return `true` for trusted-registry images such as `registry.example.com/judge-python`. It then builds `dockerfilePath = join("docker", `Dockerfile.${img.repository}`)`, so the path contains the registry slash. The file `docker/Dockerfile.registry.example.com/judge-python` does not exist, `stat` throws, and the catch block silently skips the image.
- **Failure scenario:** A deployment pulls judge images from a private registry configured in `TRUSTED_DOCKER_REGISTRIES`. The prune endpoint never flags those images as stale, leaving outdated images in place even after their Dockerfiles are updated.
- **Fix:** Either restrict prune to local judge images by calling `isLocalJudgeDockerImage(img.repository)`, or normalize the repository to a safe file stem (e.g., replace `/` and `:` with underscores) before looking up `docker/Dockerfile.<stem>`.

#### C4-NEW-API-49 — Language audit events record untrimmed input values
- **Files:** `src/app/api/v1/admin/languages/route.ts:91-106`, `[language]/route.ts:69-79`
- **Confidence:** High
- **Problem:** `POST /admin/languages` stores trimmed values but records `body.displayName`, `body.dockerImage`, and `body.extension` in the audit details before trimming. `PATCH /admin/languages/[language]` spreads `...body` into the audit details, which includes any untrimmed strings. The audit trail can therefore disagree with the persisted row.
- **Failure scenario:** An admin PATCHes `{ dockerImage: "  judge-python:latest  " }`. The database stores the trimmed value, but the audit event records the surrounding whitespace, making later forensic correlation harder.
- **Fix:** Build a normalized `auditDetails` object from the trimmed values actually written. For PATCH, use the trimmed `updateValues` object rather than the raw `body`.

#### C4-NEW-API-50 — Docker image list filter regex allows path-like reference values
- **File:** `src/app/api/v1/admin/docker/images/route.ts:60`
- **Confidence:** Medium
- **Problem:** The filter validator `^[a-zA-Z0-9*][a-zA-Z0-9._\-/*:]*$` permits `/` after the first character, so a value like `a/../../etc` passes validation. Although the value is passed to Docker via `--filter reference=...` rather than shell interpolation, it is not a valid image reference and can produce unexpected matches.
- **Failure scenario:** A UI bug or a malicious caller passes `filter=a/../../evil`. The route forwards the path-like value to Docker, potentially listing images outside the intended `judge-*` namespace.
- **Fix:** Reuse `isValidImageReference` from `src/lib/docker/client.ts:150-156`, or tighten the regex to reject `..`, consecutive delimiters, and leading/trailing delimiters.

#### C4-NEW-API-51 — PATCH language builds an untyped update object
- **File:** `src/app/api/v1/admin/languages/[language]/route.ts:52-58`
- **Confidence:** Medium
- **Problem:** `updateValues` is declared as `Record<string, unknown>`, so the compiler does not enforce that only known `languageConfigs` columns are assigned. A typo, a missing field, or a future schema change can introduce runtime errors that TypeScript would otherwise catch.
- **Failure scenario:** A future refactor adds a new updatable field to the Zod schema but forgets to copy it into `updateValues`, or accidentally assigns it under the wrong key. The route silently ignores the field or fails at the database layer.
- **Fix:** Use a typed partial object such as `Partial<typeof languageConfigs.$inferInsert>` and assign each field explicitly. This keeps the schema, the update object, and the audit details in sync.

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
11. **Fix the app-server API HIGH findings** (`C4-NEW-API-01`–`C4-NEW-API-06`) before release — active-contest problem changes, score-override races, recruiting rate-limit misconfiguration, anti-cheat access bypass, judge deregister double-judging, and chat-widget client-disconnect leaks.
12. **Fix the judge/submissions/files boundary-layer findings** (`C4-NEW-API-35`–`C4-NEW-API-44`) — rate-limit ordering before auth, active rejudge races, missing heartbeat/poll rate limits, unvalidated query parameters, and durable deletion audits.
13. **Fix the admin MEDIUM correctness issues** (`C4-NEW-A03`–`A08`, `C4-NEW-A09`–`A18`) covering restore/import trust/atomicity, rate-limit gaps, tag/plugin/worker/language races and validation, and durable audit logging.
14. **Fix the UI HIGH-severity correctness bugs** (`CQ4-U01`, `CQ4-U02`, `CQ4-U03`, `CQ4-U04`, `CQ4-U05`, `CQ4-U21`, `CQ4-U36`, `CQ4-U39`) before release.
15. **Systematically eliminate `setState`-after-unmount leaks** (`CQ4-U06`–`U13`, `CQ4-U15`, `CQ4-U16`, `CQ4-U31`, `CQ4-U58`, `CQ4-U62`) by introducing a reusable `useMounted` hook and applying it consistently.
16. **Harden deployment/infrastructure HIGH findings** (`CQ4-D01`–`CQ4-D05`) to prevent docs-induced operational errors, silent build failures, supply-chain drift, and non-fatal architecture mismatches.
17. **Tighten API, admin, app-route, and Rust boundary-layer validation** (`CQ4-A02`, `CQ4-A04`, `CQ4-A06`, `C4-NEW-04`, `C4-NEW-05`, `C4-NEW-08`, `C4-NEW-R08`, `C4-NEW-R09`, `C4-NEW-R10`, `C4-NEW-R11`, `C4-NEW-A19`–`A26`, `C4-NEW-API-07`–`C4-NEW-API-44`) and fix the stale cache comment (`CQ4-A07`).
18. **Address the still-open prior findings** (`createApiHandler` error taxonomy, global SSE advisory lock, per-mutation CSRF DB read, malformed integer parsing) in the next planning cycle.
19. **Fix the core library boundary findings** (`C4-NEW-45`–`C4-NEW-53`) — custom-role authz consistency in `assertRole`/`assertGroupAccess`, rejection handling for login audit events, bounded/validated request IDs, awaited API-key `lastUsedAt` updates, accurate rate-limit reset headers, capability-based sandbox staff bypass, async cleanup in sign-out, UTF-8-safe compiler output truncation, and `undefined` handling in sensitive-settings reconfirmation.
20. **Add rate limits to admin Docker and language routes** (`C4-NEW-API-45`) so expensive, destructive, or enumerable admin operations cannot be abused or accidentally retried in a tight loop.
21. **Prevent overlapping Docker builds and cancel long-running operations on client disconnect** (`C4-NEW-API-46`, `C4-NEW-API-47`) to conserve worker resources and avoid build races.
22. **Tighten Dockerfile-path lookup and image-filter validation** (`C4-NEW-API-48`, `C4-NEW-API-50`) and record normalized values in language audit events (`C4-NEW-API-49`) for consistency.

---

## Positive Observations

- The Cycle 3 remediation passes are real: boolean import, `/files` rate limiting, `AUTH_TRUST_HOST`, judge IP allowlist, workspace cleanup, and restore/import path leakage are all resolved or fail-closed in the current tree.
- `createApiHandler` enforces capability checks, CSRF, audit logging, and request IDs consistently across API routes.
- The Rust worker has strong panic isolation, monotonic-clock rate limiting, fail-closed sidecar auth, and regression tests for sandbox cleanup.
- `deploy-docker.sh` honors the app-server/worker-server split, avoids `docker system prune --volumes`, segments compose networks, and uses digest-pinned `docker-socket-proxy` in production.
- TypeScript and all Rust test suites pass cleanly.

---

*End of Cycle 4 code-quality review.*
