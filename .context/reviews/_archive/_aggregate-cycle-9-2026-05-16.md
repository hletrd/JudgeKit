# Aggregate Review — RPF Cycle 9 (2026-05-16)

**Cycle:** 2/100 of this RPF loop (orchestrator-numbered)
**HEAD reviewed:** `9854e072` (cycle-8 completion commit)
**Reviewer angles covered:** code-reviewer, security-reviewer,
perf-reviewer, test-engineer, architect, critic, verifier
(single-agent comprehensive sweep — Agent fan-out unavailable in this
environment, same as cycles 30+).

---

## Total NEW findings

**0 HIGH, 0 MEDIUM, 7 LOW.**

Working tree was clean and gates were green at start of cycle. The
cycle-8 batch landed cleanly; remaining items are small consolidation
+ housekeeping + carry-forward verification.

---

## NEW findings — deduplicated

| ID | Severity | Confidence | File | Summary | Status |
|---|---|---|---|---|---|
| CR9-2 / ARCH9-1 / TE9-1 | LOW | HIGH | `src/components/contest/code-timeline-panel.tsx:24-55` ↔ `src/lib/code/language-map.ts` | Parallel language-id-to-highlighter maps; consolidate via shared helper | PLAN |
| CR9-3 | LOW | HIGH | `src/lib/plugins/secrets.ts:52-72` | `decryptPluginSecret` name now misleading under plaintext-policy | PLAN (JSDoc clarification) |
| CR9-4 | LOW (process) | HIGH | `plans/open/2026-05-16-cycle-8-rpf-review-remediation.md` | Cycle-8 plan ready to archive | PLAN (housekeeping) |
| SEC9-1 | LOW | HIGH | `src/lib/plugins/secrets.ts:27-34` | `isValidEncryptedPluginSecret` is dead code under new policy | PLAN (re-wire as defense-in-depth on `enc:v1:` writes) |
| PERF9-2 | LOW | HIGH | `src/components/contest/code-timeline-panel.tsx:150-156` | `problems`/`problemLabels` rebuilt every render; useMemo opportunity | PLAN |
| CR9-1 | LOW | MEDIUM | `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx:18-40` | Latent: effect-rerun can re-apply stale URL hash and clobber tab click | DEFERRED (race only on parent RSC re-render; functional setter mitigates same-value writes) |
| CRIT9-1 | LOW (governance) | HIGH | `docs/policy/` (missing) | Operator-decisions registry would protect future maintainers | DEFERRED (doc-only, not in scope this cycle) |

## Reclassifications from prior cycles

| ID | Old status | New status | Reason |
|---|---|---|---|
| SEC8b-5 | DEFERRED | VERIFIED-SAFE (code) | `/privacy` already derives `aiChatLogs` retention from `DATA_RETENTION_DAYS`; 1825-day copy is auto-rendered. Operator-side comms remains a non-code task. |
| ARCH8b-3 | DEFERRED | VERIFIED-SAFE | `LectureModeProvider` is a pure client component, conditionally mounted in the public layout. |

## Carry-forward DEFERRED items still open

All cycle-8 deferred items unchanged except for the two reclassified
above. See `_aggregate-cycle-8-2026-05-16.md` for the full table.
Highlights:
- SEC8b-1 (plaintext plugin secrets) — operator policy.
- PERF8b-1 (TLE budget +2s) — operator-accepted tradeoff.
- ARCH8b-1/2/4, CR8b-3, TE8b-3/4/5 — small cleanups, non-blocking.
- AGG7 carry-forwards from earlier cycles unchanged.

## Cross-agent agreement

- CR9-2 / ARCH9-1 / TE9-1 (language map dedup) flagged by three
  agents — highest priority of this cycle.
- CR9-3 + ARCH8b-2 (carry-forward) both want clearer marking on the
  plaintext-secrets path — addressed together via JSDoc edits.

## Agent failures

Subagent fan-out unavailable in this environment (no `Agent` tool
registered with `subagent_type` for code-reviewer/perf-reviewer/etc.).
Performed as a single-agent comprehensive review, mirroring cycles
30+ in this repo.

## Verdict

Cycle 9 (orchestrator cycle 2/100) starts from a healthy baseline.
The actionable plan is small: consolidate the duplicate language map
(CR9-2/ARCH9-1) with unit coverage (TE9-1), tighten secrets module
docs/dead-code (CR9-3, SEC9-1), small useMemo win (PERF9-2), and
archive cycle-8 plan (CR9-4). CR9-1 stays deferred with a clearly
recorded exit criterion.
