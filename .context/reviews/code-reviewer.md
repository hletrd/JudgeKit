# Code Review — Final Consolidated Report

**Repository:** judgekit @ HEAD `0b0ac198`
**Scope:** Code quality, logic correctness, SOLID, maintainability, error handling, edge cases, missed invariants, data-flow consistency
**Mode:** READ-ONLY (delivered inline by code-reviewer agent; persisted by orchestrator for provenance.)
**Files examined end-to-end:** ~160 files across `src/lib/**`, `src/app/api/v1/**` (all 113 routes), and all 14 Rust source files.
**Total unique findings:** 68 (deduplicated across lanes)

### By Severity
- **CRITICAL: 1**
- **HIGH: 9**
- **MEDIUM: 28**
- **LOW: 30**

### Recently-fixed areas — re-verified CORRECT
Per-problem export `canManageProblem` gate; docker import-time throw → logged error; user-deletion audit after commit; reset/verify token single-use via conditional UPDATE; trusted-registries validation; Rust services fail-closed on missing auth tokens. All confirmed.

---

### CRITICAL (1)

**[CRITICAL] CR-1 — Group DELETE IDOR: capability-only auth, no ownership check**
`src/app/api/v1/groups/[id]/route.ts:188-213` · Confidence HIGH (personally verified)
```ts
export const DELETE = createApiHandler({
  auth: { capabilities: ["groups.delete"] },   // capability only
  handler: async (req, { user, params }) => {
    const { id } = params;                     // arbitrary URL id
    ...
    await tx.delete(groups).where(eq(groups.id, id));  // NO ownership check
```
The sibling PATCH (line 127) correctly calls `canManageGroupResourcesAsync`. DELETE skips it. Scenario: any user whose role grants `groups.delete` sends `DELETE /api/v1/groups/<any-group-id>`; the handler cascade-deletes the group (assignments, enrollments, contest config) as long as it has zero submissions. Fix: mirror the PATCH gate — fetch `instructorId`, call `canManageGroupResourcesAsync`, deny unless `groups.view_all` or owner/co-instructor.

---

### HIGH (9)

**[HIGH] CR-2 — `problems/[id]` GET leaks `referenceSolution` + hidden test cases via variable shadow**
`src/app/api/v1/problems/[id]/route.ts:60, 65, 72-82` · Confidence HIGH (personally verified)
Local `const canManageProblem = caps.has("problems.edit") || authorId === user.id` shadows the imported strict function. PATCH (line 101) and DELETE correctly call `await canManageProblem(id, user.id, user.role)` (which enforces group scope). The GET uses the loose boolean, so a non-author `problems.edit` holder reads any problem's reference solution and every hidden test case. Fix: rename the local, gate through the imported function.

**[HIGH] CR-3 — `admin/api-keys/[id]` PATCH lets any `system.settings` holder disable higher-privilege keys**
`src/app/api/v1/admin/api-keys/[id]/route.ts:51-86` · Confidence HIGH (verified)
Escalation check fires only when `body.role !== undefined`. Mutating `isActive`/`expiryDays`/`name` skips the role check entirely, and the SELECT (line 51) doesn't fetch the existing role. A level-1 ops role can `PATCH {isActive:false}` against a super_admin-owned key. Fix: fetch existing key's role, verify `canManageRoleAsync(user.role, existing.role)` before any field update.

**[HIGH] CR-4 — Restore/import audit event destroyed by the import transaction**
`src/app/api/v1/admin/restore/route.ts:151-163`; `migrate/import/route.ts:98-107` · Confidence HIGH
`recordAuditEvent` fires BEFORE `importDatabase()`, which truncates `auditEvents`. The repo already fixed this exact pattern for user deletion (`76e27d31`). Fix: `recordAuditEventDurable(...)` post-commit.

**[HIGH] CR-5 — Restore returns 500 "restoreFailed" AFTER the DB was already replaced**
`src/app/api/v1/admin/restore/route.ts:165-189` · Confidence HIGH
`importDatabase` commits; `restoreParsedBackupFiles` runs after. A file-stage throw reports "failure" while the production DB has silently swapped. Fix: best-effort file stage with honest partial-success body, or stage + atomically swap.

**[HIGH] CR-6 — Pre-restore snapshot does not capture uploaded files**
`src/lib/db/pre-restore-snapshot.ts:54-125` · Confidence HIGH
Only the DB is snapshotted; uploads are overwritten with no rollback artifact. Fix: parallel uploads tar/zip, or operator acknowledgement.

**[HIGH] CR-7 — Backup-with-files loads DB + uploads + ZIP into memory**
`src/lib/db/export-with-files.ts:162-250` · Confidence HIGH
Peak memory ≈ 3–4× backup size. Admin-triggered self-DoS. Fix: streaming ZIP.

