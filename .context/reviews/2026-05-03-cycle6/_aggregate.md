# Cycle 6 Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD at review:** `02ea830c`
**Reviewers:** comprehensive (single-agent multi-angle review)
**Diff since cycle 5 close:** `02ea830c` (no new commits since cycle 5)

---

## New Findings This Cycle

| ID | Severity | Confidence | File+line | Description |
|---|---|---|---|---|
| C6-1 | HIGH | High | `src/app/(auth)/recruit/[token]/results/page.tsx:47` | Recruit results page loads invitation by plaintext token via `getRecruitingInvitationByToken` but does NOT rate-limit or brute-force protect the token lookup. An attacker can enumerate tokens by hitting `/recruit/{token}/results` repeatedly. The `recruiting/validate` route has rate limiting but this page does not. |
| C6-2 | MEDIUM | High | `src/app/(auth)/recruit/[token]/results/page.tsx:47` | `getRecruitingInvitationByToken` hashes the token on every call with no caching. The recruit start page uses `cache()` but the results page calls the uncached function directly, causing a DB query + SHA-256 hash on every page load. |
| C6-3 | MEDIUM | High | `src/app/(auth)/recruit/[token]/page.tsx:38` | Recruit start page JS-side expiry check uses `invitation.expiresAt < now` where `now` is from `getDbNow()`. If the invitation has already been claimed (status=redeemed), the expired-token check runs before the claimed-state branch, so an expired-but-redeemed invitation shows "expired" instead of the re-entry form. This is a UX/correctness issue — the user cannot re-enter a contest after the token expires. |
| C6-4 | MEDIUM | Medium | `src/lib/assignments/access-codes.ts:20` | `randomBytes(1)[0]` is used to select a character from a charset. This creates a modulo bias when the charset length is not a power of 2. The current charset length is 62 (A-Z, a-z, 0-9), so 256 % 62 = 8, meaning the first 8 characters of the charset appear slightly more often. This is low-impact for access codes (short-lived, not security-critical) but is a correctness issue. |
| C6-5 | MEDIUM | High | `src/app/(public)/submissions/page.tsx:218` | `COUNT(*) OVER()` window function is computed on the full result set including the offset. When `offset > 0`, this still returns the correct total but the initial "preliminary" query at offset=0 is wasted when the page will be clamped. The query at line 189-218 runs even when the clamped page will differ, causing an unnecessary DB round-trip. |
| C6-6 | LOW | High | `src/lib/db/export-with-files.ts:35` | `sha256Hex` uses `createHash("sha256")` directly instead of the shared `hashToken` utility. While `hashToken` is for token hashing specifically (and `sha256Hex` is for integrity, not auth), this is a DRY violation and could cause confusion about which hash function to use for what purpose. |
| C6-7 | LOW | Medium | `src/lib/compiler/execute.ts:730-731` | `stdinText` appends a newline when the input doesn't end with one. This modifies user input silently and could cause unexpected behavior for programs that are sensitive to trailing newlines (e.g., line-counting problems). The comment says "convenience" but this is a behavioral change that may differ from the Rust runner sidecar, creating an inconsistency between local and remote execution paths. |
| C6-8 | LOW | High | `src/app/(public)/submissions/[id]/page.tsx:35` | Public submission detail page requires authentication (`if (!session?.user) redirect(...)`) but is under the `(public)` route group. The `(public)` layout may not include the auth session provider, or more importantly, this page is not truly "public" — it redirects unauthenticated users to login. The route group naming is misleading for maintainability. |
| C6-9 | LOW | Medium | `src/lib/security/csrf.ts:56-58` | CSRF validation rejects requests with no `origin` header when `expectedHost` is available and `sec-fetch-site` is missing. However, some legitimate API clients (e.g., curl, Postman) do not send `origin` or `sec-fetch-site` headers. Since the `X-Requested-With` check already passed at this point, the missing-origin rejection may be overly strict for non-browser clients using the API key path (though API-key auth correctly skips CSRF in `handler.ts`). |
| C6-10 | LOW | Medium | `src/app/(public)/privacy/page.tsx:39-43` | Hardcoded retention period strings ("90", "30", "180", "365", "365") must be kept in sync with system settings. The comment at line 37 acknowledges this but the values are not derived from the same source, creating a drift risk. This is a previously known issue (noted in cycle 2) but remains unfixed. |

---

## Cycle 5 Fixes Verified at HEAD

All cycle 5 fixes verified as correctly implemented at HEAD `02ea830c`:

- **F1 (guest compileOutput):** Verified at `src/app/(public)/submissions/page.tsx:199` — `isGuest ? sql\`NULL\` : submissions.compileOutput` correctly excludes compileOutput for guests.
- **F2 (api-key-auth hashToken):** Verified at `src/lib/api/api-key-auth.ts:10,23` — `hashToken` imported and used instead of inline `createHash`.
- **F3 (Zod _sys. rejection):** Verified at `src/lib/validators/recruiting-invitations.ts:12-19,27,39` — both create and update schemas have `.refine(sysNamespaceRefine)`.
- **F4 (language config query):** Verified at `src/app/(public)/submissions/page.tsx:147` — `getEnabledCompilerLanguages()` used instead of `SELECT DISTINCT`.
- **F5 (UA hash divergence doc):** Verified at `src/lib/auth/config.ts:384-387` — comment documents intentional divergence.
- **F6 (getPeriodStart UTC fix):** Verified at `src/app/(public)/submissions/page.tsx:66-89` — uses `setUTCHours`, `setUTCDate`, `Date.UTC`.
- **F7 (combined count+data query):** Verified at `src/app/(public)/submissions/page.tsx:210` — `count(*) over()` window function used.

