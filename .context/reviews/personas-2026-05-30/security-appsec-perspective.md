# Security / AppSec Perspective — JudgeKit Web/App Layer

Reviewer persona: malicious or curious authenticated user (student / candidate / assistant) **and** an unauthenticated attacker, probing the web/API layer with full source access. Reviewed: `src/lib/api/handler.ts`, `src/lib/api/auth.ts`, `src/lib/auth/**`, `src/lib/capabilities/**`, and the bulk of `src/app/api/v1/**`.

Bottom line: the codebase is **unusually hardened**. Object-level authorization is enforced per-route (not just function-level), the judge result endpoint is worker-authenticated + claim-token gated, recruiting tokens are 192-bit hashed single-use with brute-force lockout, CSRF/redirect/cookie hygiene is solid, and hidden test-case I/O does not leak through the submission paths. I found **one confirmed exploitable recruiting-privacy IDOR** and a handful of lower-severity / config-dependent issues. No critical score-manipulation or exam-answer-leak path was found.

## Top exploitable risks
(ranked by severity × exploitability)

1. **[High, Confirmed] Recruiting candidate enumeration via group API IDOR** — a recruiting candidate can list every co-candidate (userId, username, name, className) in the same recruiting contest by calling `/api/v1/groups/[id]` and `/api/v1/groups/[id]/members` directly. The UI hides these pages from candidates, but the API does not. See Authz/IDOR #1.
2. **[Medium, Config-dependent] Judge worker endpoints open when `JUDGE_ALLOWED_IPS` unset** — `isJudgeIpAllowed` allows all IPs by default, so the only barrier protecting hidden test-case inputs+expected outputs (and all submitters' source code) on `/api/v1/judge/claim` is knowledge of the shared `JUDGE_AUTH_TOKEN`. Not student-exploitable unless the token leaks, but the IP allowlist being opt-in widens the blast radius of a token leak. See Exam-Contest Integrity #2.
3. **[Low/Medium, Suspected] Assistant can rejudge their own submission to reset a verdict** — `submissions.rejudge` is in the default `assistant` capability set, and `canAccessSubmission` returns true for `submission.userId === userId`. An assistant who is also a contestant could wipe and re-run their own verdict. See Exam-Contest Integrity #3.
4. **[Low, Confirmed] Anti-cheat heartbeat is trivially spoofable for the curl-only attack** — by design the heartbeat is a self-asserted POST; a confederate-assisted candidate can keep the `antiCheatHeartbeatRequired` gate satisfied with a 30s curl loop that pins Origin. The code acknowledges this. See Exam-Contest Integrity #4.

---

## Findings by class

### Authz / IDOR

**#1 [High, CONFIRMED] Recruiting candidate enumeration via group routes**

- Routes: `GET /api/v1/groups/[id]` (`src/app/api/v1/groups/[id]/route.ts:40`) and `GET /api/v1/groups/[id]/members` (`src/app/api/v1/groups/[id]/members/route.ts:19`).
- Class: Broken Object-Level Authorization (information disclosure / candidate enumeration).
- Both routes authorize only with `canAccessGroup(id, user.id, user.role)` (`src/lib/auth/permissions.ts:11-59`). For a recruiting candidate that function returns `Boolean(enrollment)` (lines 22-28): any enrolled user passes.
- The recruiting flow funnels **all** candidates of a quick-created contest into a **single shared group**: `contests/quick-create` creates one `groups` row (`src/app/api/v1/contests/quick-create/route.ts:85-90`), and `redeemRecruitingToken` enrolls every candidate into that `assignment.groupId` (`src/lib/assignments/recruiting-invitations.ts:673-678`).
- A candidate learns their own groupId from `GET /api/v1/groups` (the non-`view_all` branch returns enrolled groups: `src/app/api/v1/groups/route.ts:38-52`). They then call `/api/v1/groups/[id]/members` and receive every co-candidate's `id, username, name, className` (members route lines 34-49). `/api/v1/groups/[id]` additionally returns the full enrollment roster; it only masks `email` behind `canViewEmails` (route lines 71-97) — name/username/userId are exposed to any enrolled candidate.
- **Intent is documented**: the developers deliberately block candidates from the *page* (`src/app/(public)/groups/page.tsx:70-76` redirects `isRecruitingCandidate` to `/dashboard`), and the leaderboard route explicitly 403s recruiting candidates (`src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:37-39`). The same guard was simply never applied to the group API routes — the protection is UI-only and bypassable with a direct `fetch`.
- Exploit (recruiting): Candidate A redeems their invite token, logs in, opens devtools, calls `GET /api/v1/groups` → gets `groupId`, then `GET /api/v1/groups/{groupId}/members` → full list of competing candidates' real names and classNames. In a hiring context this leaks the identities/size of the candidate pool to every candidate.
- Severity High (privacy breach of external candidates, the explicit threat model), Confidence High (traced end-to-end).
- Fix: In `canAccessGroup` (or at both route handlers) reject recruiting candidates the same way the leaderboard does, e.g. `if ((await getRecruitingAccessContext(userId)).isRecruitingCandidate) return false;` for the members/roster read paths — or scope the returned roster to only the requesting user when the viewer is a candidate. Mirror the leaderboard's existing pattern. Also consider giving each recruiting candidate their own isolated group/enrollment rather than a shared group.

**Strong defenses observed (calibration):**
- `submissions/[id]` GET, `/comments`, `/events` (SSE), `/rejudge` all call `canAccessSubmission` (`src/lib/auth/permissions.ts:213-241`) which is genuinely object-level: ownership OR `submissions.view_all` OR instructor-of-the-assignment-group via `canViewAssignmentSubmissions`. Non-assignment submissions are owner/admin only.
- `problems/[id]` GET/PATCH/DELETE gate on `canAccessProblem` + author/`problems.edit`/`problems.delete` (`src/app/api/v1/problems/[id]/route.ts`), and test cases are only returned to managers (line 63-72).
- `contests/[assignmentId]/code-snapshots/[userId]`, `participant-timeline/[userId]`, `participants`, `clarifications`, `anti-cheat` GET, `access-code` all enforce `canViewAssignmentSubmissions` / `canManageContest` / `canMonitorContest` against the assignment's group — object-level, not just a role check.
- `quick-create` validates that the caller actually has access to every embedded problem via `getAccessibleProblemIds` (lines 70-81), closing the noted SEC-21-9 private-problem-embedding IDOR.
- `users/[id]` PATCH uses a `.strict()` schema and gates each privileged field (role/isActive/password/username/email/mustChangePassword) behind `isAdminActor`, plus `ensureActorCanManageTarget` role-level checks — **no mass-assignment / privilege escalation**.
- AI chat agent tools (`src/lib/plugins/chat-widget/tools.ts`) scope `get_submission_detail`/`get_submission_history` to `context.userId` and re-check `canAccessProblem` — no IDOR through the LLM.

### Exam & Contest Integrity

**#2 [Medium, CONFIRMED-design] Judge worker endpoints rely on a shared token; IP allowlist is opt-in**

- Routes: `POST /api/v1/judge/claim` (`src/app/api/v1/judge/claim/route.ts`) and `POST /api/v1/judge/poll` (result reporting; `src/app/api/v1/judge/poll/route.ts`).
- `isJudgeIpAllowed` returns `true` when `JUDGE_ALLOWED_IPS` is empty/unset (`src/lib/judge/ip-allowlist.ts:160-174` — "No allowlist configured — allow all"). So by default the network barrier is off.
- `/judge/claim` returns **test-case `input` AND `expectedOutput`** for the claimed problem (`route.ts:292-302`) plus the submitter's full `sourceCode`. The only auth is `isJudgeAuthorized` (shared `JUDGE_AUTH_TOKEN`, timing-safe compare) or per-worker secret. This is the single richest exam-answer-leak surface in the app: whoever holds the shared token can drain pending submissions and read every problem's hidden answers + every contestant's code.
- **This is not directly student-exploitable** — a student does not have the judge token. But it is the highest-impact secret in the system, and shipping with the IP allowlist disabled by default means a token leak (env dump, log, misconfig, repo) is immediately catastrophic with no network defense-in-depth.
- `/judge/poll` is correctly hardened against students: results are bound to `judgeClaimToken` in the SQL `WHERE` (lines 88-90, 153-155), and per-worker auth via `isJudgeAuthorizedForWorker` (lines 68-75) requires the worker's hashed secret. A student cannot forge a verdict without both the claim token (random `nanoid`, never returned to students) and worker auth. Good.
- Severity Medium (config-dependent, secret-gated), Confidence High.
- Fix: Make `JUDGE_ALLOWED_IPS` effectively mandatory in production (fail closed, or warn loudly on boot when unset), and document that the app server / worker should be on a private network. Consider per-worker tokens as the only accepted auth (the shared `JUDGE_AUTH_TOKEN` is already only used on the register/no-workerId path).

**#3 [Low/Medium, SUSPECTED] Assistant can rejudge their own submission**

- Route: `POST /api/v1/submissions/[id]/rejudge` (`src/app/api/v1/submissions/[id]/rejudge/route.ts:14-15`), gated `auth: { capabilities: ["submissions.rejudge"] }`.
- `submissions.rejudge` is in the **default assistant capability set** (`src/lib/capabilities/defaults.ts:23-34`), and the route's object check is `canAccessSubmission(submission, ...)` which returns `true` when `submission.userId === user.id` (`permissions.ts:228`).
- Therefore an `assistant` who is also a contest participant can rejudge their **own** submission: it resets `status→pending`, clears `score`/`judgeClaimToken`, and re-queues. In a contest where an assistant competes, this lets them wipe an unfavorable verdict and force a re-run (and the audit log notes "contest already finished" but does not block it — lines 86-115).
- Students cannot do this (they lack `submissions.rejudge`), so this only matters where assistants compete or where a custom role grants `submissions.rejudge` broadly. Hence Suspected / needs a runtime PoC of an assistant participating in a graded contest.
- Severity Low→Medium (depends on whether assistants compete), Confidence Medium.
- Fix: Require an instructor/grader relationship (not mere ownership) to rejudge — e.g. `canViewAssignmentSubmissions` / `canManageContest` instead of `canAccessSubmission`, or explicitly forbid self-rejudge when the submission belongs to a graded/closed assignment.

**#4 [Low, CONFIRMED-by-design] Anti-cheat heartbeat is self-asserted**

- Route: `POST /api/v1/contests/[assignmentId]/anti-cheat` (`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`). The submission gate `validateAssignmentSubmission` requires a heartbeat within 90s (`src/lib/assignments/submissions.ts:298-317`).
- The heartbeat is just an authenticated POST; the route adds a production-only `Origin`-must-match check (lines 63-79) which raises the bar above the global CSRF helper, but a candidate (or a confederate) who scripts a 30s loop with `Origin: https://<host>` set keeps the gate green while a second person solves on another device. The code comments explicitly acknowledge this is a deterrent, not a guarantee (lines 55-62, 291-297).
- Severity Low (documented limitation, deterrent control), Confidence High.
- Fix: Out of scope for a quick patch — meaningful improvement requires binding heartbeats to the same session/connection that submits, or server-side liveness signals. Worth flagging to stakeholders that exam proctoring here is best-effort.

**Strong defenses observed:**
- Hidden test-case I/O does **not** leak to students through the submission detail/results/SSE paths: `submissionResults` stores only `actualOutput` (schema `schema.pg.ts:831`), never `input`/`expectedOutput` (those live only in `testCases`, `schema.pg.ts:297-298`), and `sanitizeSubmissionForViewer` (`src/lib/submissions/visibility.ts`) further nulls `actualOutput` for non-visible cases and honors `showResultsToCandidate`/`hideScoresFromCandidates`.
- Leaderboard freeze + anonymization: `contests/[assignmentId]/leaderboard` clears `userId` for all non-instructors, anonymizes names in exam mode, returns frozen rankings to students and only a single live self-rank (`leaderboard/route.ts:56-94`). Recruiting candidates are 403'd entirely.
- Score overrides (`overrides/route.ts`) require `canManageGroupResourcesAsync`, cap `overrideScore` at the problem's max points (line 89), and verify target enrollment — students cannot reach this route and cannot inflate beyond max.
- Submission window/exam enforcement uses **DB server time** (`getDbNowUncached` / SQL `NOW()`) throughout to avoid app/DB clock-skew bypass; windowed-exam personal deadline is enforced at insert time inside the same transaction (`submissions/route.ts:342-357`).

### Recruiting Privacy

- **Token strength: strong.** `generateRecruitingToken` = `randomBytes(24).toString("base64url")` ≈ 192 bits (`recruiting-invitations.ts:153-155`); only `hashToken(token)` is persisted (lines 176, 211); redemption is atomic + single-use (status `pending`→`redeemed` guarded by SQL `WHERE` lines 699-706); per-invitation brute-force lockout after 5 failed password attempts (lines 512-515, atomic counter via `jsonb_set`); expiry validated by SQL `NOW()` to avoid clock skew. Not guessable, not enumerable.
- **`recruiting/validate` (public)** returns a uniform `{valid:false}` for every failure (status/expiry/assignment), so it does not leak invitation status or assignment details to anonymous callers (`src/app/api/v1/recruiting/validate/route.ts:55-77`). CSRF-validated and rate-limited even though public.
- **Stale-candidate lockout (SEC C-2):** once all of a candidate's invitation windows expire, `/login` credential auth is refused (`config.ts:308-323`, `isStaleRecruitingCandidate`). Recruiting login does not clear the IP rate limiter (single-factor, lines 246-252) — prevents token brute-force amplification.
- **Comment reviewer-identity masking:** when a candidate views their own submission comments, reviewer name/role are stripped unless the viewer is staff (`submissions/[id]/comments/route.ts:49-54`).
- **The one gap is #1 above** (candidate-to-candidate enumeration via group routes). Everything else in the recruiting surface is well-defended.

### Web / Session / CSRF / SSRF

- **CSRF (`src/lib/security/csrf.ts`):** mutation methods require `X-Requested-With: XMLHttpRequest` (un-settable by HTML forms cross-origin), plus optional `Sec-Fetch-Site` and `Origin`-host checks against `AUTH_URL`. API-key requests skip CSRF (no cookies). Reasonable and consistently applied via `createApiHandler` defaults. Note: relying on a custom header is a valid CSRF defense given Next/fetch semantics; no gap found.
- **Open redirect (`src/lib/auth/redirect.ts`):** `getSafeRedirectUrl` rejects scheme-bearing, protocol-relative (`//`), backslash (`/\`), userinfo (`/@`), and CRLF variants, then re-parses against a placeholder origin and verifies same-origin + no userinfo. Solid.
- **Cookies/session (`config.ts:182-190`, `session-security.ts`):** `httpOnly: true`, `sameSite: lax`, `secure` (conditional on deployment), JWT strategy with configurable maxAge. Token revocation via `tokenInvalidatedAt` vs `authenticatedAt` (clock-skew-safe, DB time); `clearAuthToken` sets `authenticatedAt=0` to close a revocation-bypass window. Deactivation/role-change/password-reset all set `tokenInvalidatedAt`, immediately invalidating live JWTs on next request (`getActiveAuthUserById:42-48`). SSE re-checks auth every 30s. No fixation/stale-session gap found.
- **SSRF:** all server-side outbound `fetch`es target fixed hostnames (`api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.resend.com`, `api.sendgrid.com`) or env-configured internal services (judge worker, code-similarity, rate-limiter). The only dynamic URL is the Gemini model name, which is validated against `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` to block path traversal (`providers.ts:300-307`). Provider base URL / API keys are admin-configured (encrypted at rest, decrypted least-privilege per request). No user-controlled-URL SSRF (no org-logo/avatar fetch-by-URL surface found).
- **Secrets in responses:** `admin/settings` GET/PUT redact `SECRET_SETTINGS_KEYS` and never echo the full hCaptcha secret (`admin/settings/route.ts:15-21, 137-141`); the secret is `encrypt()`-ed before storage. Chat plugin keys are stored encrypted and only the selected provider's key is decrypted per request.
- **Verbose errors:** the `createApiHandler` catch returns a generic `internalServerError` and logs the detail server-side (`handler.ts:204-207`); validation returns Zod messages (keys, not stack traces). No info leak observed.
- **File upload (`files/route.ts`):** MIME allowlist + magic-byte verification + size limits + ZIP-bomb decompressed-size check; images re-processed through sharp; `originalName` stripped of control chars; stored under a random `nanoid` name. GET scopes to own files unless `files.manage`. Well-defended.
- **Rate limiting:** applied broadly via `rateLimit` keys on mutating routes and login (IP + username multi-key, `config.ts:254-261`); judge/claim uses per-worker / per-IP / per-token-hash buckets. Login uses a constant dummy-hash compare for unknown users to avoid a username-enumeration timing oracle (`config.ts:288-296`).

### Other

- **`/api/v1/test/seed`** is hard-gated: returns 404 unless `PLAYWRIGHT_AUTH_TOKEN` set AND not production, requires localhost client IP (via trusted-proxy-aware `extractClientIp`), timing-safe Bearer compare, CSRF, and only operates on `e2e-`/`[E2E]`-prefixed rows. Inert in production.
- **`/api/internal/cleanup`** returns 410 unless `ENABLE_CRON_CLEANUP=true`, then requires `CRON_SECRET` Bearer (timing-safe) + rate limit. Safe.
- **Exam-session route** (`groups/[id]/assignments/[assignmentId]/exam-session`) correctly restricts querying another user's session to managers/`contests.view_analytics` and verifies target enrollment (lines 108-130).

---

## Priority-ranked remediation checklist

1. **[High] Fix recruiting candidate enumeration (#1).** Block `isRecruitingCandidate` from the group roster/members read paths (mirror the leaderboard 403), or scope the returned roster to self for candidate viewers. Files: `src/app/api/v1/groups/[id]/route.ts:40`, `src/app/api/v1/groups/[id]/members/route.ts:19`, and/or `canAccessGroup` in `src/lib/auth/permissions.ts`. Consider per-candidate isolated groups in the recruiting flow.
2. **[Medium] Make the judge IP allowlist fail-closed in production (#2).** Treat unset `JUDGE_ALLOWED_IPS` as deny (or boot-time warn) and document private-network deployment. File: `src/lib/judge/ip-allowlist.ts:160-174`. Drop the shared-token fallback once all workers carry per-worker secrets.
3. **[Low/Medium] Restrict rejudge to a grader relationship (#3).** Replace `canAccessSubmission` with `canViewAssignmentSubmissions`/`canManageContest` in the rejudge handler, or forbid self-rejudge on graded/closed assignments. File: `src/app/api/v1/submissions/[id]/rejudge/route.ts:33`.
4. **[Low / informational] Document anti-cheat heartbeat as best-effort (#4)** to stakeholders; longer-term, bind heartbeats to the submitting session/connection. File: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`, gate in `src/lib/assignments/submissions.ts:298-317`.
5. **[Hygiene] Periodically re-audit that every new `/api/v1/**` route with an `[id]`/`[userId]`/`[assignmentId]` param performs an object-level check** (ownership or group-relationship), not just a role/capability gate — the codebase does this well today; the one regression (#1) was a missing recruiting guard, so add a lint/test asserting recruiting candidates are blocked from group/problem/roster reads at the API layer (not only the page layer).
