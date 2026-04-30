# RPF Cycle 6 — document-specialist (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `a18302b8`
**Diff vs cycle-5 base:** 0 lines.

## Methodology

Re-validated documentation accuracy at HEAD. Audited stale prior cycle-6 DOC findings. Checked CLAUDE.md, AGENTS.md, docs/deployment.md, README.md, plans/*, .context/* for code-doc mismatches.

## Stale prior cycle-6 DOC findings audit

- **Stale DOC-1 (countdown-timer .json() unguarded)** — RESOLVED at HEAD. The fix at `src/components/exam/countdown-timer.tsx:75-90` adds `if (!data) return; if (Number.isFinite(data.timestamp)) ...` and `.catch(() => {})`.
- **Stale DOC-2 (problem-set-form.tsx error code list needs sync comment)** — Treated by stale aggregate as "very low priority". Not promoted; not a finding this cycle.

## Doc steady-state checks at HEAD

### CLAUDE.md (project-level)

- "Preserve Production config.ts" rule still in force.
- "algo.xylolabs.com Server Architecture" rule still in force (SKIP_LANGUAGES=true, BUILD_WORKER_IMAGE=false, INCLUDE_WORKER=false; no `docker system prune --volumes`).
- "Korean Letter Spacing" rule still in force.

### AGENTS.md

- DRIZZLE_PUSH_FORCE policy in `AGENTS.md` still consistent with cycle-2 commit (added by C2-AGG-3 retirement).

### docs/deployment.md

- Mentions `docker system prune --volumes` as forbidden (cross-references CLAUDE.md). ✓
- Deploy env vars enumerated (cycle-4 commit `e657a96c` added the section).

### plans/

- `plans/open/2026-04-29-rpf-cycle-5-review-remediation.md` exists and reflects cycle-5 work as DONE for Tasks Z, ZZ. To be archived after cycle-6 plan publishes.
- `plans/done/2026-04-29-rpf-cycle-4-review-remediation.md` archived ✓.
- `plans/user-injected/pending-next-cycle.md` shows TODO #1 (workspace→public migration) DONE.

### .context/reviews/

- `_aggregate.md` is the cycle-5 aggregate.
- `_aggregate-cycle-5.md` snapshot already exists.
- A pre-existing stale set of `rpf-cycle-6-*.md` reviews (rooted at `d5980b35`) was overwritten this cycle.

## Code↔doc reconciliation spot checks

| Claim | Where | Verified at HEAD |
|---|---|---|
| `lint:bash` script exists | `package.json:10` | ✓ |
| `DEPLOY_INSTANCE` env var documented | `deploy-docker.sh:34` (block comment) | ✓ |
| `chmod 700` clarification comment | `deploy-docker.sh` (post-mktemp -d) | ✓ |
| MAX_EXPORT_ROWS = 10_000 | `src/lib/...` (cycle-5 noted) | ✓ assumed (no diff this cycle to check) |

## NEW findings this cycle

**0 HIGH, 0 MEDIUM, 0 LOW NEW.** Empty change surface; no doc/code mismatches introduced.

## Recommendation

Cycle-6 plan should:
1. Update the carry-forward registry with corrected paths for AGG-2 and PERF-3 (path drift noted by code-reviewer / perf-reviewer / critic).
2. Mark stale prior cycle-6 AGG-1..AGG-7 as RESOLVED.
3. Annotate D1/D2 with the `src/lib/auth/config.ts` no-touch constraint.
4. Pick 3 LOW items for draw-down (per orchestrator + critic recommendation).

Confidence: H.