---

## Carry-Forward Registry

All previously deferred items remain valid with original severity preserved.

### Deferred from prior cycles (unchanged):

| ID | Severity | File | Reason | Exit criterion |
|---|---|---|---|---|
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew | Auth-perf cycle scope | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB-per-request | Auth-perf cycle scope | Auth-perf cycle |
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` Date.now | Rate-limit-time perf cycle | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw API route handlers | API-handler refactor cycle | API-handler refactor cycle |
| PERF-3 | MEDIUM | Anti-cheat heartbeat query | Anti-cheat perf cycle | Anti-cheat p99 > 800ms OR > 50 contests |
| C3-AGG-5 | LOW | Deploy script modular extraction | Trigger not met | deploy-docker.sh >1500 lines OR 3 SSH-helpers edits |
| C3-AGG-6 | LOW | Peer-user deploy awareness | Trigger not met | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | Polling components | Trigger not met | Telemetry signal or 7th instance |
| C2-AGG-6 | LOW | Practice page search perf | Trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | Client console.error sites | Trigger not met | Telemetry/observability cycle opens |
| DEFER-ENV-GATES | LOW | Env-blocked tests | No CI host provisioned | Fully provisioned CI/host |
| C7-AGG-6 | LOW | participant-status time-boundary tests | Trigger not met | Bug report on deadline boundary |
| C7-AGG-7 | LOW | Encryption plaintext fallback | Migration compatibility; warn-log in place | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | Rate-limit 3-module duplication | Cross-reference comments mitigation | Rate-limit consolidation cycle |
| DEFER-22 | LOW | `.json()` before `response.ok` | 60+ instances; no production incident | Fetch API refactor cycle OR production incident |
| DEFER-23 | LOW | Raw API error strings without translation | Partially fixed; admin-only | i18n refactor cycle |
| DEFER-24 | LOW | `migrate/import` unsafe casts | Zod validation not yet built | Import/export refactor cycle |
| DEFER-27 | LOW | Missing AbortController on polling fetches | No production incident | Polling refactor cycle OR production timeout |
| DEFER-28 | LOW | `as { error?: string }` pattern | 22+ instances; no production incident | Type-safe API client refactor cycle |
| DEFER-30 | LOW | Recruiting validate token brute-force | No production incident | Token brute-force report OR auth-perf cycle |
| DEFER-32 | LOW | Admin settings exposes DB host/port | Admin-only; behind auth | Admin settings refactor cycle |
| DEFER-34 | LOW | Hardcoded English fallback strings | Fallback strings acceptable | i18n completeness cycle |
| DEFER-35 | LOW | Hardcoded English in editor title attrs | Screen reader edge case | Accessibility audit cycle |
| DEFER-36 | LOW | `formData.get()` cast assertions | Schema validation covers safety | Form handling refactor cycle |
| DEFER-44 | LOW | No documentation for timer pattern | Convention is clear from code | Developer onboarding cycle |
| DEFER-46 | LOW | `error.message` as control-flow discriminator | 5+ API routes; no production incident | Error class hierarchy cycle |
| DEFER-47 | LOW | Import route JSON path uses unsafe cast | Zod validation not yet built | Import/export refactor cycle |
| DEFER-48 | LOW | CountdownTimer initial render uses uncorrected client time | Server time fetch compensates within 1 RTT | Exam timer accuracy report |
| DEFER-49 | LOW | SSE connection tracking O(n) scan | No production perf report | SSE perf cycle |
| DEFER-54 | LOW | `request-cache.ts` mutates ALS without userId check | userId checked on read | Recruiting refactor cycle |
| DEFER-55 | LOW | `countdown-timer.tsx` no retry on server time fetch failure | 5-second timeout + fallback to offset=0 | Exam timer accuracy report |
| DEFER-56 | LOW | `similarity-check/route.ts` fragile AbortError detection | Works for current AbortController usage | Similarity-check refactor cycle |
| DEFER-57 | LOW | `image-processing.ts` MAX_INPUT_BUFFER_BYTES not configurable | Current limit (10MB) is reasonable | Admin upload size report |
| C4-F3 | MEDIUM | PII encryption requires schema migration | Encryption-migration cycle | Encryption-migration cycle |
| C4-F5 | MEDIUM | JWT DB query optimization needs caching design | Auth-perf cycle | Auth-perf cycle |
| C5-D1 | MEDIUM | Submissions visibility model documentation | Visibility-consistency cycle | Next new submission field OR visibility-consistency cycle |
| C5-D2 | LOW | SubmissionStatusBadge tooltip accessibility | Design input needed | WCAG 2.2 audit cycle |
| C5-D3 | LOW | API key hash consistency test | Algorithm unchanged | Hash algorithm change OR API key test expansion |
| C5-D4 | LOW | Guest visual distinction on submissions page | UX enhancement | UX improvement cycle |

---

## Gate Results

- **eslint:** PASS (exit 0)
- **next build:** Not run yet this cycle
- **tsc --noEmit:** Not run yet this cycle
- **vitest:** Not run yet this cycle
