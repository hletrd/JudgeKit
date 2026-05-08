# Security Review — JudgeKit Production (algo.xylolabs.com) — 2026-05-03

Reviewer: adversarial code review + live black-box probing.
Scope: Next.js app (`src/`), Rust judge worker (`judge-worker-rs/`), sidecars (`code-similarity-rs/`, `rate-limiter-rs/`), Docker/compose, seccomp profile, public production endpoint.
Inputs consumed: `/tmp/judgekit-review/probe-evidence.md`, prior `.context/reviews/06-security.md`, `.context/reviews/07-security.md`, `.context/reviews/wip-auth-security.md`, `.context/reviews/wip-judge-sandbox.md`, `.context/reviews/wip-api-routes.md`, `docs/exam-integrity-model.md`, `docs/admin-security-operations.md`.

---

## Verdict for stated use cases

- **Recruiting coding tests: NO-GO** — anti-cheat is client-side telemetry only and any candidate who knows curl can submit verdicts the proctor cannot distinguish from a focused honest session; combined with `userId` cross-referencing, leaked admin identity, and the lack of MFA on instructor accounts, hiring decisions made on this platform are not defensible.
- **Student assignments (low stakes / homework): GO-WITH-CAVEATS** — the platform is fine for ungraded practice and honor-system homework; the sandbox is well-engineered for code execution. Any course where the assignment counts toward a grade should disable AI tooling out-of-band and rely on human review of submission patterns, not the in-product anti-cheat.
- **Student exams (high-stakes, proctored): NO-GO** — `docs/exam-integrity-model.md` already concedes this is "integrity telemetry, not proctoring"; the architecture cannot enforce that submissions originate from the monitored browser session. Use Safe Exam Browser / lockdown proctoring out-of-band, never trust the in-app heartbeat as evidence.
- **Programming contests (closed-source, internal): GO-WITH-CAVEATS** — the judge sandbox, scoring, leaderboard, and queue mechanics are solid for an honor-system contest. For public open-internet contests the unauthenticated `/api/v1/problems/[id]/accepted-solutions`-style endpoints (now auth-gated), the SSE per-user limits, the single judge worker, and the `SUBMISSION_GLOBAL_QUEUE_LIMIT=100` ceiling are operational risks at scale; not security failures, but they will hurt you on contest day.

The platform is materially better than typical self-hosted OJs on cryptography, CSRF, ORM use, and judge sandbox layering. The categorical failures are (a) anti-cheat philosophy, (b) several known sidecar/auth gaps that are documented but unfixed in production, and (c) information-leak / UX bugs that would make a prospective enterprise/hiring-team customer walk away on first impression.

---

## Summary findings

