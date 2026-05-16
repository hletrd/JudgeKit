# Cycle 9 RPF Review Remediation Plan

**Date:** 2026-05-16
**Cycle:** 2/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate-cycle-9-2026-05-16.md`
**Per-agent reviews:** `.context/reviews/{code-reviewer,security-reviewer,perf-reviewer,test-engineer,architect,critic,verifier}-cycle-9-2026-05-16.md`

---

## Summary

Cycle 9 starts from a green baseline (lint, build, unit gates all pass
at `9854e072`). No HIGH or MEDIUM findings emerged. The actionable
work is a small consolidation pass:

1. Unify the duplicate "judge language id → highlighter language id"
   maps (`code-timeline-panel.tsx::LANGUAGE_TO_HLJS` →
   `code/language-map.ts`) with unit coverage.
2. Re-wire the dead `isValidEncryptedPluginSecret` helper as
   defense-in-depth on incoming `enc:v1:` writes (or remove it).
3. Add JSDoc clarification + `@policy: plaintext` marker on
   `decryptPluginSecret` and `preparePluginConfigForStorage` to make
   the cycle-8 policy change discoverable in source.
4. `useMemo` the `problems`/`problemLabels` derivations in
   `code-timeline-panel.tsx`.
5. Reclassify SEC8b-5 and ARCH8b-3 from DEFERRED to VERIFIED-SAFE in
   the aggregate ledger (already done in `_aggregate-cycle-9`).
6. Archive cycle-8 plan to `plans/done/` per
   `plans/open/README.md` housekeeping convention.
7. Run all gates and deploy.

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | Add `getHighlightJsLanguage()` adapter to `src/lib/code/language-map.ts` returning `undefined` when canonical lookup yields `"plaintext"`, derived from `CODE_SURFACE_LANGUAGE_MAP`. Cover any judge-language-id present in `LANGUAGE_TO_HLJS` but missing from the canonical map (`node`, `bash`, `ruby`, `scala`, `haskell`, `ocaml`, `lua`, `c11`, `c89`, `c99`, `cpp`, `cpp17`, `python3`, `csharp` aliases). | LOW | [ ] |
| 2 | Replace `LANGUAGE_TO_HLJS` and `hljsLanguageFor` in `src/components/contest/code-timeline-panel.tsx` with `getHighlightJsLanguage` from the adapter. Delete the local map. | LOW | [ ] |
| 3 | Add unit tests for `getHighlightJsLanguage` in `tests/unit/code/language-map.test.ts`: known-language, case-insensitive, plaintext-fallback returns undefined, unknown returns undefined. | LOW | [ ] |
| 4 | In `src/lib/plugins/secrets.ts`, wire `isValidEncryptedPluginSecret` into `preparePluginConfigForStorage`: when `incomingValue.startsWith("enc:v1:")` but the value is not well-formed (per the validator), reject the write with a descriptive error rather than persisting a malformed ciphertext. Plaintext writes continue to bypass the validator unchanged. | LOW (defense-in-depth) | [ ] |
| 5 | Add `@policy: plaintext` JSDoc marker + brief explanation on `preparePluginConfigForStorage` and tighten the `decryptPluginSecret` JSDoc to clearly call out the dual-mode (plaintext-pass-through + legacy-decrypt) behavior. | LOW (ARCH8b-2 + CR9-3) | [ ] |
| 6 | `useMemo` the `problems` and `problemLabels` derivations in `code-timeline-panel.tsx` keyed on `[snapshots]` (and `t` for labels). | LOW (PERF9-2) | [ ] |
| 7 | Move `plans/open/2026-05-16-cycle-8-rpf-review-remediation.md` to `plans/done/`. | LOW (housekeeping, CR9-4) | [ ] |
| 8 | Run all gates: `npm run lint`, `npm run build`, `npm run test:unit`. | — | [ ] |
| 9 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [ ] |
| 10 | Run per-cycle `DEPLOY_CMD`. | — | [ ] |

---

## Quality gates

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test:unit`

---

## Deferred ledger (cycle 9)

Per `plans/open/README.md` and the orchestrator's deferred-fix rules,
every still-open finding is either implemented above or recorded here
with severity preserved and a stated exit criterion.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| CR9-1 | LOW | MEDIUM | `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx:18-40` | Latent race only triggers on parent RSC re-render between user-click and effect re-run; functional setter mitigates same-value writes. Refactor would touch the existing cycle-8 lint fix and risk reintroducing `react-hooks/set-state-in-effect`. | Refactor `applyHash(initialHash)` out of the deps-tracked effect (e.g. `useLayoutEffect` with `[]` deps + `useRef` for the captured initialHash) without re-triggering the lint rule. |
| CRIT9-1 | LOW (governance) | HIGH | `docs/policy/` (missing) | Documentation-only, not code; orchestrator ledger already preserves operator policy decisions, and adding a new doc taxonomy is out of scope for a small RPF cycle. | Operator-decisions registry doc added under `docs/` (or `.context/`) with date/decision-maker/justification per cycle-8 entries. |
| All cycle-8 carry-forward defers | LOW | varies | various | No status change beyond the two reclassifications captured in `_aggregate-cycle-9-2026-05-16.md` (SEC8b-5, ARCH8b-3 → VERIFIED-SAFE). | Per their original entries in `_aggregate-cycle-8-2026-05-16.md`. |

No security/correctness/data-loss item is deferred without operator
policy backing or an explicit, narrowly-scoped technical reason
above. CR9-1's deferral is bounded by the explicit exit criterion of
"refactor without re-introducing the cycle-8 lint regression"; the
race only manifests on parent RSC re-render between a user click and
the effect re-run, and the functional setter mitigates same-value
writes.

---

## Progress

- [ ] Per-agent reviews written — DONE in PROMPT 1
- [ ] Aggregate written — DONE in PROMPT 1
- [ ] Plan written — DONE (this file)
- [ ] Lint passes
- [ ] Unit tests pass
- [ ] Build passes
- [ ] Committed and pushed
- [ ] Deployed
