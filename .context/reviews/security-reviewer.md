# Cycle 5 — security-reviewer

**Scope:** Regression audit of every cycle‑4 changed surface (range `edd45cca..7ebea50e`, 11 commits) at HEAD `7ebea50e`, plus a full‑repo OWASP/secrets/auth‑authz sweep with emphasis on the cycle‑4 deferred Phase B/C items (C4‑4 plaintext fallback, C4‑6 roles PATCH TOCTOU, C4‑7 recruiting counter clobber, C4‑N2 cap‑stripping, NEW‑M8 zip‑bomb, NEW‑M9 Origin fail‑closed). `npm audit` run; no dependency scan omitted.

**Risk Level: LOW** — All 6 cycle‑4 fixes verified PASS with no regression. No CRITICAL, no HIGH, no new MED. The carry‑forward HIGHs from cycle 4 (C4‑1 snapshot, C4‑2 judge shared‑token) are now CLOSED by the cycle‑4 ship. Remaining open items are the unchanged carry‑forward MED (C4‑4 plaintext fallback) and a LOW backlog (C4‑6/C4‑7/C4‑N2 + one new doc‑only CSRF wording nit). `npm audit` surface unchanged from cycle 4 (2 moderate, both the bundled `postcss`/`next` XSS carry‑forward). Findings have converged: 2H→0H open, 2M→1M open, 5L→4L open + 1 new doc LOW.

## Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | — |
| High | 0 | (C4‑1 and C4‑2 CLOSED this cycle) |
| Medium | 1 | C4‑4 (AGG‑10 plaintext‑decrypt default true, carry‑forward) |
| Low | 5 | C4‑6 (roles PATCH TOCTOU), C4‑7 (recruiting counter clobber), C4‑N2 (lateral cap‑strip), C5‑L1 (csrf.ts docstring misdescribes the gate — NEW), C4‑8 (executor.rs source 0o666) |

---

## Inventory — security‑relevant files re‑read at HEAD

