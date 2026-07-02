# Cycle 2 (2026-07-02) Deferred Findings Register

Source: `.context/reviews/_aggregate.md` (2026-07-02 cycle), the per-agent review files under `.context/reviews/`, and the archived `plan/archive/cycle-4-2026-07-01-deferred.md.archived`.

This file merges the existing cycle-4 deferred register with new deferrals identified in the 2026-07-02 aggregate. It records findings that are **explicitly deferred** from the current cycle. All CRITICAL/HIGH security, correctness, and data-loss items that remain unimplemented are scheduled in `plan/cycle-2-2026-07-02-review-remediation.md` Phase A. This register is for product roadmap gaps, UI/UX polish, performance tuning, documentation drift, E2E/test-quality work, and operational convenience that does not block production safety.

---

## Deferred themes and representative findings

### UI/UX, recruiting, and applicant experience
These are user-facing improvements that need browser/runtime verification, locale checks, and often product decisions. They are not security/correctness/data-loss regressions.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| Anti-cheat privacy notice appears after the timer starts | HIGH | applicant-reviewer | Product decides when consent should be collected relative to timer start; needs UX flow redesign. |
| No visible "your code is being autosaved" indicator | HIGH | applicant-reviewer | Part of a dedicated autosave/draft-recovery UX cycle. |
| Browser crash or accidental close loses in-progress code | HIGH | applicant-reviewer | Requires localStorage draft persistence and conflict resolution UI. |
| No editor dry-run / pre-test sanity check before start | HIGH | applicant-reviewer | Product roadmap item; needs a pre-start equipment check flow. |
| No explicit end-of-assessment ceremony with timestamp | HIGH | applicant-reviewer | UX cycle with recruiting team sign-off. |
| Monitoring starts during privacy notice, creating heartbeat gap | HIGH | applicant-reviewer | Bundle with privacy-notice timing redesign. |
| Tab-switch grace period is undisclosed | MEDIUM | applicant-reviewer | Bundle with anti-cheat notice copy update. |
| Token-in-URL exposure and guidance | MEDIUM | applicant-reviewer | Bundle with recruiting login/entry flow redesign. |
| Privacy policy link opens in a new tab without explanation | MEDIUM | applicant-reviewer | Bundle with recruiting copy pass. |
| `blur` event fires with no grace period / noisy on Mac | MEDIUM | applicant-reviewer | Needs runtime browser validation across OSes. |
| Phone-first scenario not handled | LOW | applicant-reviewer | Product decision on mobile support scope. |
| "May be recorded" ambiguity | LOW | applicant-reviewer | Copy clarification. |
| Hamburger toggle 32px fails WCAG 2.5.5 minimum touch target | HIGH | designer | Dedicated UI/a11y cycle with WCAG assertions. |
| Countdown timer urgency relies solely on color + animation | LOW | designer | a11y cycle. |
| `--muted-foreground` on `--muted` background fails WCAG AA | LOW | designer | a11y cycle. |
| Locale switch triggers hard `window.location.reload()` destroying page state | LOW | designer | a11y cycle. |
| `EmptyState` component missing `role="status"` | LOW | designer | a11y cycle. |
| Data tables missing `<caption>` and `scope="col"` | LOW | designer | a11y cycle. |
| Mobile nav panel missing `aria-modal` | LOW | designer | a11y cycle. |
| Admin skeleton loading pages do not match content shape | LOW | designer | a11y cycle. |
| Error boundary pages lack live-region announcement | LOW | designer | a11y cycle. |
| Submit button label includes keyboard shortcut text verbatim | LOW | designer | a11y cycle. |
| Password match/mismatch indicator not announced to screen readers | LOW | designer | a11y cycle. |
| Problem success-rate uses color as the sole visual differentiator | LOW | designer | a11y cycle. |
| Empty `<SelectValue />` shows raw option values | MEDIUM | designer | a11y cycle with Shadcn/Base-UI select audit. |
| Form labels not associated with their controls | MEDIUM | designer | a11y cycle; fix `Label` usage across forms. |
| Missing visible focus indicators on custom interactive elements | MEDIUM | designer | a11y cycle; add `:focus-visible` rings. |
| Interactive content nested inside a `role="button"` container | MEDIUM | designer | a11y cycle; refactor status-board row semantics. |
| Snapshot mini-timeline dots are too small and have no focus indicator | MEDIUM | designer | a11y cycle; increase touch target to 24×24 px. |
| Playground shows untranslated i18n keys and unlabeled controls | LOW | designer | Locale pass on `/playground`. |
| Some `<Button onClick>` components inside forms lack explicit `type="button"` | LOW | designer | a11y cycle; audit form buttons. |
| Chat widget has no focus trap and header buttons lack explicit type/ring | LOW | designer | a11y cycle; add focus trap and locale-aware label. |
| Footer and header action links lack focus rings | LOW | designer | a11y cycle. |
| Nested `<Link>` wrapping `<Button>` creates invalid interactive nesting | LOW | designer | a11y cycle; refactor into link-styled button or standalone link. |
| Tablists lack accessible names | LOW | designer | a11y cycle; add `aria-label` to tablist containers. |