| ID | Severity | Title | Location | One-line exploit | One-line fix |
|---|---|---|---|---|---|
| F1 | CRITICAL | Submissions accept curl-only requests with no anti-cheat heartbeat correlation | `src/app/api/v1/submissions/route.ts:166-200`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` | candidate `curl -H Cookie: ... -d {sourceCode}` submits and is judged identically to a focused-window candidate | server must reject submissions for `examMode!=none` unless a valid live anti-cheat session is active |
| F2 | CRITICAL | `/api/metrics` returns `503 {"error":"CRON_SECRET not configured"}` in production | `src/app/api/metrics/route.ts:33` (live: 503 with body) | unauth probe confirms `CRON_SECRET` is missing → admin metrics endpoint is unreachable AND the env var name leaks AND the operator never noticed | set `CRON_SECRET` in `.env.production` or return 404 when not configured |
| F3 | HIGH | Sidecar auth tokens are optional with a warning log; production compose passes empty defaults | `code-similarity-rs/src/main.rs:172`, `rate-limiter-rs/src/main.rs:388`, `docker-compose.production.yml:158,177` | any container on the Docker network calls `/check`, `/record-failure`, `/compute` and DoSes the rate limiter or burns CPU on similarity | make `*_AUTH_TOKEN` mandatory in production builds; reject on missing |
| F4 | HIGH | Playground returns 500 on shape-mismatch input | live: `POST /api/v1/playground/run {language,code,stdin}` → 500 (probe B2) | leaks an unhandled error path; mass-fuzz of public endpoints flips all of them to 500 | wrap `safeParse` failure into 400 response inside `createApiHandler` |
| F5 | HIGH | Super-admin username + role disclosed on public `/rankings` | probe B3, `src/app/rankings/*` rendering | attacker harvests admin username + affiliation from anonymous internet, knows exactly who to phish | exclude `super_admin`/`admin` from public leaderboard, render only display name |
| F6 | HIGH | Worker compose defaults BUILD/POST/DELETE to "0" but uses `${VAR:-0}`; an operator who sets `WORKER_DOCKER_PROXY_BUILD=1` for a one-off rebuild will never reset it | `docker-compose.worker.yml:23-27` | env-driven escalation footgun → BUILD=1 in worker means a compromised worker container can build & run arbitrary images via socket proxy | hardcode `BUILD=0`, `DELETE=0` and require an explicit override file |
| F7 | HIGH | Compile-phase memory swap up to 4 GiB is allowed by default | `judge-worker-rs/src/docker.rs:266-271` (`(mem_limit*2).min(4096)`) | one submission with a malicious build (e.g., infinite-template-instantiation in C++/Rust) consumes 4 GiB of swap and starves the host | cap compile swap at the configured `mem_limit`, special-case JVM/.NET only |
| F8 | HIGH | `/api/v1/recruiting/validate` is unauthenticated POST with only IP-based rate limit; no CSRF, no token-bound throttle | `src/app/api/v1/recruiting/validate/route.ts:9-14` | rotating-proxy attacker brute-forces 256-bit tokens? infeasible by length, but the endpoint can be used as a public oracle to confirm assignment IDs | per-token rate limit and CSRF; better, change to GET with the token in path |
| F9 | HIGH | `dockerfilePath` validation accepts `Dockerfile.app` etc. via DB-config language entries | `src/lib/docker/client.ts:159-163` | TS path is `startsWith("docker/Dockerfile.")` (anchored, post-fix b2b07edd), but admin-controlled `dockerfilePath` in DB rows is still arbitrary within `docker/Dockerfile.*` namespace; recent fix anchors prefix but does not enforce `judge-` infix that the Rust validator does | TS validator should additionally require `judge-` prefix after `Dockerfile.`, matching `judge-worker-rs/src/validation.rs:63` |
| F10 | HIGH | Single-shared-token for judge claim path when worker has no `secretTokenHash` | `src/lib/judge/auth.ts:84-90` falls back to `JUDGE_AUTH_TOKEN` | leak of one shared token = ability to claim any submission, see source + test cases, submit fabricated AC | enforce per-worker tokens at registration; remove the shared-token fallback in production |
| F11 | MEDIUM | In-memory rate limiter resets on every Next.js process restart | `src/lib/security/in-memory-rate-limit.ts:30` | crash-loop the app (e.g., via a known 500 path) and reset login rate limit between restarts | use the DB-backed rate limiter as the authoritative store everywhere, not just for fast paths |
| F12 | MEDIUM | Anti-cheat heartbeat throttled to 60s server-side; 120s gap threshold | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:98,213` | candidate spoofs a heartbeat every 119s while solving on a second device | reduce client→server heartbeat to ≤30s + use server-derived nonces |
| F13 | MEDIUM | `/api/v1/health` 401 vs `/api/health` 200 — naming inconsistency exposes which auth surface is which | live probe + handler routing | low-impact fingerprinting; informational | unify under one path |
| F14 | MEDIUM | `style-src 'unsafe-inline'` enables CSS exfil via attribute selectors in user-rendered Markdown (problem statements, community threads) | `src/proxy.ts` CSP, `src/lib/security/sanitize-html.ts` | a malicious instructor / community post leaks visited-link or attribute-based data via background-image URLs allowed by `img-src self data: blob:` (note: external URLs blocked by `connect-src self`) | tighten with hashed inline styles or replace `unsafe-inline` with `nonce-` for styles |
| F15 | MEDIUM | `/api/metrics` env-var name leak (`CRON_SECRET not configured`) | `src/app/api/metrics/route.ts:33` | tells attacker an env var exists and was forgotten — paired with F2 | return 404 when not configured; log internally |
| F16 | MEDIUM | DB backup full-fidelity export still leaks `secretTokenHash` and `recruitingInvitations.tokenHash` | `src/lib/db/export.ts:255-262` | full-fidelity backup leak → attacker can spend offline cycles cracking 32-byte SHA-256 hashes (slow but feasible for short tokens) and forge worker auth | ALWAYS_REDACT should also include `secretTokenHash`, `tokenHash`, `judgeClaimToken` |
| F17 | MEDIUM | Anti-cheat events POST has no authentication (uses `createApiHandler` defaults — `auth: undefined` defaults to true, but the POST body validates only the type, not the existence of an active exam window beyond contest start/end) | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:34-118` | logged-in candidate can backfill heartbeats for any contest they're enrolled in; details/userAgent stored verbatim from candidate input | bind events to a server-issued exam-session token, validate freshness window |
| F18 | MEDIUM | LaTeX rendering via `rehype-katex` accepts arbitrary nesting; KaTeX's strict mode is not asserted from a quick code review | problem statements rendered with `react-markdown` + `rehype-katex` | malicious instructor crafts deeply nested `\hbox{\hbox{...}}` to DoS server-side render; not blocked by Markdown sanitizer | enable KaTeX `strict: true` and `maxExpand` cap |
| F19 | MEDIUM | Code similarity Jaccard threshold catches structural copy but is trivially defeated by AI-generated submissions | `src/lib/assignments/code-similarity.ts` | two candidates using ChatGPT for the same problem produce non-similar output; platform records "no match" | document this honestly in the recruiting/exam UI; do not represent similarity score as proof of integrity |
| F20 | MEDIUM | hCaptcha `hostname` and `challenge_ts` not validated | `src/lib/security/hcaptcha.ts:42-85` (per `wip-auth-security.md`, unfixed) | replay of a token harvested from another domain using same site key | validate `hostname` and `challenge_ts` from response body |
| F21 | MEDIUM | Password policy rejects only length<8; ignores `context` | `src/lib/security/password.ts:13-14` | username `admin1234` + password `admin1234` accepted; recruiting-auto-generated passwords are strong but operator-set passwords are not | implement the (already-stubbed) context check: reject password containing username/email prefix |
| F22 | MEDIUM | `AUTH_CACHE_TTL_MS` accepts any operator value with no upper cap | `src/proxy.ts:25` | operator typo `AUTH_CACHE_TTL_MS=3600000` = 1h window after a deactivated user retains access | clamp to ≤10s |
| F23 | MEDIUM | No MFA / TOTP for admin/instructor accounts; password-only auth on the only role that can leak test cases, scores, and PII | `src/lib/auth/config.ts` credentials provider | recruiter laptop compromise = full instructor takeover, no second factor | add TOTP for `admin`, `super_admin`, `instructor`, and any custom role with `submissions.view_all` or `system.settings` |
| F24 | LOW | Rust `MAX_RUNNER_BODY_BYTES = 4 MiB` is generous for compile/run requests but matches the source-code limit | `judge-worker-rs/src/runner.rs:26,867` | minor — adequate, just wider than the validation cap | tighten to 1 MiB (source 256 KB + stdin 64 KB + JSON overhead) |
| F25 | LOW | Workspace `0o777` permission during compile | `judge-worker-rs/src/executor.rs:238-255` (per WIP review) | another process on host could read in-flight compile artifacts; risk low because tempdir name is unpredictable | 0o755 with a 0o777 child output dir |
| F26 | LOW | IPv4-only IP allowlist (no IPv6 CIDR) | `src/lib/judge/ip-allowlist.ts:50-68` | a worker on IPv6 can only be matched exactly, not via CIDR | add IPv6 CIDR support |
| F27 | LOW | Pagination `MAX_PAGE=10000` enables expensive offset queries | `src/lib/api/pagination.ts` | `?page=10000&limit=100` issues 999,900-row scan; can be repeated per endpoint | lower cap, prefer cursor pagination on hot paths |
| F28 | LOW | `dockerfilePath` after the b2b07edd fix is anchored, but TS still allows `Dockerfile.app`/non-judge filenames if such files ever appear in `docker/` | `src/lib/docker/client.ts:159-163` | constrained by deployment hygiene, not code | match the Rust validator's `judge-` infix requirement |
| F29 | LOW | No `/.well-known/security.txt` | live probe | reporters cannot find a contact | add a file linking to a security@ mailbox |
| F30 | INFO | `/submissions` public-link leads to an authenticated-only page with no public feed | probe B4 | UX bug; matters for impressions, not security | move link into the auth sidebar or build a public feed |
| F31 | INFO | Practice catalog mixes Korean/English by default | probe B5 | non-Korean candidate impression | per-locale title + translation toggle |

(Severity scale: CRITICAL = stop-ship for any high-stakes use; HIGH = address before recruiting/exam launch; MEDIUM = address within next sprint; LOW = backlog; INFO = quality.)

---

## Detailed findings

### F1 — CRITICAL: submissions accept curl-only requests with no anti-cheat correlation

**Where**
- `src/app/api/v1/submissions/route.ts:166-300+` — POST handler validates problem access, language, source-code length, and (if `assignmentId` is set) `validateAssignmentSubmission` for window/exam-session integrity.
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` — events are POSTed by the browser and stored in `antiCheatEvents`.
- `src/lib/assignments/submissions.ts` (LEFT JOIN exam_sessions in scoring) — exam sessions are observed for *scoring*, not for *origin verification* of the submission.

**Evidence**
1. The submission POST does not consult `antiCheatEvents`; it only consults `examSessions` for personal-deadline checks.
2. The anti-cheat heartbeat throttle is 60s (`route.ts:98`) and the gap threshold is 120s (`route.ts:213`).
3. `docs/exam-integrity-model.md` explicitly says: "JudgeKit currently uses an integrity telemetry model, not a full proctoring model."

**Why this is exploitable in practice**
A candidate with a JS-disabled second tab, a curl alias, or a one-line userscript:
```
curl https://algo.xylolabs.com/api/v1/submissions \
  -H "Cookie: __Secure-authjs.session-token=…" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Content-Type: application/json" \
  -d '{"problemId":"...","language":"python","sourceCode":"<ChatGPT-generated>","assignmentId":"..."}'
```
…submits a problem in zero browser-time, and the SSE event stream / submissions table records it as a normal entry. The optional anti-cheat heartbeats — if the candidate also kept a tab open on a decoy device — show "no tab switch, no copy/paste, no blur." A reviewer sees a perfectly clean session with a 100% score.

The "exam_session.personal_deadline" check that does run can be satisfied by simply having entered the exam page once at the start.

**Impact for use cases**
- Recruiting: a candidate cheating with a second device produces an indistinguishable record. Hiring decision is built on a falsified data trail.
- High-stakes exams: same — the platform documents this weakness in the integrity model. It is a known architectural ceiling.
- Honor-system practice: no impact (no integrity claim made).

**Fix**
- Bind submission ingestion to a server-issued, short-lived exam-window token rooted in the same browser session that opens the exam page; verify the token's last-known heartbeat is within 30 s when `assignment.examMode != "none"`.
- Reject `submissions.create` when the user is in an exam window with anti-cheat enabled and the most recent heartbeat for that user/assignment is older than (e.g.) 60 s.
- Mention in the recruiting/exam UI that the platform is honor-system-grade unless paired with Safe Exam Browser or live human proctoring; do not represent green heartbeats as integrity proof.

---

### F2 — CRITICAL: `/api/metrics` is broken in production

**Where**
- `src/app/api/metrics/route.ts:11-37`
- Live: `curl https://algo.xylolabs.com/api/metrics` → `503 {"error":"CRON_SECRET not configured"}`

**Evidence**
The production deployment has no `CRON_SECRET` set, so the route falls through to the missing-secret branch and returns 503 to anonymous traffic. This means:
1. Operator monitoring relying on `/api/metrics` (Prometheus scrape, etc.) is silently broken.
2. The error body discloses the configuration mistake by env-var name.

**Impact**
- Confidentiality: env-var name leak (low).
- Operational: the platform's metrics surface is unreachable; operators discovered no anomalies because the scrape is broken.
- Integrity: none directly, but a broken metrics surface is exactly the path you want closed during an incident.

**Fix**
1. Set `CRON_SECRET` in `.env.production` and `docker-compose.production.yml` (validated at startup via `instrumentation.ts`).
2. When `CRON_SECRET` is missing, return 404 (or 401), never 503 with the env-var name in the body.
3. Document this in `docs/admin-security-operations.md`.

---

### F3 — HIGH: sidecar auth tokens optional in production

**Where**
- `code-similarity-rs/src/main.rs:164-175` — token loaded from `CODE_SIMILARITY_AUTH_TOKEN`; if missing, logs a warning, allows unauthenticated requests.
- `rate-limiter-rs/src/main.rs:380-390` — same pattern for `RATE_LIMITER_AUTH_TOKEN`.
- `docker-compose.production.yml:158,177` — both env vars are passed with `${VAR:-}` defaults (empty string accepted).

**Evidence**
`docker-compose.production.yml:153-184`:
```yaml
- CODE_SIMILARITY_AUTH_TOKEN=${CODE_SIMILARITY_AUTH_TOKEN:-}
...
- RATE_LIMITER_AUTH_TOKEN=${RATE_LIMITER_AUTH_TOKEN:-}
```
There is no startup gate that fails the deployment when these are empty. If an operator forgets them, both sidecars run open on the Docker network. While the network is isolated to the compose project, any other container on the host (a future plugin, a sidecar deploy of `pgadmin`, etc.) can reach them.

**Impact**
- Code similarity exposed: any process on the network can submit `/compute` payloads, exhaust CPU; can read responses (but not arbitrary data, just similarity output).
- Rate limiter exposed: any process on the network can call `/check` to consume rate-limit quota for an arbitrary key (e.g., consume the login attempts for `admin@…`), or call `/record-failure` to lock out a user; if `RATE_LIMITER_ENABLE_RESET=true`, also `/reset`.

**Fix**
- Make the sidecar tokens required in production startup (fail fast on empty).
- In `docker-compose.production.yml`, change `${VAR:-}` → `${VAR:?must be set}`.
- Audit `instrumentation.ts` to assert these are present when `NODE_ENV=production`.

---

### F4 — HIGH: playground 500 on shape-mismatch input

**Where**
- Live: `POST /api/v1/playground/run` with the README-documented shape `{language, code, stdin}` → 500 Internal Server Error (probe B2).
- `src/app/api/v1/playground/run/route.ts:13-22` expects `{language, sourceCode, stdin}`.
- Probe also confirms guest "no sign-in required" copy is false: requires `content.submit_solutions` capability.

**Evidence**
The Zod schema validates `sourceCode` (camelCase) but the user-facing docs and the homepage marketing copy advertise the playground as guest-accessible. The error path in `createApiHandler` should map a `safeParse` failure to 400 with `validationError`, but the live response is 500 (indicating an unexpected throw earlier in the pipeline, possibly during the Zod-error message extraction).

**Impact**
- Confidentiality: low — but blanket 500 hides everything from operators and from honest users; in production a 500 is also the easiest signal for a fuzzer that they've found an interesting path.
- Reputational: the homepage promises "no sign-in required" and the API rejects guests; combined with the 500-on-bad-shape, the first-impression for a recruiter is a broken product.

**Fix**
1. Either implement a true guest playground (heavily rate-limited, no DB writes) or remove the "no sign-in required" copy.
2. Make the Zod-error-to-400 path bulletproof in `createApiHandler` so shape errors never surface as 500s.
3. Consider responding to the legacy `code` field as an alias for `sourceCode` (deprecation warning) until docs are updated.

---

### F5 — HIGH: super-admin disclosure on `/rankings`

**Where**
- Probe B3 / `screenshots/` — `/rankings` shows `admin` user with "Super Admin" in Name column, "Diamond" tier, and Affiliation publicly.
- Server-rendered page presumably reads `users` joined with score data without filtering by role.

**Impact**
- Active reconnaissance: an attacker now knows the literal username (`admin`) of the highest-privileged account, the rough activity profile, the affiliation, and (via tier) approximate engagement.
- Phishing surface: a recruiter or instructor who lands on `/rankings` from a typo'd URL will see staff accounts mixed with student accounts.
- For a recruiting platform, exposing your own super-admin's name to candidates is a brand failure.

**Fix**
- Exclude `super_admin`, `admin`, and any role with `system.settings` capability from public leaderboards.
- Render only `displayName` (never `role`) on public lists.
- Add a `users.list_publicly: boolean` flag on the user record so individuals (especially staff) can opt out.

---

### F6 — HIGH: worker compose env-driven escalation footgun

**Where**
- `docker-compose.worker.yml:23-27`:
```yaml
- CONTAINERS=1
- IMAGES=${WORKER_DOCKER_PROXY_IMAGES:-0}
- BUILD=${WORKER_DOCKER_PROXY_BUILD:-0}
- POST=${WORKER_DOCKER_PROXY_POST:-0}
- DELETE=${WORKER_DOCKER_PROXY_DELETE:-0}
```

**Evidence**
The defaults are correct (0). However, dedicated worker hosts that ever need to rebuild a language image (`docker compose -f docker-compose.worker.yml exec docker-proxy …`, or just setting `WORKER_DOCKER_PROXY_BUILD=1` for a one-off build) will leave that variable in their shell history, .env, or systemd unit. That is exactly how the bug class "compromised worker has BUILD=1" emerges, and the WIP review flagged this in 2026-04-18.

**Impact**
If `BUILD=1` is set: a compromised judge worker container builds and runs an arbitrary image via the socket proxy, which (with the proxy running as root on the host) yields effective host-root.
If `DELETE=1` is set: same worker can rm production containers.

**Fix**
- Hardcode `BUILD=0`, `DELETE=0`, `POST=0`, `IMAGES=0` in the compose file.
- Move "build language images on worker" to a separate, explicitly-invoked workflow (e.g., a `docker-compose.worker-build.yml` overlay that the operator must `-f` in).
- Add a runtime check on the worker process: if it sees `BUILD=1` reflected in the proxy's `/info` response, log a HIGH warning.

---

### F7 — HIGH: compile-phase swap up to 4 GiB

**Where**
- `judge-worker-rs/src/docker.rs:266-271`:
```rust
"--memory-swap".into(),
if options.phase == Phase::Compile {
    const MAX_COMPILE_SWAP_MB: u32 = 4096;
    format!("{}m", (mem_limit * 2).min(MAX_COMPILE_SWAP_MB))
} else {
    format!("{}m", mem_limit)
},
```

**Evidence**
For a default `mem_limit` of 256 MB the compile container can use up to 512 MB of total memory+swap; for a 1 GB limit, up to 2 GB; for 2+ GB, capped at 4 GB. This was recently lowered from the 4× swap noted in earlier WIP reviews, but 2× with a 4 GB ceiling still allows a malicious source file (e.g., infinite-template-instantiation in C++ or compile-time-recursive Rust macros) to drive 4 GB of swap on the host.

**Impact**
- Worker host memory pressure / OOM cascading to other concurrent submissions.
- On a small worker (4 GB total RAM, single instance), one malicious compile can starve everything else.

**Fix**
- Default compile swap = `mem_limit` (no extra). Special-case JVM/.NET via per-language config rows that explicitly opt into a documented multiplier.
- Cap absolute compile swap at `min(2*mem_limit, 1024)` MB unless the host runtime check confirms more is available.

---

### F8 — HIGH: recruiting-validate is unauthenticated POST oracle

**Where**
- `src/app/api/v1/recruiting/validate/route.ts:9-68` — anonymous POST, IP-based rate limiting only, no CSRF, no token-bound throttle.
- Live probe: `POST /api/v1/recruiting/validate` returns 401 without rate-limit headers; the route file wraps the whole flow with `consumeApiRateLimit(req, "recruiting:validate")` per IP.

**Evidence**
The endpoint hashes the candidate-supplied token and looks up the row. It returns a uniform `{valid: false}` on any error, which is good. But:
1. No CSRF check — a cross-origin form on an attacker-controlled site can have a victim's browser issue this POST. Combined with the uniform response, the attacker could not learn validity from the victim, but they could use the browser as a proxy to consume the IP's rate-limit budget.
2. No per-token rate limit — if an attacker has a partial-token guess, the IP rate limit is the only ceiling. With 256-bit tokens this is infeasible, so impact is low.
3. The schema (`validateRecruitingTokenSchema`) is checked but the endpoint sits outside `createApiHandler`, so inconsistencies (no `Sec-Fetch-Site` validation, no `X-Requested-With` check) accumulate.

**Impact**
- Real exploit value is limited (token brute force is infeasible).
- The endpoint is a confirmed source of operational complexity and inconsistency. Future additions to this code path will accumulate gaps.

**Fix**
- Migrate to `createApiHandler({auth: false, rateLimit: …, schema: …})`.
- Or convert the endpoint to GET with token-in-query (idempotent, cacheable, aligns with REST semantics).
- Add per-token throttling via the DB-backed rate limiter (key by `tokenHash` prefix).

---

### F9 — HIGH: dockerfilePath validator divergence

**Where**
- `src/lib/docker/client.ts:159-163`:
  ```ts
  if (!dockerfilePath.startsWith("docker/Dockerfile.")) return … ;
  if (/\.\.|[/\\]/.test(dockerfilePath.slice("docker/Dockerfile.".length))) return …;
  ```
- `judge-worker-rs/src/validation.rs:63-69`:
  ```rust
  pub fn validate_dockerfile_path_for_build(path: &str) -> bool {
      path.starts_with("docker/Dockerfile.judge-")
          && !path.contains("..")
          && path.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
  }
  ```

**Evidence**
- Recent commit b2b07edd anchored the prefix, fixing the obvious `xdocker/Dockerfile.test` bypass.
- However, the TS validator allows `docker/Dockerfile.foo` for any `foo` — including `Dockerfile.app` or hypothetical `Dockerfile.production`. The Rust validator enforces a `judge-` infix.

**Impact**
- Today: low. The `docker/` directory only contains `Dockerfile.judge-*` files in the repo.
- Tomorrow: a developer who adds `docker/Dockerfile.proxy` for any reason inadvertently widens the admin-attacker surface, since admin-controlled DB rows ultimately drive `dockerfilePath`.
- An admin (compromised or malicious) can already invoke `docker build -f docker/Dockerfile.<anything>`. With the worker's BUILD=0 setting (F6 default), the local build path is what matters; that runs as the app container's user with image-build privileges (`buildDockerImageLocal` invokes `docker` directly on the host socket via the proxy).

**Fix**
Make the TS validator strictly match the Rust one:
```ts
if (!dockerfilePath.startsWith("docker/Dockerfile.judge-")) return ...;
if (!/^[A-Za-z0-9._/-]+$/.test(dockerfilePath)) return ...;
if (dockerfilePath.includes("..")) return ...;
```

---

### F10 — HIGH: shared-token fallback for unknown workers

**Where**
- `src/lib/judge/auth.ts:84-90`:
```ts
// Worker not found: fall back to shared token
const expectedToken = getValidatedJudgeAuthToken();
if (safeTokenCompare(providedToken, expectedToken)) {
  return { authorized: true };
}
```

**Evidence**
This fallback is invoked when a request claims a `workerId` that doesn't exist in the DB. The intent is "first contact / migration"; the effect is that a leaked `JUDGE_AUTH_TOKEN` (from `.env.production`, from an operator's shell history, or from a backup) lets an attacker:
1. Call `/api/v1/judge/register` to create a worker row.
2. Once registered, call `/api/v1/judge/claim` to receive submissions including `sourceCode`, `testCases`, expected output, and language configs (per WIP review's `judge/claim/route.ts:292-304`).
3. Submit fabricated AC verdicts via `/api/v1/judge/poll`.

The `JUDGE_ALLOWED_IPS` allowlist is a meaningful mitigation here, but per `src/lib/judge/ip-allowlist.ts:78-83`, when `JUDGE_ALLOWED_IPS` is unset (the default), all IPs are allowed.

**Impact**
- Confidentiality: if shared token leaks, attacker reads test cases for every problem (private and public).
- Integrity: attacker can submit fake AC verdicts → grade tampering for student exams or recruiting tests.
- Availability: attacker can deregister real workers via `/api/v1/judge/deregister`.

**Fix**
1. Remove the shared-token fallback entirely. Require all workers to register first via a separate bootstrap path that uses a one-time admin-issued token; subsequent operations use only the per-worker `secretTokenHash`.
2. Ensure `JUDGE_ALLOWED_IPS` is configured in production and validated at startup.
3. Rotate `JUDGE_AUTH_TOKEN` and audit recent claim/poll/heartbeat traffic for anomalies.

---

### F11 — MEDIUM: in-memory rate limiter resets on restart

**Where**
- `src/lib/security/in-memory-rate-limit.ts:30` — `const store = new Map<string, RateLimitEntry>()`.

**Evidence**
The DB-backed limiter is authoritative for the most sensitive paths (login, recruit-token redemption, submission creation), but the in-memory limiter is used as a fast path for high-traffic endpoints. On every process restart its state is lost.

**Impact**
- Crash-loop the Next.js process via a known 500 path (e.g., F4) and reset the in-memory rate-limit budgets between restarts.
- Combined with a known 500 surface, an attacker can stage a brute-force attempt with arbitrarily many "fresh starts."

**Fix**
- Migrate all sensitive rate limits (login, password reset, recruit-token) to the DB-backed limiter exclusively.
- Use the in-memory limiter only for cheap "pre-filter" decisions; the DB-backed limiter remains authoritative.

---

### F12 — MEDIUM: anti-cheat heartbeat timing budget

**Where**
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:98` — server only persists one heartbeat row per 60s.
- Same file `:213` — gap detection threshold `120_000` ms.

**Impact**
A candidate who pings every 119 s while solving on a second device looks identical to a candidate who is focused. No server-side anomaly detection beyond gap-thresholding.

**Fix**
- Reduce the gap threshold to 60–90 s and the heartbeat throttle to ≤30 s.
- Add server-side anomaly detection: compare submission timestamps to claimed active periods; flag any submission that is the only event in a 5-minute window.
- Bind heartbeats to an exam-session token that the server issues on entry; reject heartbeats whose token is older than (e.g.) 60 s without a refresh.

---

### F13–F15 — MEDIUM: information disclosure / config-name leaks

- **F13:** `/api/v1/health` (401, requires auth) vs `/api/health` (200, public) is a low-grade fingerprinting surface. Unify under a single canonical path.
- **F14:** `style-src 'unsafe-inline'` is required by Tailwind/shadcn. Acceptable, but tracking attribute-selector exfil from rendered Markdown is on the radar. The current sanitize-html + react-markdown `skipHtml` pipeline blocks the typical vectors; the residual risk is malicious instructor-supplied CSS in problem statements, currently mitigated because Markdown rendering doesn't allow raw CSS.
- **F15:** `/api/metrics` body leaks env-var name. Combined with F2, fix both at once.

---

### F16 — MEDIUM: full-fidelity backups still leak hashed worker secrets

**Where**
- `src/lib/db/export.ts:255-262`:
```ts
const ALWAYS_REDACT: Record<string, Set<string>> = {
  users: new Set(["passwordHash"]),
  sessions: new Set(["sessionToken"]),
  accounts: new Set(["refresh_token", "access_token", "id_token"]),
  apiKeys: new Set(["encryptedKey"]),
  systemSettings: new Set(["hcaptchaSecret"]),
};
```

**Evidence**
The `SANITIZED_COLUMNS` set additionally redacts `judgeWorkers.secretTokenHash`, `judgeWorkers.judgeClaimToken`, and `recruitingInvitations.tokenHash`, but only when `sanitize: true` is passed. The default `streamDatabaseExport()` call from the backup route (per `backup/route.ts:90,100`) is full-fidelity, so a backup ZIP that escapes (laptop loss, S3 misconfig, email forward) carries all hashed worker secrets and recruiting token hashes.

While SHA-256 of a 32-byte cryptographically-random token is infeasible to brute force, hashed admin-controlled tokens (e.g., recruiting tokens made from `Recruit-{nanoid(16)}` per WIP review) have only ~95 bits of entropy. Combined with the exposed admin username (F5), this is a measurable leak.

**Impact**
- Forge a worker registration with a leaked `judgeClaimToken` plaintext (attacker would need to crack the SHA-256, infeasible).
- Forge a recruiting-token redemption (attacker would need to crack the recruiting-invitation hash; possible for short tokens given enough cycles).

**Fix**
- Move `secretTokenHash`, `judgeClaimToken`, and `recruitingInvitations.tokenHash` into `ALWAYS_REDACT`.
- Optionally encrypt the entire backup with a passphrase (per WIP, no current encryption).
- Add a backup-policy doc that mandates retention windows and storage encryption.

---

### F17 — MEDIUM: anti-cheat events trust client identity beyond user.id

**Where**
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:34-137` — event POST persists `eventType`, optional 500-char `details`, IP, UA at the moment of receipt.
- Schema validates only `eventType` and `details`.

**Evidence**
The endpoint is authenticated and gated by enrollment / contest token, which is correct. But:
1. There is no nonce or session-id binding — a candidate can replay heartbeats from any tab open to any contest.
2. The `details` field is stored verbatim from candidate input. No size or shape validation beyond `max(500)`.
3. There is no requirement that the heartbeat originate from the same IP/UA/session that submitted code in the same window.

**Impact**
A candidate can backfill heartbeats after the fact (within the contest window) by sending POSTs from a script — useful for filling gap detection, masking actual idle periods.

**Fix**
- Issue a per-exam-session server-signed token on contest entry; require it on every heartbeat.
- Reject heartbeats whose `Sec-Fetch-Site` or `Origin` is not the app's own origin.
- Add `userAgent`/`Sec-CH-UA` consistency check across heartbeats from the same session and flag mismatches.

---

### F18 — MEDIUM: KaTeX strict mode not asserted

**Where**
- Markdown pipeline: `react-markdown` + `remark-math` + `rehype-katex`.

**Evidence**
The DOMPurify config is strict, and `react-markdown` `skipHtml: true` is on, so HTML-injected XSS is blocked. KaTeX's default behavior, however, is permissive: complex `\href`, `\hbox`, deep nesting, and macro expansion can DoS the server-side render and balloon CPU.

**Impact**
A malicious instructor (or community-thread poster, if community supports LaTeX) submits a problem statement that takes seconds to render; for a contest with 100 candidates, the sum of renders becomes a DoS vector.

**Fix**
Configure rehype-katex with `strict: "warn"` (or `"error"`), set `maxExpand` (default 1000) lower, and time-bound the render call via an SSR timeout.

---

### F19 — MEDIUM: code similarity is structural-only

**Where**
- `src/lib/assignments/code-similarity.ts` (TS adapter) + `code-similarity-rs/src/main.rs:112-113` (Rust sidecar).

**Evidence**
- Jaccard n-gram similarity catches structural copying.
- Two candidates using the same LLM produce different output by design.
- A candidate who reorders variable declarations + adds comments + renames functions can cross the 0.85 threshold from "match" to "no match."

**Impact**
- Recruiting/exam: similarity score must not be presented as proof of integrity.
- Doctored code from AI assistants is invisible to this layer.

**Fix**
- Document explicitly in the recruiting/exam UI that similarity is structural-only.
- Add an AST-based similarity check (token-stream Jaccard, MOSS-style winnowing) as a second layer.
- Add post-hoc style-fingerprinting (per-candidate variable naming distribution) to flag style-drift between problems within the same contest.

---

### F20 — MEDIUM: hCaptcha hostname/timestamp not validated

Per `wip-auth-security.md` MEDIUM-03, unfixed. Replay risk for tokens harvested from another domain using the same site key. Fix: validate `hostname` matches expected origin, validate `challenge_ts` within a reasonable window.

---

### F21 — MEDIUM: password policy length-only

`src/lib/security/password.ts:13-14` only checks length. The `context` (username, email) parameter is accepted and ignored — the function signature was clearly designed for context-aware validation that was never implemented. Fix: implement the obvious context check, optionally add a small breached-password list (haveibeenpwned-style range query, or a top-10k bloom filter).

---

### F22 — MEDIUM: AUTH_CACHE_TTL_MS unbounded

`src/proxy.ts:25`:
```ts
const AUTH_CACHE_TTL_MS = (() => {
  const parsed = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10);
  // … no upper cap
})();
```
Operator typo `=3600000` (1 hour) creates a 1-hour window during which a deactivated user retains access. Clamp at 10 s.

---

### F23 — MEDIUM: no MFA for staff

- `src/lib/auth/config.ts` credentials provider supports password + recruit-token only.
- No TOTP / WebAuthn for `admin`, `super_admin`, or `instructor`.
- Recruiting platform staff have access to all candidate submissions, all test cases, and all PII.

**Fix**: TOTP via `otplib`, gated to roles with `system.settings`, `submissions.view_all`, or `users.manage` capability.

---

### F24–F27 — LOW

- **F24** runner body limit 4 MiB is generous; tighten to 1 MiB.
- **F25** workspace 0o777 during compile; use 0o755 with a 0o777 child output dir.
- **F26** IPv4-only allowlist; add IPv6 CIDR.
- **F27** `MAX_PAGE=10000` enables expensive offset queries; lower cap, prefer cursor pagination.

---

### F28 — LOW: dockerfilePath fix is partial

The b2b07edd anchor fix is correct for the obvious bypass; aligning with the Rust `judge-` infix requirement closes a future-proofing gap.

---

### F29 — LOW: missing `/.well-known/security.txt`

For a recruiting/exam platform that will be probed by red-teamers and prospective customers, a minimal security.txt with a contact mailbox costs nothing and meaningfully signals operational maturity. Live probe confirmed 404.

---

### F30 — INFO: `/submissions` public link → "please sign in"

Probe B4. Move the link into the auth sidebar or build a public submission feed.

---

### F31 — INFO: practice catalog mixes Korean/English

Probe B5. For a recruiting platform aimed at non-Korean candidates, a per-locale title field or translation toggle would prevent the first-impression failure of seeing "입출력" tag pills next to English problem titles.

---

## What is genuinely solid

This codebase is materially above the bar for a self-hosted OJ. Credit where due:

1. **Sandbox layering** — `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, `--user 65534:65534`, `--pids-limit 128`, `--memory`, custom seccomp profile (default deny), `--init`, 4 MiB output truncation, source-code length caps, atomic claim with `FOR UPDATE SKIP LOCKED`. The sandbox is multi-layered and competently engineered.
2. **Custom seccomp profile is in the repo and audited** — `docker/seccomp-profile.json` is a well-considered allowlist with a clear comment block explaining why network-family syscalls remain (containers run with `--network=none`, AF_UNIX is bounded by tempdir). `clone3` is correctly blocked (returns ENOSYS). Default action is `SCMP_ACT_ERRNO`. This addresses the WIP review's seccomp concern; it is a substantial improvement.
3. **Compile phase now uses the custom seccomp by default** — `judge-worker-rs/src/docker.rs:218-235`. Operators who genuinely need the default profile must opt in via `JUDGE_ALLOW_DEFAULT_COMPILE_SECCOMP`. This addresses prior critical concern.
4. **Per-worker secret tokens** — registration generates 32-byte random secret, stored as SHA-256 hash; `secretTokenHash` is the only column trusted for auth; deregister/heartbeat correctly use the hash; the previous "heartbeat compares plaintext" critical from WIP is fixed.
5. **Body-limit on Rust runner** — `MAX_RUNNER_BODY_BYTES = 4 MiB` with `DefaultBodyLimit::max()`, addressing the WIP critical.
6. **Argon2id with OWASP parameters** — memory 19 MiB, time 2, parallelism 1; transparent bcrypt → Argon2id migration on successful login.
7. **Anti-enumeration via `DUMMY_PASSWORD_HASH`** — login latency is constant regardless of user existence.
8. **JWT invalidation via `tokenInvalidatedAt`** — password change and forced logout invalidate all sessions; 2 s auth cache; negative results not cached.
9. **CSP with per-request nonces** — `script-src 'nonce-…'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Properly hardened beyond what most apps ship.
10. **Three-layer CSRF** — `X-Requested-With`, `Sec-Fetch-Site`, `Origin`/`Host`. API-key auth correctly skips CSRF. The DELETE handler in `files/[id]/route.ts` was previously inconsistent; the current code authenticates first and skips CSRF for API-key callers — fixed.
11. **Capability-based authorization** — granular capabilities (`submissions.view_all`, `system.settings`, `files.manage`, …) resolved from roles; custom roles supported via async resolution; effective API-key role is `min(key.role, creator.role)`.
12. **Atomic rate limiting with `SELECT FOR UPDATE`** — DB-backed rate limiter prevents TOCTOU; exponential backoff with cap.
13. **Drizzle ORM everywhere** — no string-interpolated SQL; raw SQL helpers use named-parameter mapping (`namedToPositional`); zero SQL-injection vectors visible.
14. **Zod validation on all `createApiHandler` routes** — ~80 of ~95 route files use the central handler factory; consistent auth, rate-limit, schema, error-handling.
15. **`createApiHandler` factory** — eliminates entire classes of bugs (mass-assignment, missing CSRF, missing auth, missing rate-limit). Where manual handlers exist (file delete/upload, overrides, problem-sets PATCH), they are flagged in WIP review.
16. **CSV formula injection prevention** — `escapeCsvCell` correctly prepends `'` to cells starting with `=`, `+`, `-`, `@`, `\t`, `\r`.
17. **ZIP bomb protection** — file uploads validate decompressed size and entry count.
18. **Image re-processing** — uploaded images are re-encoded to WebP, stripping EXIF and embedded payloads.
19. **Backup password re-confirmation** — `/api/v1/admin/backup` requires the operator's password before issuing a backup, even if the API key has `system.backup`.
20. **Production socket proxy locked down** — `docker-compose.production.yml:69-73` has `CONTAINERS=1, IMAGES=1, BUILD=0, POST=0, DELETE=0`. The worker compose is the regression risk (F6), not the production compose.
21. **Validate-host fail-closed** — `src/lib/auth/trusted-host.ts` with empty trusted-host list rejects in production.
22. **Audit events** — every state-changing operation records actor, action, resource, request context; backup/restore are audited.
23. **Recruiting validate returns uniform `{valid:false}` on any failure** — does not leak invitation status, expiration, or assignment details to anonymous callers.
24. **Image and Dockerfile validation in Rust** — `judge-worker-rs/src/validation.rs` enforces `judge-` namespace, no protocols, no path traversal, alphanumeric-only image refs.
25. **Per-request CSP nonces and HSTS** — production headers are clean; no source maps exposed in `_next/static`; no `.git/` exposed (live-checked).

---

## Top 10 must-fix before production use for stated cases

For "stated cases" = recruiting tests + student exams + contests, these are ranked by exploit impact × likelihood:

1. **F1 — Bind submission ingestion to live exam-session evidence** when `examMode != "none"`. Without this, recruiting decisions and exam grades are not defensible.
2. **F2 + F15 — Set `CRON_SECRET` in production** and fix the metrics route's behavior on missing config (404, not 503-with-env-name).
3. **F5 — Strip `super_admin`/`admin` from public `/rankings`.** This is a 30-minute fix and a brand-critical first impression.
4. **F23 — Add TOTP for `admin`, `super_admin`, `instructor`, and any custom role with `submissions.view_all` or `system.settings`.** Single-factor on the role that holds candidate PII and test cases is indefensible for a hiring product.
5. **F10 — Remove the shared-token fallback in `isJudgeAuthorizedForWorker`**, configure `JUDGE_ALLOWED_IPS`, and rotate the existing `JUDGE_AUTH_TOKEN`. Compromise of this token is the highest-impact technical incident path.
6. **F16 — Move `secretTokenHash`, `judgeClaimToken`, `recruitingInvitations.tokenHash` to `ALWAYS_REDACT`** in the export module. Backup leaks should not carry hashed worker secrets, even if cracking them is infeasible today.
7. **F3 — Make sidecar auth tokens mandatory** in production (`${VAR:?}` syntax in compose, validated at startup). This closes an entire side channel.
8. **F6 — Hardcode `BUILD=0`/`DELETE=0` in `docker-compose.worker.yml`**, move build flow to a separately-invoked overlay. Eliminates an env-var footgun.
9. **F4 — Fix the playground 500-on-bad-shape path** (Zod parse failure → 400) and reconcile the homepage "no sign-in required" copy with the actual access policy. Either build a true guest playground or remove the marketing claim.
10. **F12 + F19 — Tighten anti-cheat heartbeat budget to ≤30 s, document AI-bypass honestly in the recruiting/exam UI**, and add server-side anomaly detection for "submissions during claimed-idle windows." Acknowledge the architectural ceiling rather than imply integrity proof.

---

## Closing notes

The repository shows the artifacts of an engineer who has thought seriously about cryptography, sandbox design, ORM use, CSP, and rate limiting. The defects that remain cluster in two categories:

1. **Honest architectural ceiling** — anti-cheat is browser-event telemetry, full stop. The `docs/exam-integrity-model.md` already concedes this; the marketing surface and the recruiting-test pitch must concede it too. The right answer is "use this for honor-system, low-stakes; pair with Safe Exam Browser or human proctoring for high-stakes." Pretending otherwise will end with a single high-profile cheating incident burning the platform's reputation.
2. **Operational drift** — env-var defaults that fail open (sidecar tokens, CRON_SECRET), worker compose footguns (BUILD=1 toggle), forgotten production config (the live `503 CRON_SECRET not configured` is the smoking gun). These are not engineering flaws; they are deployment-discipline flaws. A 30-line `instrumentation.ts` startup gate that asserts every required production config — and refuses to start without them — would close most of these.

The platform is ready to ship for honor-system practice and internal contests. It is not ready to ship for hiring decisions or proctored exams without (a) the must-fix items above and (b) an honest accounting of the integrity model in user-facing copy.
