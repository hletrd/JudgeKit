# RPF Cycle 6 — code-reviewer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8` (cycle-5 close-out: docs(plans) mark cycle 5 Tasks Z and ZZ done).
**Diff vs cycle-5 base:** `git diff a18302b8 HEAD` — 0 lines. Empty change surface this cycle.
**Note on stale prior cycle-6 reviews:** A pre-existing `.context/reviews/rpf-cycle-6-*.md` set, rooted at base commit `d5980b35`, was found on disk. Its 7 AGG findings (AGG-1 through AGG-7) were re-validated at HEAD this cycle — see "Stale prior cycle-6 findings audit" below. Most are resolved; one (AGG-7-equivalent) was only partially relevant.

## Methodology

1. Re-validated cycle-5 carry-forward backlog at HEAD (paths may have drifted).
2. Audited the prior stale cycle-6 review aggregate's findings (rooted at `d5980b35`) for HEAD applicability.
3. Searched for newly-introduced bugs in `src/`.

## Stale prior cycle-6 findings audit (re-rooted at `a18302b8`)

| Stale ID | File | Status at HEAD | Evidence |
|---|---|---|---|
| AGG-1 (handleCreate missing catch) | `src/components/contest/recruiting-invitations-panel.tsx:181-240` | **RESOLVED** | Lines 185-240 contain `try { ... } catch { ... } finally { ... }`. catch toasts/clears state at line 238-239. |
| AGG-2 (anti-cheat polling clobbers loadMore) | `src/components/contest/anti-cheat-dashboard.tsx:127-160` | **RESOLVED** | `setEvents((prev) => ...)` preserves `prev.slice(PAGE_SIZE)` when prev > PAGE_SIZE; `setOffset((prev) => ...)` preserves offset when user loaded more. Comment block at lines 130-138 explicitly documents the loadMore interaction. |
| AGG-3 (email field incorrectly required) | `src/components/contest/recruiting-invitations-panel.tsx:516` | **RESOLVED** | Button disabled is `creating || !createName.trim()` — no email check. |
| AGG-4 (createdLink not cleared on error) | `src/components/contest/recruiting-invitations-panel.tsx:183` | **RESOLVED** | Line 183 calls `setCreatedLink(null)` at the start of `handleCreate`. |
| AGG-5 (no loading text on Create button) | `src/components/contest/recruiting-invitations-panel.tsx:516-518` | **RESOLVED** | Button content is `{creating ? tCommon("loading") : t("create")}`. |
| AGG-6 (countdown-timer .json() unguarded) | `src/components/exam/countdown-timer.tsx:75-90` | **RESOLVED** | `Number.isFinite(data.timestamp)` guard plus `.catch(() => {})`. |
| AGG-7 (SVG circles lack keyboard focus) | `src/components/contest/score-timeline-chart.tsx:88` | **RESOLVED** | `<g>` wrapper has `tabIndex={0} role="img" aria-label="${scoreLabel}: ${point.totalScore}"`. |

All 7 stale cycle-6 findings are silently fixed at HEAD `a18302b8`. **No re-injection needed.**

## Cycle-5 carry-forward backlog re-validation at HEAD `a18302b8`

| ID | File+line | Status | Note |
|---|---|---|---|
| C5-SR-1 | `scripts/deploy-worker.sh:101-107` | DEFERRED | sed delimiter unchanged; trusted operator input |
| C3-AGG-2 | `deploy-docker.sh:204-214` | DEFERRED | SSH cred-rotation footgun |
| C3-AGG-3 | `deploy-docker.sh:165-178` | DEFERRED | ControlSocket cleanup ordering |
| C3-AGG-5 | `deploy-docker.sh` whole + `deploy.sh:58-66` | DEFERRED | Helper duplication |
| C3-AGG-6 | `deploy-docker.sh:151` | DEFERRED | Single-tenant assumption |
| C2-AGG-5 | 4-6 polling components | DEFERRED | Visibility-aware polling |
| C2-AGG-6 | `src/app/(public)/practice/page.tsx:417` | DEFERRED | Practice page perf |
| C1-AGG-3 | client `console.error` sites | DEFERRED | **Population: 21 (down from 27)** — silently shrinking |
| ARCH-CARRY-1 | raw API handlers | DEFERRED | **Population: 20 (down from 22+)** — silently shrinking; threshold no longer met but item still applicable |
| ARCH-CARRY-2 | `src/lib/realtime/realtime-coordination.ts` | DEFERRED | SSE eviction O(n) |
| AGG-2 | `src/lib/security/in-memory-rate-limit.ts` (lines 22, 24, 56, 75, 100, 149) | DEFERRED + **PATH UPDATED** | Was `src/lib/api-rate-limit.ts:56`. File migrated; `Date.now()` is now in the new in-memory rate-limit module. |
| PERF-3 | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` | DEFERRED + **PATH UPDATED** | Was `src/lib/anti-cheat/`. The actual gap-query is in the API route; `src/lib/anti-cheat/` only holds a 16-line tier mapping. |
| D1, D2 | `src/lib/auth/config.ts` | DEFERRED | File is repo-policy-locked ("Preserve Production config.ts") |
| DEFER-ENV-GATES | env-blocked vitest gates | DEFERRED | Provisioning constraint |
| C2-AGG-7 | `src/components/contest/recruiting-invitations-panel.tsx` | **RESOLVED** | Already noted in cycle-5 close-out. `judgekit.dev` literal absent. |

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no new code-review-class issues.

## Recommendation

Per orchestrator's PROMPT-2 directive ("pick 2-3 LOW deferred items, ideally 3"), three best draw-down candidates by **risk/effort ratio**:

1. **C5-SR-1** — switch sed delimiter in `scripts/deploy-worker.sh:101-107`. Tiny, deterministic, no behavior change for current input.
2. **C3-AGG-3** — add explicit ControlSocket cleanup ordering before SSH `exit` in `deploy-docker.sh:165-178`. Small additive change.
3. **C3-AGG-2** — add per-target credential validation/clarification before SSH connect in `deploy-docker.sh:204-214`. Adds a sanity check; no behavior change for valid configs.

Confidence: H for stale-finding audit, H for backlog re-validation, M for the 3-pick ordering.