### Instructor / TA workflow features
These are roadmap feature gaps, not regressions. Most require new data models, API routes, and UI components.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| Announcements are contest-only | HIGH | instructor-reviewer | Product approves broadening announcements to all assignment modes; needs migration of existing contest-only UI. |
| TAs cannot post announcements or clarifications | HIGH | assistant-reviewer | Policy decision on TA write scope; currently gated by `canManageContest` by design. |
| TAs cannot grant time extensions during a live exam | HIGH | assistant-reviewer | Policy decision; requires capability matrix update if approved. |
| No per-student deadline extension for non-windowed assignments | HIGH | instructor-reviewer | New `studentDeadlineOverrides` table and UI. |
| No problem statement version history | HIGH | instructor-reviewer | New `problem_history` table and UI tab. |
| No regrade request model, API, or UI | HIGH | assistant-reviewer | New `regrade_requests` table and workflow. |
| No side-by-side code diff for similarity hits | HIGH | assistant-reviewer | New similarity detail modal with diff rendering. |
| No boilerplate/template exclusion for similarity | HIGH | instructor-reviewer | New boilerplate upload/subtract flow. |
| No special judge / checker support | HIGH | instructor-reviewer | New `checker` problem type and sandbox integration. |
| No student notification when a TA comments | HIGH | assistant-reviewer | Email/notification wiring; product decides channel. |
| No TA workload metrics or grading triage view | HIGH | assistant-reviewer | New TA dashboard cards and API. |
| CSV export lacks per-problem breakdown and late-penalty split | HIGH | instructor-reviewer | New export schema; Canvas/LMS integration requirements needed. |
| Similarity results are ephemeral client-side state only | HIGH | assistant-reviewer | Persist `code_similarity` events server-side. |
| No "rejudge this assignment" action on the gradeboard | MEDIUM | instructor-reviewer | Add button calling existing bulk-rejudge route. |
| No "reviewed / cleared" flag for similarity pairs | MEDIUM | instructor-reviewer | Add `reviewedAt`/`reviewOutcome` to `antiCheatEvents`. |
| No clarifications for non-exam assignments | MEDIUM | instructor-reviewer | Product decision on clarification scope. |
| No global or group-level banner announcements | MEDIUM | instructor-reviewer | New banner system. |
| No per-problem language restriction | MEDIUM | instructor-reviewer | New `allowedLanguages` on `assignmentProblems`. |
| No per-problem per-language time-limit override | MEDIUM | instructor-reviewer | New `perLanguageTimeLimitMs` schema field. |
| No per-problem statistics or per-student progress view | MEDIUM | instructor-reviewer | Analytics page enhancements. |
| Late penalty not broken out in export or UI | MEDIUM | instructor-reviewer | Export/UI enhancement. |
| WA diff not accessible from the gradebook | MEDIUM | instructor-reviewer | Inline diff expansion in status board. |
| Hard cap of 100 test cases per problem | LOW | instructor-reviewer | Raise cap or make configurable; needs validation performance check. |
| ICPC score overrides not applied in leaderboard rankings | LOW | tracer | Documented deferral; re-open when ICPC override feature is implemented. |
| IOI override value treated as raw score vs adjusted | LOW | tracer | Re-open when late-penalty/override semantics are clarified. |

