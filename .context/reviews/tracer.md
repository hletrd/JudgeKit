# Tracer Report — Cycle 5

Repo: `/Users/hletrd/flash-shared/judgekit` (Next.js 16 + Drizzle/PostgreSQL + Rust worker)
Head traced: `7ebea50e` (cycle-4 close). Cycles 1–4 = 53+ commits; cycle 4 = 11 commits `4d507dd3..7ebea50e`.
Method: OBSERVE → FRAME → competing hypotheses → evidence for/against → rebuttal → rank → probe.

This pass **regression-traces the four named cycle-4 fixes** (F-claim, F-snapshot, F-settings, F-int64) to confirm causal completeness, then **re-traces the deferred Phase B/C items** (C4-6, C4-7, NEW-M8) and hunts net-new flows. Convergence discipline: do not inflate polish — the cycle-4 fixes either hold or they do not, and the deferred items are either still bounded or they escalate.

---

## Summary verdict table

| Flow | Verdict | Confidence | Severity |
|------|---------|------------|----------|
| F-claim | Shared token CANNOT reach `buildClaimSql`/`sourceCode`/`testCases`. IP allowlist opt-in as documented | confirmed (mechanism certain) | CLOSED |
| F-snapshot | `snapshot:true` → empty redaction map → passwordHash/sessionToken survive. Single call site | confirmed | CLOSED |
| F-settings | Shared `requireSettingsReconfirm` gates BOTH writers before any mutation; `allowedHosts` in list | confirmed | CLOSED |
| F-int64 | Wire encoding + adapters round-trip int64 byte-identical; **authoring typed-editor still caps int at 2^53** (pre-existing v1 deferral) | confirmed (wire); confirmed (UI cap unchanged) | CLOSED (claimed scope) |
| C4-6 (deferred) | Roles PATCH TOCTOU unchanged — plain SELECT, no `WHERE level` guard. Still deferred | likely (mechanism) | LOW (concurrent admins) |
| C4-7 (deferred) | `resetRecruitingInvitationAccountPassword` still plain SELECT → full-metadata write. Cycle 5 did not touch | confirmed (mechanism) | LOW (~1 undercount, self-heals) |
| NEW-M8 (deferred) | ZIP-bomb slow path still allocates entry before per-entry length check. Still deferred | confirmed | LOW-MED (rare trigger, perm-gated) |
| N1 (net-new) | `/claim` audit `actorRole:"system"` despite per-worker attribution now being available | likely | LOW (observability) |
| N2 (net-new) | Pre-fix in-flight submissions stall 5 min on deploy (no `judgeWorkerId` → /poll 401) | confirmed | LOW (one-time, self-heals) |
| N3 (net-new) | `streamDatabaseExport({snapshot:true})` is a footgun for future callers | likely | LOW (single call site today) |

---

## F-claim — `/api/v1/judge/claim` shared-token rejection (cycle-4 A1+A2)

### Observation
POST `/claim` with `Authorization: Bearer <shared>` and no body. Cycle-4 plan claimed this now 400/401 BEFORE `buildClaimSql`/`sourceCode`/`testCases`. Confirm the fix is causally complete across every auth branch and every sibling route.

### Trace (claim/route.ts)
Order of gates on the POST path:

| # | Line | Gate | Behaviour with only `Authorization: Bearer <shared>`, no body |
|---|------|------|---|
| 1 | L136-138 | `isJudgeIpAllowed(request)` | Default-open unless `JUDGE_STRICT_IP_ALLOWLIST=1` or `JUDGE_ALLOWED_IPS` set. Passes. |
| 2 | L140-143 | `content-type` check | **Empty body usually omits `application/json` → 415 here.** If attacker sets the header with an empty body → continues. |
| 3 | L145-150 | `request.json()` | Empty body → throws → **400 `invalidJson`**. (Body `{}` parses.) |
| 4 | L151-154 | `claimRequestSchema.safeParse(raw)` | `.optional()` + `superRefine` (L106-128). Missing `workerId` → custom issue `workerIdRequired` → **400 `workerIdRequired`**. |
| 5 | L162-164 | `if (!workerId || !workerSecret)` | Defense-in-depth narrowing — also 400. |
| 6 | L177-180 | `isJudgeAuthorizedForWorker` | Per-worker only; shared Bearer NEVER compared. |
| 7 | L184-208 | worker exists + online + body-secret vs `secretTokenHash` | Double check (header Bearer + body workerSecret both hash to stored hash). |
| 8 | L219 | `buildClaimSql(...)` ← first point that could read sourceCode/testCases | **Unreachable** without steps 4-7 all passing. |

