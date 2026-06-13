# document-specialist — RPF Cycle 10 (2026-06-13)

**HEAD:** 03125b44 (clean tree).

## Method
Cross-checked AGENTS.md / CLAUDE.md claims against the live code: language count, Step 5b sunset criteria, deploy env-var contract, and the relational-query footgun note.

## Findings
**No new actionable doc-code mismatches.**
- AGENTS.md Step 5b sunset subsection: target re-eval date 2026-10-26 is NOT yet reached (today 2026-06-13). The backfill correctly remains in `deploy-docker.sh` and the doc correctly still describes it. No edit due.
- The cycle-9 fixes are documented in the cycle-9 plan completion record (commits + final gates + deploy record) — accurate against `git log`.
- AGENTS.md language table notes it can drift from `languages.ts`/`docs/languages.md` (source of truth) — an honest, self-documenting caveat, not a defect.
- The deferred-register in the cycle-9 plan accurately reflects AGG8-2 / P6-1 status (both blocks unedited this cycle).

## Carried
None doc-specific with a fired exit criterion. The Step 5b doc-removal is gated on 2026-10-26 + column-absence verification (carry).