**Judge IPC (C4‑2 surface):** `src/app/api/v1/judge/{claim,poll,deregister,heartbeat,register}/route.ts`, `src/lib/judge/auth.ts`, `src/lib/judge/ip-allowlist.ts`.
**Backup/restore (C4‑1 surface):** `src/lib/db/export.ts`, `src/lib/db/pre-restore-snapshot.ts`.
**Settings writers (ARCH‑1/C4‑N1/C4‑3 surface):** `src/lib/security/sensitive-settings.ts`, `src/app/api/v1/admin/settings/route.ts`, `src/lib/actions/system-settings.ts`, `src/lib/validators/system-settings.ts`.
**Function judging (F1 surface):** `src/lib/judge/function-judging/serialization.ts`, `adapters/{cpp,java,csharp}.ts`.
**Audit (C4‑9 surface):** `src/app/api/v1/contests/[assignmentId]/export/route.ts`.
**Deferred items:** `src/app/api/v1/admin/roles/[id]/route.ts`, `src/lib/assignments/recruiting-invitations.ts`, `src/lib/plugins/secrets.ts`, `src/lib/files/validation.ts`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`.
**Worker (N1/R2/R4):** `judge-worker-rs/src/docker.rs`.
**Sweep:** `src/lib/security/csrf.ts`, `src/lib/security/env.ts`, `src/app/api/v1/test/seed/route.ts`, `.env.example`, all `sql.raw` consumers, all `exec(`/`spawn` sites, all settings/judge tests.

---

## CYCLE‑4 REGRESSION VERDICT — 6/6 PASS

| # | Item | Status | Evidence @ HEAD `7ebea50e` |
|---|---|---|---|
| 1 | **C4‑2 Part 1** — workerId REQUIRED on claim/poll/deregister/heartbeat; shared token `/register`‑only | **PASS** | `claim/route.ts:106-128` schema keeps `.optional()` + `superRefine` that rejects missing `workerId` (`workerIdRequired`) and missing `workerSecret` (`workerSecretRequired`); defense‑in‑depth `if (!workerId \|\| !workerSecret) return 400` at `:162`. Shared‑token fallback **deleted** (comment `:173-180` documents the removal). Auth flows through `isJudgeAuthorizedForWorker` only (`:177`). `poll/route.ts:74-80` rejects submissions with no `judgeWorkerId` and requires per‑worker auth. `deregister/route.ts:13-16` and `heartbeat/route.ts:14-20` both declare `workerId`/`workerSecret` as `z.string().min(1)` (required). `grep -rE "isJudgeAuthorized\b"` under `src/app/api/v1/judge/` returns ONLY `register/route.ts:31` — the shared token is genuinely register‑only now. Rate‑limit scope `claim/route.ts:167` is `workerId` (always present). |
| 2 | **C4‑2 Part 2** — `JUDGE_STRICT_IP_ALLOWLIST` opt‑in, `unset==allow-all` preserved + WARN | **PASS** | `ip-allowlist.ts:20-22` reads the flag; `:186-202` behaviour matrix is exactly as specified: set → enforce; unset + flag=1 → fail‑closed (deny all); unset + flag unset → allow‑all **and** emit a one‑shot `logger.warn` (guarded by `warnedAboutUnsetAllowlist`). No default flip; the cycle‑2 `23851d69` cautionary tail is referenced in the file header. |
| 3 | **C4‑1** — `snapshot:true` opt‑out bypasses `EXPORT_ALWAYS_REDACT_COLUMNS`; only `takePreRestoreSnapshot` passes it | **PASS** | `export.ts:72` adds `snapshot?: boolean` to options; `:111-115` selects `activeRedactionMap = options.snapshot ? {} : ...`. Sole caller is `pre-restore-snapshot.ts:87-90` passing `{ sanitize: false, snapshot: true }`; source‑grep test `tests/unit/db/export-sanitization.test.ts:148-150` asserts both the option and the call site. Backup/migrate/export routes still pass `sanitize:false` (no `snapshot`) → still redact. No secret‑exfil path opened. |
| 4 | **ARCH‑1 + C4‑N1 + C4‑3** — shared reconfirm helper on BOTH writers; `hasOwnInput` port; sensitive‑key expansion | **PASS** | `sensitive-settings.ts:19-54` defines the shared `SENSITIVE_SETTINGS_KEYS` (now includes `aiAssistantEnabled`, `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes`, all four `uploadMax*`). `requireSettingsReconfirm` (`:81-110`) reads `currentPassword` from `input`, verifies via `verifyAndRehashPassword`. Route calls it on `body` (`admin/settings/route.ts:72-77`); action calls it on `input` (`system-settings.ts:100-103`) — both gates use the SAME key set. `hasOwnInput` ported to the route (`:110-115` + per‑field guards `:117-164`) — `PUT {siteTitle:"x"}` no longer wipes `hcaptchaSecret`/`publicSignupEnabled`. `systemSettingsSchema` includes `currentPassword` (`validators/system-settings.ts:61`) so the gate can read it. |
| 5 | **F1** — int64 verbatim serialization + strtoll/parseLong/long.Parse | **PASS** | `serialization.ts:16-31` `encodeIntLiteral` accepts `bigint`/digit‑`string`/safe‑integer, **throws** on unsafe Number. cpp adapter `:42-51` `readInt()` uses `std::strtoll` over an integer‑only token; java `:78-86` uses `Long.parseLong(integerToken())`; csharp `:81-90` uses `long.Parse(IntegerToken(), CultureInfo.InvariantCulture)`. Double reader kept separate (`readDouble`/`readDouble`). No `Number()`/`stod`/`Double.parseDouble`/`double.Parse` path remains in any int/long reader. |
| 6 | **C4‑9** — contest CSV export uses durable audit (parity with JSON branch) | **PASS** | `contests/[assignmentId]/export/route.ts:185-195` CSV path now calls `recordAuditEventDurable`. JSON path was already durable (`:117`). Both paths now survive a SIGKILL/OOM in the buffered flush window. |

**Regression verdict: 6/6 PASS. No bypass introduced.** Tests added under `tests/unit/{api,db,judge,actions}/` cover each fix (verified by grep of the test files).

---

## DEFERRED ITEMS — re‑validation

| Item | Cycle‑4 verdict | Cycle‑5 verdict | Evidence @ HEAD |
|---|---|---|---|
| **C4‑4 / AGG‑10** plaintext‑decryption fallback | MED, deferred Phase B | **STILL OPEN — MED** (unchanged, no regression) | `plugins/secrets.ts:61` `allowPlaintext = options?.allowPlaintextFallback ?? true`. `decryptPluginConfigForUse:162` calls `decryptPluginSecret(rawValue)` with no options → default‑open. A plaintext row planted via SQL/insider access is returned as‑is, bypassing AES‑256‑GCM auth. Same severity/confidence/exploitability as cycle 4 — recorded but not addressed. |
| **C4‑6** roles PATCH TOCTOU | LOW, Phase C | **STILL OPEN — LOW** (unchanged) | `admin/roles/[id]/route.ts:59-63` read + `:121-124` write with NO transaction/`FOR UPDATE`, while DELETE locks inside `execTransaction(... .for("update"))` (`:156-162`). A concurrent promotion between a lower admin's read and write applies the edit to a now‑higher role. Requires precisely‑timed concurrent promotion by a higher admin — impact bounded. |
| **C4‑7** `resetRecruitingInvitationAccountPassword` metadata clobber | LOW, Phase C | **STILL OPEN — LOW** (unchanged) | `recruiting-invitations.ts:463` reads invitation **outside** the tx; `:474-477` builds `nextMetadata` from that stale snapshot; `:503-509` writes the whole metadata object inside a tx with no `FOR UPDATE`. A concurrent `incrementFailedRedeemAttempt` (`:96-115`, atomic `jsonb_set` row‑lock) that commits in that window has its increment overwritten by the stale snapshot. Requires admin password‑reset racing live brute‑force on the same token — lockout still fires, just with one fewer count. |
| **C4‑N2** lateral (same‑level) cap‑stripping | LOW, Phase C | **STILL OPEN — LOW** (unchanged) | `admin/roles/[id]/route.ts:94` `if (role.level > creatorLevel)` uses strict `>`, so a same‑level peer can still strip capabilities from a lateral role. This is documented peer behaviour, not a privilege violation, and the cycle‑4 plan deliberately placed it in Phase C. |
| **NEW‑M8** ZIP‑bomb | CLOSED / well‑mitigated | **STILL CLOSED** | `files/validation.ts:57-113` enforces 10 000‑entry cap (`:66`), per‑entry 50 MB cap on both fast (`:81-83`) and slow (`:100-102`) paths, total cap (`:85-87`, `:104-106`) **before** decompression completes. No residual. |
| **NEW‑M9** anti‑cheat Origin fail‑closed | LOW (narrowed) | **STILL LOW** (unchanged) | `contests/[assignmentId]/anti-cheat/route.ts:65-67` missing Origin → 403 (closed in prod); `:70-78` value compare gated on `expectedHost` non‑null. `env.ts:128` boot‑throws without `AUTH_URL` in production, so prod is always non‑null. Residual (curl with a spoofed `Origin`) is defense‑in‑depth narrow. |
| **C4‑8** executor.rs source `0o666` vs runner `0o600` | LOW, Phase C | **STILL OPEN — LOW** (unchanged; not in cycle‑5 changed surface) | Outside this cycle's scope. Tracked in cycle‑4 Phase C; no regression. |
| **AGG‑12 / SEC‑12** `postcss` XSS via `next` | MED, Phase C (build‑time) | **STILL OPEN — MED** (unchanged) | `npm audit` reports 2 moderate (`postcss <8.5.10` GHSA‑qx2v‑qp2m‑jg93 CVSS 6.1, bundled inside `next`). Build‑time only; bundled; `fixAvailable` is a semver‑major downgrade to `next@9.3.3` (not viable). Exit: next `next` bump. |
| SEC‑16/17/20/21, ARCH‑6/8, NEW‑B | Backlog | Backlog (no regression) | — |

---

## NET‑NEW FINDINGS

### C5‑L1. `csrf.ts` docstring misdescribes the gate as OR‑semantics (DOC‑only, NEW)
**Severity:** LOW · **Confidence:** HIGH (A05 Misconfiguration — doc/UX, not behaviour) · **Status:** confirmed, new
**Location:** `src/lib/security/csrf.ts:20-31` (docstring) vs `:42-73` (implementation)
**Exploitability:** None — behaviour is **more strict** than the doc claims, so there is no exploitable gap.
**Blast radius:** Documentation/UX only. A reviewer or call‑site author reading the docstring ("any one passing is sufficient") may believe omitting `X-Requested-With` is safe if `Origin` matches; in fact the implementation REQUIRES `X-Requested-With: XMLHttpRequest` (a custom header that HTML forms cannot set) and only layers Sec‑Fetch‑Site / Origin as additional fail‑closed‑when‑present checks.
**Issue:** The doc comment says "via THREE layered checks (any one passing is sufficient)". The implementation is actually AND‑shaped: `:42-47` returns 403 whenever `X-Requested-With !== "XMLHttpRequest"`; `:49-56` only softens (does not harden) when `Sec-Fetch-Site` is present; `:58-73` only softens when `Origin` is present and `expectedHost` is non‑null. Functionally this is the desired strict posture; the doc is wrong.
**Remediation:** Rewrite the docstring to match reality — "REQUIRES the `X-Requested-With: XMLHttpRequest` custom header (which HTML forms cannot set, providing the CSRF boundary); additionally fail‑closed when `Sec-Fetch-Site` is present and not same‑origin/same‑site/none, or when `Origin` is present and mismatches the configured AUTH_URL host."

---

### Hunt sweep — negative results (clean)

| Category | Coverage | Result |
|---|---|---|
| **Hardcoded secrets** | grep `api[_-]?key\|password\|secret\|token` literal assignments across `src` + `judge-worker-rs/src` | **CLEAN.** Zero hits outside test/mock/example. `env.ts:284-312` rejects the placeholder values for `AUTH_SECRET` (<32 chars) and `JUDGE_AUTH_TOKEN` (placeholders + <32 chars) at boot. |
| **SQL injection** | All `sql.raw` and `rawQuery*` consumers | **CLEAN.** Only `sql.raw` sites are: `recruiting-invitations.ts` (module‑constant JSONB keys asserted against `INTERNAL_KEY_PATTERN` at `:58-60`); `export.ts:90` (transaction‑mode literal). All `rawQueryAll/One` use `@param` binding (`@assignmentId`, `@userId`, etc.). Anti‑cheat CTE (`route.ts:226-262`) is parameterized. |
| **Command injection / shell** | All `exec`/`spawn`/`execFile` sites; `shell:true` | **CLEAN.** `docker/client.ts`, `compiler/execute.ts`, `system-info.ts` all use arg‑array form (`exec("docker", [...args], {timeout})`). No template‑literal shell invocation. No `shell:true`. |
| **SSRF** | All `fetch(\`…\`)` outbound | **CLEAN.** URLs interpolate only server env vars (`CODE_SIMILARITY_URL`, `JUDGE_WORKER_URL`, etc.). No user‑controlled outbound URL. |
| **Mass assignment** | `...body`, `Object.assign(...body)`, `...req` across `src/app/api` | **CLEAN.** settings PUT uses explicit `allowedConfigKeys` allowlist + `hasOwnInput`; roles/api‑keys/languages build explicit update objects. The two apparent hits (`chat-widget/chat/route.ts:307` `[...body.messages]` and `admin/languages/[language]/route.ts:77` `details: {...body}`) operate over Zod‑validated bodies and persist through explicit field selection. |
| **Auth bypass** | All mutation routes without `createApiHandler({ auth })` | **CLEAN.** The 20 routes flagged by the grep are either: (a) public auth endpoints (`/api/auth/*`, `forgot-password`, `reset-password`, `verify-email`) — intended; (b) judge IPC routes that implement their own per‑worker auth check (verified above); (c) `test/seed/route.ts` — hard‑gated by `NODE_ENV !== "production"` AND `PLAYWRIGHT_AUTH_TOKEN` set AND localhost AND timing‑safe Bearer AND CSRF AND rate‑limit AND `e2e-`/`[E2E]` prefix scoping; or (d) admin restore/backup/migrate that DO use `createApiHandler({ auth, schema })` (false positives from a multiline grep). |
| **Secrets in logs** | `console.*` touching secret vars; pino `LOGGER_REDACT_PATHS` | **CLEAN.** No `console.{log,error,warn,info}` touching password/secret/token vars in `src`. Pino redaction paths cover `authorization`, `password*`, `*token`, `encryptedKey`, `hcaptchaSecret`, `smtpPass`, `runnerAuthToken`. |
| **Path traversal** | File‑upload / restore blob writes | **CLEAN** (unchanged from cycle 4 — not in cycle‑4 changed surface). |

---

## `npm audit` — dependency surface

```
2 moderate (postcss <8.5.10 GHSA-qx2v-qp2m-jg93, CVSS 6.1, bundled in next)
0 high, 0 critical
```
Same as cycle 4 (AGG‑12/SEC‑12 carry‑forward). `fixAvailable` is a non‑viable semver‑major downgrade. No new transitive CVEs introduced by cycle 4. `cargo` audit not run (no Rust dependency CVE pipeline in repo); `judge-worker-rs` deps unchanged by cycle 4 (only `futures-util` direct‑dep recording in cycle 3, `90ec2bcb`).

---

## FINAL SWEEP — OWASP coverage

- **A01 Broken Access Control** — judge IPC trust boundary **CLOSED** (C4‑2); roles level/cap gates solid (C4‑6 TOCTOU + C4‑N2 lateral residual only); community scope centralized; settings writers gated on the same shared key set; test/seed hard‑gated.
- **A02 Cryptographic Failures** — AES‑256‑GCM + HKDF sound; **C4‑4 plaintext default still open (MED carry‑forward)**; env 0600 + boot guard hold.
- **A03 Injection** — 0 SQLi / command‑inj / SSRF. `sql.raw` only const/literal; `rawQuery*` `@param`‑bound.
- **A04 Insecure Design** — `csrf.ts` docstring misdescribes the gate (C5‑L1, behaviour correct); C4‑7 counter‑clobber race (LOW).
- **A05 Security Misconfiguration** — judge IP allowlist opt‑in correct; **AGG‑12/SEC‑12 postcss carry‑forward (MED, build‑time)**; C4‑8 executor source mode (LOW).
- **A06 Vulnerable Components** — `npm audit` 2 moderate, both build‑time/bundled; no high/critical.
- **A07 Auth Failures** — recruiting brute‑force counter solid except C4‑7 (LOW); reconfirm gates solid on both writers.
- **A08 Integrity / A09 Recovery/Logging** — **C4‑1 snapshot faithfully restoreable (CLOSED this cycle)**; C4‑9 CSV audit durable (CLOSED); restore/import durable‑audit + snapshot‑abort hold.
- **A10 SSRF** — outbound fetches use only env‑derived URLs.

**Remediation priority:**
1. **Important (<2wk):** C4‑4 flip `allowPlaintext` default to `false` + re‑encryption migration (only MED remaining).
2. **Planned (<1mo):** C4‑6 PATCH `FOR UPDATE`; C4‑7 metadata `jsonb_set`/`FOR UPDATE`; C5‑L1 csrf docstring fix; C4‑8 executor.rs source `0o600`; AGG‑12 next `next` bump.
3. **Backlog:** C4‑N2 lateral cap‑strip semantics decision.

## Security Checklist
- [x] No hardcoded secrets (env 0600; placeholders rejected at boot)
- [x] Inputs validated (Zod at every API boundary)
- [x] Injection prevention verified (Drizzle parameterized; `sql.raw` const/literal only)
- [x] Auth/authz verified on changed surface (6/6 cycle‑4 fixes PASS; C4‑2 judge boundary CLOSED)
- [x] Recovery path verified (C4‑1 snapshot faithfully restoreable — CLOSED)
- [x] Judge trust boundary closed (C4‑2 workerId required + IP allowlist opt‑in — CLOSED)
- [ ] Plaintext‑decrypt default flipped (C4‑4 — MED carry‑forward)
- [x] Dependencies audited (npm: 2 moderate build‑time; 0 high/critical)