### Hypotheses

**H1 — "shared token still honoured somewhere on /claim."** Evidence AGAINST: `isJudgeAuthorized` (the shared-token check) is **imported only by `/register`** (`grep -rn "isJudgeAuthorized\b" src/` → `register/route.ts:5,31` exclusively). `/claim`, `/poll`, `/deregister`, `/heartbeat` all import `isJudgeAuthorizedForWorker`. The `else { if (!isJudgeAuthorized(request)) … }` fallback documented in the prior tracer (cycle-4 pre-state) is **deleted**. **Refuted.**

**H2 — "a sibling route still accepts the shared token."** Evidence AGAINST: traced every sibling:
- `/poll` (poll/route.ts:74-80): if `!submission.judgeWorkerId` → 401; else `isJudgeAuthorizedForWorker(request, submission.judgeWorkerId)`. Shared token not honoured.
- `/deregister` (deregister/route.ts:13-16,37-40): `deregisterSchema` requires `workerId`+`workerSecret`; `isJudgeAuthorizedForWorker`. Shared token not honoured.
- `/heartbeat` (heartbeat/route.ts:14-20,46-49): same shape as deregister. Shared token not honoured.
- `/register` (register/route.ts:31): **still** uses `isJudgeAuthorized` (shared token). This is the documented bootstrap-only path. **Refuted for operational routes; confirmed /register retains bootstrap behaviour by design.**

**H3 — "schema bypass via `.optional()` lets workerId sneak through as undefined."** Evidence AGAINST: `superRefine` (L109-128) fires a custom issue with message `workerIdRequired` whenever `!value.workerId`, and L153 returns `parsed.error.issues[0]?.message` as the 400 body. TypeScript-narrowing at L162-164 also rejects. **Refuted.**

### Rebuttal round
Best challenge to "F-claim is closed": even with shared token rejected, the **default-open IP allowlist** (`isJudgeIpAllowed` returns true when `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST != "1"`; ip-allowlist.ts:186-201) means the endpoint is reachable from anywhere, so the only backstop against a leaked *worker* secret is the per-worker hash. That is exactly the design (per-worker secrets ARE the auth), and cycle-4 A2 deliberately did NOT flip the default (the cycle-2 revert `23851d69` is the cautionary precedent). Warn-once at startup is the new mitigation.

The leader stands: the **F1 exfiltration blast radius is closed** for the shared token. The remaining network backstop is opt-in by the operator's choice, documented and warned.

### Conclusion
**Verdict: CLOSED.** A leaked `JUDGE_AUTH_TOKEN` cannot claim a submission or read `sourceCode`/`testCases` via any judge route. It can still register a worker (rate-limited at register/route.ts:40), but a registered worker alone cannot claim without a matching per-worker `secretTokenHash`. **Confidence: high (mechanism certain).**

### Evidence-by-file
- `src/app/api/v1/judge/claim/route.ts:106-128` — `claimRequestSchema` superRefine requires `workerId`.
- `src/app/api/v1/judge/claim/route.ts:162-180` — narrowing + per-worker auth ONLY.
- `src/lib/judge/auth.ts:26-35` — `isJudgeAuthorized` (shared) function body; not called by `/claim`.
- `src/lib/judge/auth.ts:52-97` — `isJudgeAuthorizedForWorker` rejects unknown workerId, mismatched hash, and missing-hash legacy.
- `src/lib/judge/ip-allowlist.ts:182-210` — opt-in strict mode + warn-once.
- Test evidence: `tests/unit/judge/auth.test.ts:143,154,162,175` — "rejects … without falling back to shared token" cases.

### Critical unknown (F-claim)
Operational: is `JUDGE_ALLOWED_IPS` (or `JUDGE_STRICT_IP_ALLOWLIST=1`) actually set on `worker-0.algo.xylolabs.com` / `algo.xylolabs.com`? If unset, the only network-layer backstop is absent. This is the same operational probe flagged in the cycle-4 tracer; cycle 5 did not change it.