### Performance / realtime / caching
These require load-test validation and careful rollout. They are not safety fixes.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| SSE shared poll timer interval is fixed at timer creation | MEDIUM | tracer, perf-reviewer | Performance cycle with SSE concurrency benchmark. |
| SSE batch-poll `IN` clause grows up to 500 elements | LOW | perf-reviewer | Performance cycle. |
| Uncached `count(*) FROM submissions` on every homepage render | LOW/HIGH | perf-reviewer | Performance cycle with caching layer. |
| `computeSingleUserLiveRank` runs a full CTE scan on frozen leaderboard | LOW | perf-reviewer | Performance cycle. |
| `invalidateRankingCache` O(n) LRU scan on every judge verdict | LOW | perf-reviewer | Performance cycle. |
| `getDbNowMs()` DB round-trip on every leaderboard request | LOW/HIGH | perf-reviewer | Performance cycle. |
| Extra SELECT after final verdict update | LOW | perf-reviewer | Refactor batch. |
| Extra SELECT after submission insert | LOW | perf-reviewer | Refactor batch. |
| Rate-limit check pays 3 DB operations per allowed request | LOW | perf-reviewer | Sidecar-dependency or cache batch. |
| Judge worker: 3 subprocess spawns per test case | MEDIUM | perf-reviewer | Worker executor refactor with Docker API. |
| Judge workspaces on host disk rather than tmpfs | MEDIUM | perf-reviewer | Ops validation on worker host. |
| Global serializing advisory lock on every SSE connection | HIGH | perf-reviewer | Performance cycle with sharded lock design. |
| DELETE inside serializing advisory lock in SSE slot acquire | LOW | perf-reviewer | Sharded lock redesign. |
| Advisory lock hash collisions can serialize unrelated submissions | LOW | architect | Evaluate at scale; low priority on current targets. |
| `computeContestAnalytics` re-fetches assignment metadata already in cache | LOW | perf-reviewer | Performance cycle. |
| Middleware performs DB lookups in Edge Runtime | MEDIUM | architect | Performance cycle; evaluate JWT-only auth or edge-safe cache. |
| Rate-limiting has two sources of truth (sidecar + DB) | MEDIUM | architect | Performance cycle; pick single authoritative store or reconcile. |
| Real-time coordination does not scale beyond single instance without DB locks | HIGH | architect | Performance cycle; design sharded/fan-out backend. |
| Code-similarity inner pairwise loop is sequential | MEDIUM | code-reviewer | Performance cycle; parallelize inner loop safely. |
| Runner `chown`/`chmod` calls block the async runtime | MEDIUM | code-reviewer | Performance cycle; move blocking syscalls off the Axum runtime thread. |
| Worker prewarming fires uncontrolled `docker run` commands at startup | LOW | architect | Performance cycle; add concurrency limit and error surfacing. |
| `execute.ts` `child.stdin.write` may not handle backpressure | LOW | debugger | Refactor batch; handle `drain` event for large stdin. |
| Zod validation only returns the first issue as the top-level `error` | LOW | code-reviewer | UX/API cycle; return field-mapped errors. |
| No distributed request ID / trace context | MEDIUM | architect | Observability cycle; propagate trace headers across services. |
| No API versioning strategy beyond the v1 path prefix | MEDIUM | architect | Architecture cycle; design version headers and deprecation markers. |

### Documentation / language drift
These should be reconciled in a dedicated docs sync cycle with the language source-of-truth.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| `flix` Docker image documented as `judge-jvm`; actual image is `judge-flix` | HIGH | document-specialist | Docs sync cycle. |
| `j` and `malbolge` appear in README image-size table but have no language config | HIGH | document-specialist | Docs sync cycle. |
| `roc` in AGENTS.md language table but absent from `Language` type union | HIGH | document-specialist | Docs sync cycle. |
| `judge-haskell` base image discrepancy across AGENTS.md/Dockerfile/languages.ts | MEDIUM | document-specialist | Docs sync cycle. |
| AGENTS.md Docker build/delete API auth wording mismatch | MEDIUM | document-specialist | Docs sync cycle. |
| `.context/development/conventions.md` references a missing `ENV.md` | MEDIUM | document-specialist | Docs sync cycle. |
| `docs/languages.md` stale AMD64/ARM64 language counts | LOW | document-specialist | Docs sync cycle. |
| AGENTS.md language table row count mismatch | LOW | document-specialist | Docs sync cycle. |
| `docs/api.md` similarity response contract drift | MEDIUM | verifier | Docs sync cycle. |
| `docs/api.md` settings/roles `currentPassword` docs gaps | LOW | cycle-4 carry-forward | Docs sync cycle. |
| `roc` language support is inconsistent across the stack | MEDIUM | verifier | Docs sync cycle with language contract. |

