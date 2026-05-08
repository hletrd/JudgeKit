# Aggregate Review — Cycle 5 (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `eb4429a5`
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, critic, architect, debugger, verifier, tracer, test-engineer, document-specialist, designer (11 lanes; per-agent files in `.context/reviews/2026-05-03-cycle5/<agent>.md`).

---

## Total deduplicated NEW findings (applicable at HEAD `eb4429a5`)

**1 HIGH, 4 MEDIUM, 6 LOW NEW**, plus carry-forward DEFERRED items unchanged in status.

---

## Deduplicated Findings (merged across agents, preserving highest severity)

### F1 (HIGH, HIGH confidence) — Guest `compileOutput` exposure on public submissions list — information disclosure
**Cross-agent agreement:** C5-CR-1, C5-SEC-1, C5-CRIT-1, C5-DBG-1, C5-VER-1, C5-TR-1, C5-UX-1, C5-ARCH-1 (8 lanes)

`src/app/(public)/submissions/page.tsx:202,435,477` passes `compileOutput` to `SubmissionStatusBadge` without checking `isGuest`. The badge's `TooltipBody` (lines 71-79) renders the raw compiler error when `status === "compile_error"`. Compiler errors frequently contain source code fragments (variable declarations, function signatures, include paths). The per-detail-page correctly nulls `compileOutput` for non-owners (`submissions/[id]/page.tsx:154`), but the list page has no equivalent guard.

**Fix:** In the submissions page, do not pass `compileOutput` to the badge when `isGuest` is true (or conditionally exclude it from the SQL select). Also exclude `compileOutput` from the query for guests to avoid unnecessary data transfer.

---

### F2 (MEDIUM, HIGH confidence) — `api-key-auth.ts` uses inline `createHash("sha256")` instead of shared `hashToken` module
**Cross-agent agreement:** C5-CR-3, C5-SEC-2, C5-VER-2, C5-TR-2 (4 lanes)

`src/lib/api/api-key-auth.ts:22` uses `createHash("sha256").update(rawKey).digest("hex")` instead of the shared `hashToken` from `src/lib/security/token-hash.ts`. If the hash algorithm changes in `token-hash.ts`, API key verification will silently break because stored hashes won't match newly computed ones. The recruiting paths were consolidated in cycle 4; the API key path was missed.

**Fix:** Replace inline hash with `import { hashToken } from "@/lib/security/token-hash"`.

---

### F3 (MEDIUM, HIGH confidence) — `_sys.` namespace not enforced at Zod schema level (defense-in-depth)
**Cross-agent agreement:** C5-CR-5, C5-SEC-3, C5-CRIT-3, C5-TE-2 (4 lanes)

`src/lib/validators/recruiting-invitations.ts:6,16` — both `createRecruitingInvitationSchema` and `updateRecruitingInvitationSchema` accept `metadata: z.record(z.string(), z.string())` without rejecting `_sys.` prefixed keys. The runtime check in `recruiting-invitations.ts` is the sole guard. A Zod `.refine()` would catch violations at the API boundary, producing consistent 400 responses.

**Fix:** Add `.refine()` to both schemas rejecting keys starting with `_sys.`.

---

### F4 (MEDIUM, HIGH confidence) — Unbounded `SELECT DISTINCT language FROM submissions` on every public page load
**Cross-agent agreement:** C5-PERF-1, C5-CR-2 (2 lanes)

`src/app/(public)/submissions/page.tsx:140-146` runs `SELECT DISTINCT language FROM submissions` with no limit on every page load. As the submissions table grows, this becomes progressively slower.

**Fix:** Query language configurations (already cached via `getEnabledCompilerLanguages()` or similar) instead of the submissions table.

---

### F5 (MEDIUM, MEDIUM confidence) — Submissions list page bypasses centralized visibility model
**Cross-agent agreement:** C5-ARCH-1, C5-CRIT-2, C5-DOC-1 (3 lanes)

The `sanitizeSubmissionForViewer` function in `visibility.ts` is the centralized authority, but neither the list page nor the detail page uses it. Both implement inline visibility logic that diverges (detail page nulls `compileOutput` for non-owners; list page does not). This creates a maintenance hazard: new sensitive fields added to the schema will automatically appear in the list page query.

**Fix:** After fixing F1, add a comment on the list page query noting the visibility convention. Consider using a "safe for public list" column projection constant.

---

### F6 (LOW, HIGH confidence) — `auth/config.ts:385` uses inline `createHash("sha256")` for UA fingerprint
**Cross-agent agreement:** C5-CR-3 (1 lane)

`src/lib/auth/config.ts:385` hashes the user-agent string using inline `createHash("sha256")` for `uaHash`. This is a fingerprinting purpose, not a verification hash, so divergence from `hashToken` is less critical. However, if the algorithm changes, this site will not follow.

**Fix:** Document the intentional divergence with a comment, or extract a separate `hashForFingerprint` utility.

---

