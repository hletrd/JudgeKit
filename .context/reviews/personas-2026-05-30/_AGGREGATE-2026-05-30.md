# JudgeKit — Multi-Perspective Production-Readiness Review (2026-05-30)

Synthesis of 7 specialist reviews for the three intended production use cases:
**(R) Recruiting coding tests · (E) Student assignments + timed exams · (C) Programming contests.**

Source reviews in this directory:
`student-`, `instructor-`, `admin-`, `assistant-`, `applicant-`, `security-appsec-`, `security-sandbox-perspective.md`.

> Scope note: these are code/config-traced findings (CONFIRMED) plus a few needing a live PoC (SUSPECTED). They were **not** auto-fixed — this is a review.

---

## Verdict per use case

| Use case | Readiness | Blocking items |
|---|---|---|
| **(C) Contests** | 🔴 **Blocked** | Contest/assignment **edit is 100% broken (HTTP 400)**; saving silently **un-freezes leaderboard**. Can't safely run a ranked contest. |
| **(E) Exams** | 🟠 **Risky** | Client-side timer no-op + anti-cheat heartbeat rejects honest submissions at the buzzer; keyboard trap blocks a11y; built-in-role/audit integrity gaps. |
| **(R) Recruiting** | 🟠 **Risky** | Candidate **PII enumeration via group IDOR**; misleading timer fairness claim; no consent/privacy link + wrong data-controller contact (legal exposure). |

Underlying both security reviews: the **sandbox is above-average** (expected outputs never enter the container, `--network none`, cap-drop, read-only, pids/mem limits) — but the **docker-socket-proxy + likely-unapplied seccomp** mean the isolation is policy, not a hard boundary, if a worker is ever compromised.

---

## Top cross-cutting risks (ranked by severity × likelihood × blast radius)

1. **🔴 CRITICAL — Contest/assignment edit always fails (HTTP 400).** `assignment-form-dialog.tsx:251-266` always sends `freezeLeaderboardAt`/`showResultsToCandidate`/`hideScoresFromCandidates`, but `validators/assignments.ts:122-136` `assignmentPatchSchema` is `.strict()` and omits them → `unrecognized_keys`. No test covers the round-trip. *(instructor; confirmed empirically)* — **blocks E + C.**
2. **🔴 HIGH — Editing un-freezes a live contest + re-hides candidate results.** PATCH handler (`route.ts:128-163`) rebuilds input without those 3 fields; `management.ts:298-301` writes them `null`/`false`. Even after #1 is fixed, any edit to a running contest drops the freeze. *(instructor; confirmed)* — **C integrity.**
3. **🔴 Critical-if-reached — docker-socket-proxy grants full container-create.** `docker-compose.production.yml:69-84` (`POST/DELETE/ALLOW_START/CONTAINERS=1`, no `HostConfig` validation). The sandbox flags in `docker.rs` are policy, not a boundary — a worker/runner-API compromise can launch `--privileged`/`-v /:/host` → host root. *(security-sandbox; confirmed config)* — **R+E+C host safety.**
4. **🟠 HIGH — Likely silent seccomp bypass.** Containers launch via `DOCKER_HOST=tcp://docker-proxy:2375`, so `--security-opt seccomp=/etc/judge/seccomp-profile.json` resolves on the **host**, but `/etc/judge` is only `COPY`d into the worker image (`Dockerfile.judge-worker:34`) and never bind-mounted to the host (`bootstrap-instance.sh`). The default-deny profile probably isn't applied; fail-closed relies on fragile stderr matching (`docker.rs:210-212,450-459`). *(security-sandbox; confirmed config, needs `/proc/self/status` Seccomp PoC)*
5. **🟠 HIGH — Recruiting candidate PII enumeration via group IDOR.** `GET /api/v1/groups/[id]` + `/members` authorize with `canAccessGroup` (true for any enrolled user); all candidates of a recruiting contest share one group, so candidate A direct-`fetch`es every co-candidate's userId/username/name/className. Page-layer hiding is **UI-only** and bypassable. *(security-appsec; confirmed)* — **R privacy/legal.**
6. **🟠 HIGH — Capability privilege escalation via custom roles.** `admin/roles` create/update check only role *level*, never that assigned `capabilities ⊆ actor's own` (`admin/roles/route.ts:55-101`, `[id]/route.ts:52-92`). Anyone with `users.manage_roles` can mint a lower-level role carrying `system.backup`/`system.settings` and self-assign. *(admin; confirmed)*
7. **🟠 HIGH — Assistant over-privilege (global, un-scoped).** `problems.view_all` lets a TA read **every** problem statement system-wide incl. hidden/private exam & recruiting problems in groups they don't teach (`permissions.ts:112-113`, `problems/route.ts:26`). `anti_cheat.view_events` is a **global bypass** in `canMonitorContest` (`contests.ts:232-242`) → a TA pulls anti-cheat PII (IPs, UAs, timelines) for **any** contest/group (`anti-cheat/route.ts:180`). *(assistant; confirmed)* — **R+E+C confidentiality.**
8. **🟠 HIGH — Exam timer is a client-side no-op + buzzer-time honest-submission rejection.** `CountdownTimer` rendered without `onExpired` (`practice/problems/[id]/page.tsx:493-505`) — editor stays editable at 0:00, only a server 403 stops it. And the anti-cheat heartbeat gate refuses submit if last event >90s old (`assignments/submissions.ts:298-317`) — a flaky network at the deadline = lost exam/test. *(student; confirmed)* — **E+R fairness.**
9. **🟠 HIGH — Misleading timer claim to candidates (fairness/discrimination liability).** Recruit page + confirm dialog say "the timer starts when you click Start and cannot be paused," but in `scheduled` mode there is no per-candidate clock — all share one fixed `deadline` (`contests.ts:45-49`; instruction rendered unconditionally `recruit/[token]/page.tsx:301`). Effective time depends on when they open the link. *(applicant; confirmed; windowed mode is fine)* — **R fairness/legal.**
10. **🟠 HIGH — Audit trail loses data on hard crash.** In-memory 5s/50-event buffer, fire-and-forget (`audit/events.ts:163-258`); SIGKILL/OOM/`docker kill` drop role/settings/claim audit events — exactly the integrity-dispute evidence you'd need for an exam/contest challenge. *(admin; confirmed)*
11. **🟠 HIGH — Built-in role customizations silently reverted.** `ensure-builtin-roles.ts:30-38` `onConflictDoUpdate`-overwrites built-in role capabilities to defaults on every render of `admin/roles/page.tsx` — admin changes vanish, no audit. *(admin; confirmed)*
12. **🟠 HIGH (a11y/legal) — Keyboard trap in the code editor (WCAG 2.1.2).** `code-surface.tsx:187-193` `indentWithTab` captures Tab with no escape → keyboard-only/screen-reader candidates can't reach Run/Submit. A hard blocker for an accessible graded assessment. *(student; confirmed)*
13. **🟠 HIGH (privacy/legal) — No consent + wrong controller contact.** Candidates submit PII + anti-cheat telemetry before any privacy link (`privacy/page.tsx` exists but is unlinked from the recruit flow); the privacy page hardcodes `privacy@xylolabs.com` (`privacy/page.tsx:83-85`) → other tenants misroute GDPR/PIPA requests. *(applicant; confirmed)* — **R legal.**