### E2E / test quality
These require a dedicated test-hardening cycle, often with a real judge worker in CI or a fixture refactor.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| `contest-participant-audit.spec.ts` uses unconditional `test.skip(true, ...)` | HIGH | test-engineer | Test-hardening cycle. |
| Smoke profile omits submission/judging/creation flows | CRITICAL | qa-tester | Test-hardening cycle with judge worker in CI. |
| E2E fixtures use hardcoded credentials or fail to clean up DB records | MEDIUM/LOW | qa-tester | Fixture migration to `fixtures.ts` and cleanup audit. |
| `all-languages-judge.spec.ts` ARM detection is URL-substring based | LOW | qa-tester | Test-hardening cycle. |
| `function-judging.spec.ts` lacks `try/finally` cleanup | LOW | qa-tester | Test-hardening cycle. |
| `proxy.test.ts` uses live `Date.now()` without fake timers | MEDIUM | test-engineer | Test-hardening cycle. |
| ~30+ source-scanning tests assert string presence instead of runtime behavior | LOW | test-engineer | Test-hardening cycle. |
| No E2E coverage for password reset / forgot-password flow | LOW | qa-tester | Auth E2E cycle. |
| `remediation.smoke.spec.ts` filename misleading | LOW | qa-tester | Rename or document. |
| `contest-full-lifecycle.spec.ts` leaves DB records behind | LOW | qa-tester | Add cleanup. |
| Deployment/infrastructure tests verify string presence, not behavior | MEDIUM | verifier | Test-hardening cycle; render and validate generated configs. |

### Operational / admin convenience
These are runbooks, observability, and convenience features rather than code defects. They need infrastructure decisions before implementation.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| No contest-mode preflight checklist script | HIGH | admin-reviewer | Ops cycle after backup/restore and worker health contracts are stable. |
| No documented secret rotation procedure | HIGH | admin-reviewer | Security runbook cycle. |
| No rollback procedure documented or scripted | MEDIUM | admin-reviewer | Ops cycle after image tagging policy is decided. |
| No SSL cert expiry monitoring | LOW | admin-reviewer | Observability cycle. |
| No capacity planning document | LOW | admin-reviewer | Stress-test cycle. |
| No verdict distribution metric / `compile_error` sweep invisible | MEDIUM | admin-reviewer | Metrics cycle. |
| Rust sidecars (`code-similarity`, `rate-limiter`) have no `/metrics` endpoint | MEDIUM | admin-reviewer | Metrics cycle. |
| No webhook when audit write fails | MEDIUM | admin-reviewer | Metrics/alerting cycle. |
| Dead-letter queue silent prune with no admin UI | LOW | admin-reviewer | Admin dashboard cycle. |
| No npm script for post-deploy smoke profile | LOW | qa-tester | CI convenience cycle. |
| Privacy page hardcodes retention periods | LOW | admin-reviewer | Docs sync cycle. |
| Backup retention loop never prunes encrypted backups | MEDIUM | debugger | Ops cycle. |
| ANALYZE failure silently swallowed | MEDIUM | admin-reviewer | Deploy-script hardening cycle. |
| Backup encryption opt-in / plaintext default | MEDIUM | admin-reviewer | Ops cycle after `AGE_RECIPIENT` rollout. |
| `app:` does not `depends_on` code-similarity or rate-limiter | MEDIUM | admin-reviewer | Compose hardening cycle. |
| `deploy-docker.sh` exceeds modularization threshold | MEDIUM | architect | Refactor cycle. |
| `env.deploy.<target>` profile creation does not harden permissions | MEDIUM | tracer | Bundle with env-profile hardening. |
| nginx config regenerated on every deploy, operator customisations lost | LOW | admin-reviewer | Ops cycle. |
| `E2E_PASSWORD=skip-login` silently removes auth-dependent specs | LOW | qa-tester | CI cycle. |
| Configuration resolution is scattered across env, DB, and code | MEDIUM | architect | Ops cycle; design generated settings manifest. |
| Settings-dependent values captured at module load time | MEDIUM | architect | Ops cycle; move to runtime lookup or document restart requirement. |
| Unencrypted database backups when age/rclone are not configured | LOW | security-reviewer | Ops cycle after `AGE_RECIPIENT` rollout. |
| Static-site deploy script hardcodes `docker-compose` | LOW | code-reviewer | Ops cycle; migrate to `docker compose` plugin. |
| Test and production Docker networks differ in topology | LOW | architect | Ops cycle; align local dev with production compose. |
| `Dockerfile.judge-worker` copies the entire `docker` build context | LOW | code-reviewer | Refactor cycle; copy only runtime-needed files. |
| Build-phase DB connection is a dummy string used for type-checking | LOW | architect | Refactor cycle; avoid constructing a real pool at build time. |
| `scripts/bootstrap-instance.sh` `remote_sudo` helper has unquoted command substitution | LOW | code-reviewer | Ops cycle; harden bootstrap quoting. |