### F7 (LOW, MEDIUM confidence) — `getPeriodStart` timezone-dependent period boundary
**Cross-agent agreement:** C5-CR-4, C5-DBG-2 (2 lanes)

`src/app/(public)/submissions/page.tsx:65-86` uses `new Date(now).setHours(0, 0, 0, 0)` which is timezone-dependent. If `getDbNow()` returns a UTC Date and the server runs in a non-UTC timezone, the period boundary will be wrong.

**Fix:** Use UTC methods (`setUTCHours`, etc.) or document that the app server must run in UTC.

---

### F8 (LOW, MEDIUM confidence) — Public submissions page makes two separate count + data queries
**Cross-agent agreement:** C5-PERF-2 (1 lane)

The page runs a `COUNT(*)` query first, then a separate data query. These could be combined using `COUNT(*) OVER()` (which other pages already use).

**Fix:** Use `count(*) over()` window function in the data query.

---

### F9 (LOW, MEDIUM confidence) — `SubmissionStatusBadge` tooltip not keyboard/screen-reader accessible
**Cross-agent agreement:** C5-UX-3 (1 lane)

The tooltip content is only visible on hover/focus. Screen reader users may not discover the compileOutput content.

**Fix:** Add `aria-describedby` or use a `<details>/<summary>` pattern.

---

### F10 (LOW, LOW confidence) — No test for `api-key-auth.ts` hash algorithm consistency
**Cross-agent agreement:** C5-TE-4 (1 lane)

After replacing the inline hash with `hashToken`, a test should verify existing API key hashes still verify correctly.

**Fix:** Add a verification test.

---

### F11 (LOW, LOW confidence) — Public submissions page: no visual distinction between guest and logged-in views
**Cross-agent agreement:** C5-UX-2 (1 lane)

Guests see the same layout but cannot use "Mine" scope. Consider showing a "Sign in" prompt.

**Fix:** Design enhancement — LOW priority.

---

## Carry-forward DEFERRED items (status verified at HEAD `eb4429a5`)

All prior cycle deferred items remain in DEFERRED status. No carry-forward items resolved this cycle.

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| C4-F3 (was F2 C1/C2) | MEDIUM | `recruiting-invitations.ts` candidateName/Email | DEFERRED | Dedicated encryption-migration cycle |
| C4-F5 (was F5 C1/C2) | MEDIUM | `auth/config.ts:399` JWT DB query | DEFERRED | Auth-perf cycle |
| C1-F7 | LOW | Client console.error (24 sites) | DEFERRED | Telemetry/observability cycle |
| C2-F9 | LOW | Inconsistent `updatedAt` handling | DEFERRED | DB schema maintenance cycle |
| C2-F10 | LOW | File route bypasses `createApiHandler` | DEFERRED | Next file-route modification |
| C2-F11 | LOW | API key role escalation | DEFERRED | API key feature review cycle |
| C2-F12 | LOW | Recruiting metadata unvalidated JSONB | DEFERRED | Recruiting feature expansion cycle |
| C2-F13/F11 | LOW | `DATABASE_PATH` derivation | DEFERRED | Infrastructure config audit cycle |
| C2-F14/F15 | LOW | Missing tests for redeem/audit | DEFERRED | Integration test suite setup |
| C2-F17 | LOW | Score decimal places | DEFERRED | Next scoring display change |
| AGG-2 | LOW | Date.now caching | DEFERRED | Rate-limit module touched 2 more times |
| C3-AGG-5 | LOW | deploy-docker.sh size | DEFERRED | Modular extraction OR >1500 lines |
| C3-AGG-6 | LOW | deploy-docker.sh multi-tenant | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | Practice page perf | DEFERRED | p99 > 1.5s OR > 5k problems |
| C2-AGG-7 | LOW | `recruiting-invitations-panel.tsx:99` appUrl | DEFERRED | Wrong-host invite link reported |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew | DEFERRED | Auth-perf cycle |
| 24-pre-test-fail | LOW | 24 pre-existing test failures | DEFERRED | Investigation cycle |

---

## Agent failures

None. All 11 reviewer perspectives produced artifacts.

---

## Implementation priority for PROMPT 3

**Must fix this cycle:**
1. **F1 (HIGH)** — Guest compileOutput leak. Security fix.
2. **F2 (MEDIUM)** — `api-key-auth.ts` hash consolidation. Security/correctness fix.
3. **F3 (MEDIUM)** — Zod-level `_sys.` namespace enforcement. Defense-in-depth.
4. **F4 (MEDIUM)** — Unbounded DISTINCT query. Performance fix.

**Should fix this cycle (LOW risk, LOW effort):**
5. **F6 (LOW)** — Document auth/config.ts hash divergence
6. **F7 (LOW)** — Fix timezone-dependent period boundary
7. **F8 (LOW)** — Combine count + data queries
8. **F10 (LOW)** — API key hash consistency test

**Defer:**
9. **F5 (MEDIUM)** — Visibility model documentation (defer after F1 fix + comment)
10. **F9 (LOW)** — Tooltip accessibility
11. **F11 (LOW)** — Guest visual distinction