---

## Medium findings (by area)

**Sandbox / judge**
- No **user-namespace remap** — in-container uid 65534 == host uid; seccomp is the only kernel barrier (and per #4 may be off). *(sandbox, High→listed Med here for prod-topology dependence)*
- **Compiler-bomb DoS**: 600s × 2 GiB × up to 16 concurrent compiles (`executor.rs:13-14`); **128 MiB stdout buffered in worker RAM** per stream/job (`docker.rs:356`). A contestant can starve others. *(sandbox)*
- **Judge IP allowlist disabled by default** (`JUDGE_ALLOWED_IPS` unset → allow-all); `/judge/claim` hands out hidden test inputs **and** expected outputs **and** all submitters' source — a token leak is then catastrophic with zero network defense-in-depth. *(appsec)*
- App **fully trusts worker-reported verdicts** (no re-comparison; `verdict.ts`/`poll/route.ts`); residual risk is worker compromise, amplified by #3. *(sandbox)*

**Admin / ops**
- **SMTP password exposure**: `smtpPass` missing from settings-GET redaction (`admin/settings/route.ts:15-21`), `LOGGER_REDACT_PATHS`, and export sanitization (`security/secrets.ts`) — GET returns ciphertext, sanitized DB exports retain the column. *(admin; note: a prior fix covered the audit-log path only — this is the GET/export surface.)*
- **Single-worker staleness gap**: reaping only fires on *another* worker's heartbeat (`heartbeat/route.ts:79-128`, no sweep timer in `instrumentation.ts`); with one worker (per CLAUDE.md) a dead worker stays `online` forever and admin-health can't tell. *(admin)*
- No active **alerting** (journald only); backup **verify never test-restores** PG (`verify-db-backup.sh` checks gzip only) and isn't wired to the backup timer; `NODE_ENCRYPTION_KEY` not in the startup gate (`production-config.ts:11-30`). *(admin)*

**Instructor / config footguns**
- `anonymousLeaderboard` column **read but never written** — dead toggle (masked for exams which force-anonymize). No validation that `freezeLeaderboardAt ∈ [startsAt, deadline)`. `enableAntiCheat` defaults **true** in quick-create but **false** in the general form. *(instructor)*

**Assistant / RBAC**
- `anti_cheat.run_similarity` is a **dead capability** (similarity route gates on `canManageContest`, excludes TAs). No **group-scoped submission list** API (`GET /submissions` is all-or-own). Inconsistent gating across the four contest-monitoring routes. *(assistant)*

**Applicant / privacy**
- No working **deletion/export** path (expired candidates blocked from `/login`, `recruiting/access.ts:136-162`). Opaque retention + blanket legal hold. **Bare, unbranded invite email** reads like phishing (org name/contact exist on the assignment but aren't passed to `templates.ts:55-69`). *(applicant)*
- `submissions.rejudge` is in the **default assistant** capability set and the rejudge object-check passes on ownership → an assistant who also competes could reset their own verdict. Students cannot. *(appsec; Low/Med)*

**Student / UX + a11y**
- `isSubmissionBlocked` computed once at SSR, never re-evaluated (`practice/problems/[id]/page.tsx:200-216`) → stale open/closed UI. Drafts are **localStorage-only**, no server recovery (code-snapshots are write-only telemetry) → device crash destroys unsubmitted work. Anonymous leaderboard **leaks rank** via `Participant {rank}` pseudonym. Korean letter-spacing rule **violated**: `tracking-widest` in `ui/dropdown-menu.tsx:254`. *(student)*

---

## Cross-perspective agreement (higher-signal clusters)

- **Recruiting privacy in shared-group contests** — flagged independently by appsec (group IDOR), student (rank leak), and applicant (consent/visibility). The "all candidates in one group" design + UI-only hiding is the common root.
- **RBAC scoping is function-level, not object/group-level** — assistant (global `problems.view_all`, `anti_cheat.view_events`) + admin (role-capability escalation). The capability system lacks consistent object/group binding and subset enforcement.
- **Exam/recruiting timing fairness** — student (timer no-op, heartbeat gate) + applicant (scheduled vs windowed, misleading copy). Scheduled-mode shared-deadline + client-only timer is the theme.
- **Integrity evidence durability** — admin (audit buffer loss, built-in-role revert) undermines the dispute trail every high-stakes use case needs.

---

## Recommended fix order (priority)

**P0 — before ANY contest/exam/recruiting use**
1. Add the 3 fields to `assignmentPatchSchema` + thread them through the PATCH handler/`management.ts`; add a create→edit round-trip test. (#1, #2)
2. Lock the editor + force a final autosave on client timer expiry (`onExpired`), and make the anti-cheat heartbeat gate fail **open** (or grace-window) at submit. (#8)
3. Apply object/group authorization to `GET /groups/[id]` + `/members` (and re-audit all `canAccessGroup`-only routes) — close the candidate IDOR. (#5)

**P1 — before recruiting/contest at scale**
4. Bind-mount/verify the seccomp profile is actually applied on the worker host + add a boot-time `Seccomp:` self-check; consider userns-remap. (#4, sandbox)
5. Lock down docker-socket-proxy or move to a rootless/sysbox runtime so sandbox flags are a real boundary. (#3)
6. Enforce capability-subset on role create/update; stop auto-reverting customized built-in roles (or gate it). (#6, #11)
7. Scope `problems.view_all` and `anti_cheat.view_events`/`canMonitorContest` to the TA's groups. (#7)
8. Fix the candidate timer copy to match mode (scheduled vs windowed); add consent + privacy link at collection; make the controller contact configurable. (#9, #13)

**P2 — hardening / correctness**
9. Durable audit (synchronous critical events or WAL). (#10)
10. SMTP secret redaction on GET + export. Single-worker staleness sweep timer + alerting + real backup restore-test. (admin Med)
11. Editor keyboard-escape (Esc→Tab) for a11y; server-side draft recovery; freeze-window validation; consistent `enableAntiCheat` default; remove/implement `anonymousLeaderboard`; fix the Korean `tracking-widest`. (a11y/UX/footguns)
12. Compiler-bomb + output-size limits; default-on judge IP allowlist with a deploy check.

---

## What's genuinely solid (calibration — verified, not assumed)
- Hidden test-case I/O never leaks through student/submission paths; **expected outputs never enter the sandbox** (out-of-band comparison) — kills the "print the answer" cheat class.
- Judge result endpoint is worker-auth + claim-token bound → students/candidates can't forge or replay verdicts; peer submission/source isolation is robust.
- Recruiting tokens: 192-bit, SHA-256-hashed, single-use, brute-force lockout; canonical-host email links (no Host-header poisoning); HTML escaping correct.
- Score-override consistency across gradebook / leaderboard / export is now correct (a historically buggy area); late-penalty math is single-source SQL on DB time.
- Sandbox baseline: `--network none`, `--cap-drop=ALL`, `--read-only`, non-root USER on all ~102 judge images (pinned bases), `--pids-limit`, memory==swap, `--init`, `--no-new-privileges`, per-submission ephemeral 0700 tempdir, custom default-deny seccomp content.
- CSRF / open-redirect / cookie / session-revocation hygiene; no user-controlled-URL SSRF; no mass-assignment on user PATCH; test/cleanup endpoints inert in production; AES-256-GCM secrets with (mostly) full redaction.