**[HIGH] CR-8 — Prompt injection into the chat-widget LLM (sanitizer bypassed)**
`src/app/api/v1/plugins/chat-widget/chat/route.ts:374-375, 433-436`; `tools.ts:208` · Confidence HIGH (personally verified)
`body.messages` and tool results pushed raw into the prompt; the codebase ships `sanitizePromptInput` and applies it in `auto-review.ts:163`, but the chat path never imports it. Academic-integrity vector on an exam/recruiting judging platform. Fix: apply `sanitizePromptInput` to every user-supplied string and tool result; frame untrusted tool outputs as data.

**[HIGH] CR-9 — `TRUSTED_PROXY_HOPS=0` trusts attacker-controlled `X-Forwarded-For`**
`src/lib/security/ip.ts:91-99` · Confidence HIGH (personally verified)
Comment says `=0` means "no trusted proxies"; code trusts the LAST XFF entry unconditionally, defeating rate-limit buckets, audit IPs, and the judge IP allowlist. Fix: skip XFF path when `trustedHops === 0`.

**[HIGH] CR-10 — Default-nginx XFF spoofing (append, not rebuild)**
`src/lib/security/ip.ts:79-99` · Confidence MEDIUM (personally verified; deployment-dependent)
Default `TRUSTED_PROXY_HOPS=1` + nginx's default `$proxy_add_x_forwarded_for` (appends). Attacker pre-sets `X-Forwarded-For: fake_ip`; `clientIndex = 0` selects `fake_ip`. Only correct when the proxy strips+rebuilds. Fix: document required nginx config; prefer trusted-proxy `X-Real-IP`.

---

### MEDIUM (28 — representative)

- **CR-11** `admin/roles/[id]` PATCH/DELETE allow editing/deleting roles above actor's level — `roles/[id]/route.ts:52`.
- **CR-12** `groups/[id]/instructors` POST doesn't verify target is staff-level (can promote a student to co_instructor) — `instructors/route.ts:54`.
- **CR-13** `groups/[id]` PATCH ownership transfer accepts any active user — `route.ts:142`.
- **CR-14** `plugins/chat-widget/chat` doesn't verify caller can access `context.problemId` — `chat/route.ts:289`.
- **CR-15** `community/threads/[id]/posts` POST missing `canAccessProblem` for editorial/solution scopes — `posts/route.ts:38`.
- **CR-16** `community/votes` POST missing `canAccessProblem` for solution scope — `votes/route.ts:61`.
- **CR-17** `submissions/[id]/events` SSE re-auth omits `canAccessSubmission` re-check (up to 30s stale access) — `events/route.ts:459`.
- **CR-18** `contests/[assignmentId]/anti-cheat` Origin check silently skipped when AUTH_URL unset — `anti-cheat/route.ts:63`.
- **CR-19** `contests/[assignmentId]/invite` POST doesn't verify target user is active — `invite/route.ts:91`.
- **CR-20** Anti-cheat per-IP rate limit frames honest candidates on shared NAT — `anti-cheat/route.ts:35`. Move to post-auth per-user key.
- **CR-21** Audit 5s fire-and-forget buffer lost on hard crash (SIGKILL/OOM) — `audit/events.ts:163`.
- **CR-22** Audit log injection via newlines in `userAgent`/scalars (CSV export) — `request-context.ts:7`.
- **CR-23** Audit write outside caller's transaction — false trail on rollback — pattern across callers.
- **CR-24** Per-problem AI-disable check fails open on DB error — `chat/route.ts:289`.
- **CR-25** Content-Disposition malformation via unsanitized filename extension — `files/[id]/route.ts:118`.
- **CR-26** hCaptcha verification throws uncaught on network failure — `hcaptcha.ts:60`.
- **CR-27** Plaintext decryption fallback for hCaptcha/SMTP/plugin secrets — `hcaptcha.ts:23`, `smtp.ts:54`, `plugins/secrets.ts:61`.
- **CR-28** Deadlock risk in parallel multi-key rate-limit `SELECT FOR UPDATE` — `rate-limit.ts:183`.
- **CR-29** Integer overflow in rate-limiter backoff — `rate-limiter-rs/src/main.rs:263`.
- **CR-30** code-similarity `/compute` no submission-count cap → O(n²) DoS — `code-similarity-rs/src/main.rs:76`.
- **CR-31** Function-judging only registered for `cpp23` — `registry.ts:10` (verified).
- **CR-32** auto-review duplicate-comment TOCTOU — `auto-review.ts:134`.
- **CR-33** False-positive TLE on timer-vs-close race — `compiler/execute.ts:464`.
- **CR-34** No advisory lock against concurrent restores — `restore/route.ts`.
- **CR-35** Long REPEATABLE READ export blocks vacuum — `db/export.ts:88`.
- **CR-36** CSRF Origin check skipped when Origin header absent — `csrf.ts:56`.
- **CR-37** Token-budget amplification via unbounded `editorCode` (100 KB) — `chat/route.ts:55`.
- **CR-38** SMTP header-injection surface in subject construction — `email/templates.ts:59`.

---