### Roadmap capabilities
These are new product capabilities outside the scope of a hardening cycle.

| Finding | Severity | Reviewer | Condition for scheduling |
|---|---|---|---|
| No in-platform direct messaging | HIGH | assistant-reviewer | Messaging roadmap item. |
| Codeforces/BOJ/Polygon problem import | MEDIUM | instructor-reviewer | Import adapters roadmap. |
| Test-case generator support | MEDIUM | instructor-reviewer | Problem-authoring roadmap. |
| Per-student submission attempt limits | MEDIUM | instructor-reviewer | Assignment-settings roadmap. |
| Grace-period / late-submission buffer field | LOW | instructor-reviewer | Assignment-settings roadmap. |
| Drop-lowest-assignment grading policy | LOW | instructor-reviewer | Grading roadmap. |
| Editorial model, route, and UI | MEDIUM | assistant-reviewer | Problem-publishing roadmap. |
| Notification when assignment description is edited | LOW | instructor-reviewer | Notification roadmap. |
| Side-by-side live preview for problem statements | LOW | instructor-reviewer | Problem-authoring roadmap. |
| GDPR/PIPA data deletion playbook | LOW | admin-reviewer | Compliance roadmap. |

---

## Risk acceptance carried forward from prior cycles

The following findings were explicitly dispositioned as accepted risk in the cycle-3 and cycle-4 Rejected/Not-New Registers. They are not scheduled or deferred as new work; they remain closed pending a policy or architecture change.

| Finding | Severity | Disposition |
|---|---|---|
| Judge IP allowlist allow-all default | HIGH | Accepted: `AGENTS.md` documents the opt-in matrix; unset `JUDGE_ALLOWED_IPS` allows all with a warning, and `JUDGE_STRICT_IP_ALLOWLIST=1` fails closed. Re-open only if policy changes to fail-closed by default. |
| `AUTH_TRUST_HOST=true` default in production compose | HIGH | Accepted: `docs/deployment.md` states this is required behind a reverse proxy and JudgeKit maintains an auth-route host allowlist. Re-open only if host allowlist validation is removed. |
| Admin restore/import `preRestoreSnapshotPath` response | MEDIUM | Accepted: route is gated by `system.backup`; path is intentionally surfaced to operators and audit-logged. Re-open if exposed to non-backup operators. |
| `minPasswordLength` system setting ignored | MEDIUM | Accepted: `AGENTS.md` mandates a fixed minimum of 8; the column is stale debt. Re-open as a settings-cleanup task, not a validation change. |
| Default-language inline SQL repair DR break | CRITICAL | Accepted: Drizzle migration `0007_clumsy_obadiah_stane.sql` already contains both `default_language` columns; the repair block is redundant debt, not a missing-journal DR break. Re-open as deploy-script simplification after verifying all production DBs. |

---

## Deferral rationale summary

The current cycle is scoped to deploy-safe security, correctness, and data-loss hardening. The items above are deferred because they are one of:

1. **Product roadmap gaps** requiring UX design, stakeholder sign-off, and new data models/APIs.
2. **Performance optimizations** requiring benchmarks and load-test validation before rollout.
3. **Documentation drift** that should be reconciled with the language source-of-truth in a dedicated docs cycle.
4. **Test-quality improvements** requiring CI worker integration or fixture refactoring.
5. **Operational runbooks** requiring infrastructure decisions (backup targets, notification endpoints, rotation windows) before code changes can be made safely.
6. **UI/UX polish** needing browser/runtime verification and locale review.

All CRITICAL/HIGH security, correctness, and data-loss items scheduled for implementation are recorded in `plan/cycle-2-2026-07-02-review-remediation.md` Phase A with concrete acceptance criteria.