### Discriminating probe (F-claim)
`grep -E 'JUDGE_ALLOWED_IPS|JUDGE_STRICT_IP_ALLOWLIST'` over the deploy env files (`.env.deploy.algo`, `.env.deploy.worv`, `.env.deploy.auraedu`) and the production compose. If empty, treat as the top operational action item — defence-in-depth is otherwise solely the per-worker hash.

---

## F-snapshot — `takePreRestoreSnapshot` retains passwordHash (cycle-4 A3)

### Observation
`takePreRestoreSnapshot` now passes `{ sanitize: false, snapshot: true }`. Confirm `passwordHash`/`sessionToken` survive to the output file, and no other call site accidentally bypasses redaction.

### Trace (export.ts + pre-restore-snapshot.ts)
```
takePreRestoreSnapshot (pre-restore-snapshot.ts:87-90)
  └─ streamDatabaseExport({ sanitize: false, snapshot: true })
       (export.ts:111-115)
       activeRedactionMap = options.snapshot
         ? {}                                    ← snapshot:true branch
         : options.sanitize
           ? mergeRedactionMaps(SANITIZED, ALWAYS)
           : EXPORT_ALWAYS_REDACT_COLUMNS;
       (export.ts:148-152)
       redactSet = activeRedactionMap[name];     ← undefined for every table
       redactSet?.has(col)                       ← undefined?.has → undefined (falsy) → NOT redacted
```
Result: every column of every table is normalized, never nulled. `passwordHash`, `sessionToken`, account tokens, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}` all SURVIVE.

### Hypotheses

**H1 — "snapshot:true retains passwordHash."** Evidence FOR: trace above. `grep -rn "snapshot: true" src/` returns exactly one hit (`pre-restore-snapshot.ts:89`). Behavioural test `tests/unit/db/pre-restore-snapshot.test.ts:85` asserts the call shape; source-grep test `tests/unit/db/export-sanitization.test.ts:148-150` asserts the call site passes `snapshot: true`. **Confirmed.**

**H2 — "a sibling export caller accidentally passes snapshot:true."** Evidence AGAINST: enumerated every `streamDatabaseExport` caller:
- `export-with-files.ts:172` — `streamDatabaseExport({ signal, dbNow })` (no snapshot). Redaction = `EXPORT_ALWAYS_REDACT_COLUMNS`. passwordHash redacted. ✓
- `admin/migrate/export/route.ts:84` — `streamDatabaseExport({ signal: request.signal, sanitize: !wantFull, dbNow })`. Redaction = ALWAYS or merged. passwordHash redacted in both branches. ✓
- `admin/backup/route.ts:100` — `streamDatabaseExport({ signal: request.signal, dbNow })`. Redaction = ALWAYS. passwordHash redacted. ✓

**Refuted.** Only the pre-restore snapshot path emits live secrets.

### Rebuttal round
Best challenge to "F-snapshot is closed": the snapshot is now **more sensitive** than a regular backup (it retains the live secret set), so its at-rest protection matters more. Mitigations traced: `createWriteStream(fullPath, { mode: 0o600 })` (pre-restore-snapshot.ts:93), `chmod(dir, 0o700)` best-effort (L70), partial-write cleanup on pipeline failure (L123), and prune-last-5 retention (L131-165). If `DATA_DIR` is a shared volume with relaxed ownership, the 0o600/0o700 guards are best-effort — but this is an ops concern, not a code defect, and pre-dates cycle 4.

### Conclusion
**Verdict: CLOSED.** passwordHash/sessionToken survive the snapshot. C4-1 fully resolved. **Confidence: high.**

### Net-new note (LOW, fragility)
The `streamDatabaseExport({ snapshot: true })` opt-out is a soft contract. Adding `snapshot: true` to any of the three sibling callers would silently leak the always-redacted secret set into a downloadable artifact. Today this is bounded (grep-confirmed single call site + comments at export.ts:104-110). A hardening pass would rename the option (e.g. `includeLiveSecrets`) or move it behind a separate function so a future contributor cannot flip it casually. **Severity LOW (no current leak).**

---

## F-settings — `updateSystemSettings({allowedHosts})` without `currentPassword` (cycle-4 A4)

### Observation
Both settings writers (server action + REST route) must reject `{allowedHosts: ...}` without `currentPassword`. Confirm the shared helper is the single source of truth and runs BEFORE any mutation.

### Trace (sensitive-settings.ts + both writers)

`SENSITIVE_SETTINGS_KEYS` (sensitive-settings.ts:19-54) includes:
`platformMode`, **`allowedHosts`** (L22), `publicSignupEnabled`, `emailVerificationRequired`, `signupHcaptchaEnabled`, `hcaptchaSiteKey`, `hcaptchaSecret`, `smtpPass`, community vote flags, `aiAssistantEnabled`, `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes`, the four `uploadMax*` ceilings, the rate-limit quartet, `submissionMaxPending`, `sessionMaxAgeSeconds`.

Server action (`system-settings.ts`):
```
L67  isTrustedServerActionOrigin()       → { success:false, error:"unauthorized" }
L71  auth()                              → unauthorized
L77  resolveCapabilities → system.settings → unauthorized
L82  rate limit
L85  systemSettingsSchema.safeParse
L100 requireSettingsReconfirm(input, session.user)  ← SHARED HELPER
L101 if (!reconfirm.ok) return { success:false, error: reconfirm.error };
L105 …destructuration…
L237 db.insert(...).onConflictDoUpdate(...)        ← first write
```

REST route (`settings/route.ts`):
```
L45  createApiHandler({ capabilities:["system.settings"], schema, handler })
L72  settingsReconfirmToResponse(await requireSettingsReconfirm(body, user))  ← SHARED HELPER
L75  if (reconfirmResponse) return reconfirmResponse;
L79  …
L166 db.insert(...).onConflictDoUpdate(...)        ← first write
```

Both helpers run BEFORE any DB write. The key list is sourced from the SAME module (`@/lib/security/sensitive-settings`), so the gate cannot drift.

### Hypotheses

**H1 — "the server action bypasses reconfirm."** Evidence AGAINST: `system-settings.ts:100-103` invokes the helper and short-circuits on `!reconfirm.ok`. The previous cycle-3 gap (action had NO reconfirm) is closed. **Refuted.**

**H2 — "the two writers disagree on the key set."** Evidence AGAINST: both import `SENSITIVE_SETTINGS_KEYS` transitively via `requireSettingsReconfirm` from the same module (sensitive-settings.ts). `system-settings.ts:13` imports `requireSettingsReconfirm`; `settings/route.ts:12-14` imports `requireSettingsReconfirm` + `settingsReconfirmToResponse`. Single source of truth. **Refuted.**

**H3 — "the partial-wipe bug from C4-N1 survives."** Evidence AGAINST: both writers now gate each field on `hasOwnInput` (system-settings.ts:140-235; route.ts:110-164). A PUT `{siteTitle:"x"}` no longer touches `hcaptchaSecret`/`publicSignupEnabled`/etc. **Refuted.**

**H4 — "an allowedHosts submission via the action without `currentPassword` succeeds."** Trace: `allowedHosts` is in `SENSITIVE_SETTINGS_KEYS` (L22) → `touchesSensitiveSettingsKey(input)` returns true → helper requires `currentPassword` → returns `{ ok:false, status:401, error:"passwordReconfirmRequired" }` → action returns `{ success:false, error:"passwordReconfirmRequired" }`. **Refuted.**

### Rebuttal round
Best challenge: the helper audits nothing on failure. A failed reconfirm attempt is a security signal (someone with a stolen session is probing privilege changes) and is silently dropped — no `recordAuditEvent*` on the failure arm. This is observability, not authorization. The gate itself is sound. **Minor residual noted as evidence of attempt, not a bypass.**

### Conclusion
**Verdict: CLOSED.** A stolen admin session cannot mutate any of the 25+ sensitive keys without the actor's password. **Confidence: high.**

### Evidence-by-file
- `src/lib/security/sensitive-settings.ts:19-54,81-110` — shared key list + helper.
- `src/lib/actions/system-settings.ts:100-103` — action gates before write.
- `src/app/api/v1/admin/settings/route.ts:72-77` — route gates before write.
- Test evidence: `tests/unit/api/admin-settings-reconfirm.test.ts` exists and is referenced by the plan.

### Critical unknown (F-settings)
None for the gate itself. The minor residual is failed-attempt audit visibility (LOW).

---

## F-int64 — `9223372036854775807n` wire round-trip (cycle-4 A5)

### Observation
Plan claimed int64 now round-trips byte-identical through encode → C++ strtoll → return → encode.

### Trace (serialization.ts + adapters)

**Encode side** (serialization.ts):
```
encodeArgs(args, params)              L89-101
  → params.map((p,i) => encodeJson(args[i], p.type))  L94
    → encodeScalar(v, "long")         L33-41
      → encodeIntLiteral(v)           L16-31
         bigint   → v.toString()       → "9223372036854775807"
         string   → /^\-?\d+$/.test    → verbatim
         number   → only if isSafeInteger  (throws otherwise)