### LOW (30 — grouped)
Rust validator/TS divergence; dead docker.rs branches; code-similarity `as char` UTF-8 mangling; hand-rolled calendar in docker.rs; unbounded cleanup loops; missing snapshot checksum; HTTP 499 non-standard; cleanup endpoint config leak; migrate-import error collapse; unbounded compiler time limit; `serializeJudgeCommand` arg loss; stale-claim timeout; ip-allowlist cache; surrogate-pair split; double `getDbNow`; bcrypt/argon2 timing; PII in unencrypted JWT; length-only password policy; capability cache invalidation; workspace chmod 0777; shell denylist misses `&`; local-registry-with-port rejected; orphaned uploads accumulate; ZIP manifest optional; contest access-token SQL inlined in 4 routes; `expiryDays` cap asymmetric in PATCH; stats uses `deadline` not `lateDeadline`; bulk invitations 500 sequential locks; accepted-solutions `total` includes opted-out; queue-status leaks hidden test count; admin test-email SMTP relay surface; chat-logs query params unvalidated; forgot-password CSRF-exempt; raw auth handlers skip no-store header; host-header poisoning residual.

---

### Open Questions (surfaced, not blocking)
- **CR-OQ1** API-key CSRF bypass on destructive migration endpoints when `_apiKeyAuth` — needs `system.backup` admin-only confirmation.
- **CR-OQ2** NextAuth v5 beta session shape when JWT lacks `sub` — `assertAuth` checks `!session` not `!session.user.id`; runtime verification needed.
- **CR-OQ3** Is `groups.delete` capability granted to per-teacher custom roles in production? If only super_admin holds it, CR-1 is functionally contained — but the IDOR is a latent single-misconfiguration-away critical regardless.

---

### Positive Observations
- **Permissions model mostly well-stratified** — `canManageProblem` stricter than `canAccessProblem`; `canManageContest` uniformly enforced on contest writes; TOCTOU-safe sub-resource writes via `getSubmissionReviewGroupIds`.
- **Atomic token redemption** — recruiting `UPDATE...WHERE status='pending' AND expires_at>NOW() RETURNING`; reset/verify conditional `WHERE usedAt IS NULL`.
- **Rate-limit core uses `SELECT FOR UPDATE`**; realtime uses `pg_advisory_xact_lock`; SSE auth recheck every 30s.
- **Argon2id at OWASP params** with transparent rehashing; constant-time token comparison via ephemeral HMAC.
- **Cross-user anti-cheat forgery prevented** — `userId` bound to JWT; server-only event types excluded from client schema.
- **Plugin secrets AES-256-GCM encrypted at rest**, redacted in every GET, never reach browser.
- **Tool dispatch is a closed allowlist** with per-user DB scoping; no SSRF (hardcoded provider URLs).
- **Layered sandbox** (`--network=none`, `--cap-drop=ALL`, `--read-only`, user 65534, optional gVisor+seccomp).
- **ZIP restore has robust path-traversal guards** (`parseBackupZip`, `resolveStoredPath`).
- **No SQL injection** (Drizzle parameterization throughout); **no hardcoded secrets, no `eval`/`new Function` on user input** (grep-verified).

---

### Recommendation

**REQUEST CHANGES — one CRITICAL must be fixed before any release.**

Fix-on-first-pass order:
1. **CR-1** (CRITICAL, group-destruction IDOR) — mirror the PATCH handler's `canManageGroupResourcesAsync` gate. One block of code, today.
2. **CR-2** (reference-solution leak via variable shadow) — rename the local boolean and route through the imported `canManageProblem`. The fix already exists in the same file (PATCH/DELETE use it correctly).
3. **CR-3** (api-key PATCH escalation gap) — fetch existing role, gate every field mutation on `canManageRoleAsync`.
4. **CR-8** (LLM prompt injection) — one import + two call sites; the sanitizer already exists.
5. **CR-9/CR-10** (XFF trust) — small change to `extractClientIp`, broad blast-radius reduction.
6. **CR-4/CR-5/CR-6/CR-7** (restore/backup pipeline) — `recordAuditEventDurable` + streaming ZIP + honest partial-success + upload snapshot.
7. The MEDIUM queue.

**Coverage:** Direct personal verification of `permissions.ts`, `groups/[id]/route.ts` PATCH+DELETE, `problems/[id]/route.ts` GET+PATCH, `admin/api-keys/[id]/route.ts`, `users/[id]/route.ts`, `problems/[id]/export/route.ts`, `db/pre-restore-snapshot.ts`, `docker/client.ts`, `email/index.ts`, `auth/{reset-password,verify-email}/route.ts`, `contests/join/route.ts`, `files/[id]/route.ts`, `participants/route.ts`, `submissions/[id]/events/route.ts`, `plugins/chat-widget/{chat,tools,providers}`, `assignments/{access-codes,recruiting-invitations}`, `realtime-coordination.ts`, `rate-limit-core.ts`, `security/{ip,csrf,password,encryption,token-hash,hcaptcha,rate-limit,api-rate-limit}.ts`, `auth/{config,permissions}.ts`, `audit/events.ts`, all 14 Rust files; sub-agent deep passes across db, compiler, judge, function-judging, api, assignments, plugins, email, anti-cheat, ops, files, and the full 113-route `src/app/api/v1` tree.