```
Wire payload: `[…,"9223372036854775807",…]`. **No float coercion.**

**Adapter read side** (each adapter consumes an integer-only token, never `.`,`e`,`E`):
- C++ (cpp.ts:42-51): `readInt()` consumes sign + digits, then `std::strtoll(token, nullptr, 10)` → `9223372036854775807` (LLONG_MAX, in range). ✓
- Java (java.ts:78-86): `integerToken()` then `Long.parseLong(...)` → `9223372036854775807L`. ✓
- C# (csharp.ts:81-90): `IntegerToken()` then `long.Parse(..., CultureInfo.InvariantCulture)` → `9223372036854775807L`. ✓
- Go (go.ts:80-82,115): `var ${p.name} int64; __decode(raw, &${p.name})` — `encoding/json` decodes JSON number into int64 with full int64 precision. ✓
- Python (python.ts:31-33): `json.loads(sys.stdin.readline())` — Python `int` is arbitrary precision. ✓

**Adapter write side** (return value):
- C++ (cpp.ts:117): `writeVal(string&, long long v)` → `to_string(v)` → `"9223372036854775807"`.
- Java/C#: `Long.toString` / `long.ToString` invariant culture.
- Go: `json.Encode(int64)` marshals as decimal string.
- Python: `json.dumps(int)`.

**Expected-output encode side** (serialization.ts `encodeValue`):
- `encodeValue(9223372036854775807n, "long")` → `encodeScalar` → `encodeIntLiteral(bigint)` → `"9223372036854775807"`. **Byte-identical to the harness output.**

### Hypotheses

**H1 — "wire-level int64 round-trips byte-identical for cpp/java/csharp/go/python."** Evidence FOR: every adapter uses an integer-only token reader (no double coercion) and a decimal-form writer. `9223372036854775807n` (bigint) and `"9223372036854775807"` (digit string) both emit verbatim. The old `llround(stod(...))` / `Math.round(Double.parseDouble(...))` / `Math.Round(double.Parse(...))` paths are gone (grep-confirmed). **Confirmed.**

**H2 — "JS/TS adapters also round-trip."** Evidence AGAINST: JS/TS use `JSON.parse`/`Number`, which coerce through float64. Values > 2^53 lose precision. The plan A5 explicitly documented this: "JS/TS documented to Number.MAX_SAFE_INTEGER." This is a documented scope limit, not a regression. **Refuted for > 2^53; holds within safe-integer range.**

**H3 — "an author can actually create a test case with a value > 2^53 through the typed UI editor."** Evidence AGAINST: `value-fields.ts:71-77` `parseScalar("int"|"long")` rejects any value where `!Number.isSafeInteger(Number(trimmed))`, returning `fnValueIntOutOfRange`. The comment at `value-fields.ts:23-27` states: *"int/long authored values flow through JS Number … BigInt rework is deferred (out of v1 scope)."* So the typed editor **cannot produce** a stored input/expectedOutput with a value > 2^53. The bigint branch of `encodeIntLiteral` is unreachable through the UI. **Refuted as a functional path; the wire fix stands but its bigint branch is currently unreachable from the typed UI.**

**H4 — "the raw API path bypasses the typed editor and can store such values directly."** Evidence FOR: `problemTestCaseSchema` (`problem-management.ts:9-13`) types `input`/`expectedOutput` as plain `z.string()`. A direct API POST or import can store `input: "[9223372036854775807]"` and `expectedOutput: "9223372036854775807"` verbatim. Such a stored row, when judged, would round-trip byte-identical per H1. So the wire fix is **functionally useful** for API-authored/imported problems, just not reachable from the React typed editor. **Confirmed as the realistic reachability channel.**

### Rebuttal round
Best challenge to "F-int64 is closed": the cycle-4 plan claimed int64 correctness and shipped bigint-capable serialization + integer-only adapters, **but the authoring typed-editor still refuses values > 2^53**. Is the fix half-built?

Leader's response: the plan's claimed exit criterion was "an int/long value > 2^53 round-trips byte-identical through stdin→adapter→return for C++/Java/C#/Python/Go." That wire-level claim **holds**. The plan explicitly carved out JS/TS as safe-integer-only. The authoring-UI cap is a separate, pre-existing v1 scope deferral documented at `value-fields.ts:23-27`, not introduced or promised-to-be-fixed by cycle 4. The fix is causally complete **for its claimed scope**; lifting the UI cap is a different item.

The leader stands, but with an explicit scope label: **wire-level CLOSED; authoring-UI cap unchanged (pre-existing, deferred).**

### Conclusion
**Verdict: CLOSED for the wire-level claim (byte-identical round-trip for bigint/string int64).** Authoring-UX cap at 2^53 is a documented pre-existing deferral, not a regression. **Confidence: high (wire), high (UI cap unchanged).**

### Evidence-by-file
- `src/lib/judge/function-judging/serialization.ts:16-31` — `encodeIntLiteral` bigint/string/safe-number.
- `src/lib/judge/function-judging/adapters/cpp.ts:42-51,117` — `strtoll` + `to_string`.
- `src/lib/judge/function-judging/adapters/java.ts:78-86` — `Long.parseLong(integerToken())`.
- `src/lib/judge/function-judging/adapters/csharp.ts:81-90` — `long.Parse(IntegerToken(), InvariantCulture)`.
- `src/lib/judge/function-judging/adapters/go.ts:80-82` — int64 unmarshal.
- `src/lib/judge/function-judging/adapters/python.ts:31-33` — `json.loads` (arbitrary-precision int).
- `src/lib/judge/function-judging/value-fields.ts:23-27,71-77` — authoring cap.

### Critical unknown (F-int64)
Whether the platform ever expects authors to enter values > 2^53 through the UI. If yes, the value-fields.ts cap is a real product gap; if no (most competitive-programming problems use ints well under 2^53), the deferral is fine indefinitely.

### Discriminating probe (F-int64)
Decide product-side: are `long` problems with values > 2^53 in scope? If yes → extend `value-fields.ts:parseScalar` to accept digit-string input that bypasses `Number()` and store via `encodeIntLiteral`'s string branch. If no → leave as-is and document the cap in the problem-authoring guide.

---

## Re-trace of deferred Phase B/C items

### C4-6 — Roles PATCH TOCTOU (still deferred, unchanged)

`src/app/api/v1/admin/roles/[id]/route.ts` PATCH (L52-148):
- L59-63 plain `SELECT` of role (no `for("update")`).
- L94 read-time check `if (role.level > creatorLevel)` → 403.
- L121-124 UPDATE with `WHERE eq(roles.id, id)` — **no `level <= creatorLevel` guard in the WHERE clause.**

If, between read (L59) and write (L121), a second admin raises the target role's level above `creatorLevel`, the actor's edit (e.g. cap-strip) still lands on the now-higher role. Cycle 5 did not touch this code.

**Asymmetry vs DELETE** (L150-212): DELETE uses `execTransaction` + `for("update")` (L156-162) — properly locked. PATCH does not. The pattern to mirror is in-file.

**Probe resolution (carry-over N3 from cycle 4):** `getRoleLevel(roleName)` returns `-1` for unknown roles (`capabilities/cache.ts:115-124`). In the PATCH route this means `creatorLevel = -1` for an unmapped actor → `role.level > -1` is always true → **the L94 gate fails closed** (every role looks higher-level), blocking all edits rather than enabling escalation. The TOCTOU residual is therefore the only live concern; the floor-mapping concern is closed by fail-closed semantics.

- **Verdict:** likely (mechanism real); **severity LOW** (requires two admins on the same role in a tight window); **confidence high** (code-traced). Stays in Phase B/C as documented.

### C4-7 — `resetRecruitingInvitationAccountPassword` metadata clobber (still deferred, unchanged)

`src/lib/assignments/recruiting-invitations.ts:462-511`:
- L463 `getRecruitingInvitation(id)` — plain SELECT, no lock.
- L474-477 `nextMetadata = { ...invitation.metadata, [ACCOUNT_PASSWORD_RESET_REQUIRED_KEY]: "true" }` — built from the stale snapshot.
- L503-509 `tx.update(...).set({ metadata: nextMetadata, ... })` — writes the FULL object.

If an attacker's atomic `incrementFailedRedeemAttempt` (L96-109, uses `jsonb_set`) commits between L463 and L509, the counter is clobbered back to its snapshot value (under-count by ~1). Cycle 5 did not touch this writer. The sibling writers all use either `FOR UPDATE` (`updateRecruitingInvitation` at L401) or atomic `jsonb_set` (increment L105 / reset L134 / redeem-success L215) — only this reset path is the outlier.

- **Verdict:** confirmed (mechanism certain); **severity LOW** (rare admin action against an invitation under active brute-force; self-corrects on next increment; password is also being reset to random 32 bytes so candidate is forced to set a fresh one). Stays in Phase B/C as documented.

### NEW-M8 — ZIP-bomb slow path (still deferred, unchanged)

`src/lib/files/validation.ts:57-113` `validateZipDecompressedSize`:
- L66 caps `entries.length > 10000`.
- L73-88 **fast path**: reads `entry._data.uncompressedSize` from metadata (O(1)); per-entry cap 50 MB (L81); total cap (L85). Safe — no decompression.
- L97-107 **slow path** (rare: entries with data descriptors and no metadata size): `await entry.async("uint8array")` (L98) **allocates the full decompressed buffer in JSZip** BEFORE the per-entry length check at L100.

A single malicious entry with no metadata size that decompresses to >memory can OOM the process before L100 runs. The per-entry cap is therefore unreachable for the entry that triggers OOM. Bounded by: the rare-trigger case (data descriptors are uncommon), the 10000-entry cap, and that the upload path requires an authenticated user with upload permission.

- **Verdict:** confirmed (mechanism certain); **severity LOW-MED** (DoS, requires authenticated upload); **confidence high**. Stays in Phase B/C as documented.
- **Probe:** none needed; the fix is well-understood (streaming decompress with running-byte counter and abort-on-overflow, or cap the entry's `compressedSize` against a ratio heuristic before `async("uint8array")`).

---

## Net-new findings (cycle-5 tracing)

### N1 — `/claim` audit `actorRole:"system"` despite per-worker attribution being available (LOW)

`claim/route.ts:284-301` still records every claim as `actorRole:"system"`. The shared-token rejection means every claim is now attributable to a registered `workerId`, which IS present in `details.workerId` (L298) — but the audit row's `actorId`/`actorRole` fields still say "system." A leaked worker-secret burst is therefore harder to spot in audit dashboards that group by `actorId`.

Not a security regression — the worker IS a system actor — but the attribution granularity improved everywhere except the audit row's primary actor fields. **Severity LOW (observability).**

### N2 — Pre-fix in-flight submissions stall ~5 min on deploy (LOW)

With the shared-token fallback removed, `/poll` (poll/route.ts:74-80) hard-rejects any submission whose `judgeWorkerId` is null:
```
if (!submission.judgeWorkerId) return apiError("unauthorized", 401);
```
A submission that was claimed under the pre-fix shared-token path (no `judgeWorkerId`) and is still in `judging` when the deploy lands cannot be reported. It sits until the stale-claim timeout (default 300000 ms = 5 min per `register/route.ts:23`) clears `judgeClaimedAt`, after which a registered worker can re-claim via the normal path.

Bounded, one-time-per-deploy, self-healing. Worth noting in the deploy runbook. **Severity LOW.**

### N3 — `streamDatabaseExport({snapshot:true})` API shape is a footgun (LOW)

See F-snapshot rebuttal. The opt-out bypasses `EXPORT_ALWAYS_REDACT_COLUMNS` silently. Single call site today (grep-confirmed). Mitigation: rename the option to convey risk, or move behind a dedicated `streamDatabaseExportForSnapshot()` so a future contributor cannot flip it on the regular export path by mistake. **Severity LOW (no current leak).**

### N4 — Carry-over probe resolution: `getRoleLevel` unmapped-role behavior (CLOSED)

Prior tracer (cycle 4) flagged "confirm `getRoleLevel` behavior for unmapped actor roles" as next-probe for F-roles. Resolved by reading `capabilities/cache.ts:115-124`: returns `-1` for unknown custom roles, defaulting builtin roles to `DEFAULT_ROLE_LEVELS`. The F-roles PATCH gate (L84/L94) therefore **fails closed** for unmapped actor roles (every target role appears higher-level), preventing escalation. **Probe resolved; not a finding.**

---

## Premortem (where this trace would embarrass later)

- **F-claim:** the embarrassing failure would be a sibling judge route I missed (e.g. a debug/admin judge endpoint). I traced `/claim`, `/poll`, `/deregister`, `/heartbeat`, `/register` and grep-confirmed `isJudgeAuthorized` is imported only by `/register`. Embarrassment vector closed.
- **F-snapshot:** the embarrassing failure would be a second call site of `snapshot:true` I missed. Grep returns exactly one. Embarrassment vector closed (modulo the footgun N3).
- **F-settings:** the embarrassing failure would be a third writer that bypasses the shared helper. Only two writers exist (REST route + server action); both invoke the helper. Embarrassment vector closed.
- **F-int64:** the embarrassing failure would be (a) an adapter I missed that still uses double coercion, or (b) an authoring flow I missed that lets users enter >2^53 ints through the UI. (a) all six adapters verified; (b) typed editor caps at 2^53, raw API path is the only channel and it round-trips correctly. The honest residual is the UI cap, which is documented and pre-existing.

---

## Convergence / separation notes

- **Genuine convergence:** the four cycle-4 named flows (F-claim, F-snapshot, F-settings, F-int64) all reduce to "the fix was applied at the correct boundary and the test surface confirms it." No competing hypothesis survived for any of the four.
- **Genuine separation:** the three deferred items (C4-6, C4-7, NEW-M8) sound similar only in being "still deferred"; their mechanisms are distinct (TOCTOU vs snapshot-clobber vs OOM-before-cap) and require different fixes. Do not collapse them.
- **Scope labelling:** F-int64 is the only fix where the claimed scope and the realistic reachability diverge — wire CLOSED, authoring-UI cap unchanged. The label is explicit so the next cycle does not re-flag the UI cap as a regression.

---

## Recommended next probes (priority order)

1. **F-claim operational check (carry-over).** `grep -E 'JUDGE_ALLOWED_IPS|JUDGE_STRICT_IP_ALLOWLIST' .env.deploy.*` + production compose. If empty, the per-worker hash is the sole backstop against a leaked worker secret. This is the single highest-leverage operational action.
2. **F-int64 product decision.** Are `long` problems with values > 2^53 ever expected? If yes → lift the `value-fields.ts` cap and rely on `encodeIntLiteral`'s string branch. If no → document and stop.
3. **C4-7 fix lift.** Route `resetRecruitingInvitationAccountPassword` through `SELECT … FOR UPDATE` or set the reset flag via `jsonb_set` (preserving the counter). Cheap, removes the only stale-snapshot writer.
4. **C4-6 fix lift.** Push the level guard into the PATCH UPDATE's `WHERE` and check `rowCount`, mirroring DELETE's pattern. Closes the residual TOCTOU.
5. **N3 hardening.** Rename `snapshot:true` to `includeLiveSecrets:true` or move behind a dedicated function, so future contributors cannot silently flip the regular export into a secret-leaking artifact.

---

## What is *not* a finding (explicitly ruled out)

- F-claim sibling-route shared-token fallback — closed; deleted from all four operational routes; `/register` retains it by design.
- F-claim schema bypass via `.optional()` — closed; `superRefine` + narrowing both reject.
- F-snapshot sibling-caller leak — closed; only `pre-restore-snapshot.ts` passes `snapshot:true`.
- F-settings writer drift — closed; shared module is the single source of truth.
- F-int64 adapter double-coercion — closed; all six adapters use integer-only readers.
- F-roles floor-mapping concern (carry-over N3) — closed; `getRoleLevel` fails closed at `-1`.
- Worker cleanup bundle (cycle-4 A6) — verified; periodic sweep is `tokio::select!`-wrapped against shutdown and internally timeout-bounded; startup reap-all is one-shot before the main loop and force-removes only `oj-*` (safe at startup).
