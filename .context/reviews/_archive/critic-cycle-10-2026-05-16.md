# Critic — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop
**HEAD reviewed:** `23dd9e80`

## Cross-perspective notes

- **i18n discipline (CR10-1):** The product targets Korean as the
  primary locale, but the cycle-8 ParticipantTimelineBar leaks raw
  English literals (`0m`, `Score:`, `h /m /s`) into the rendered
  audit page. This is the most user-visible issue this cycle even
  though it is "only" LOW.
- **Dead API surface (CR10-2, ARCH10-1):** The translations bag
  declares 6 unused keys. Future maintainers will read them as
  "needed" and may add render code for them, propagating churn.
  Tightening the type now is cheap.
- **`href="#"` (CR10-3):** Defensive-but-misleading. Production
  data should always provide `submissionId` for the submission and
  first_ac branches, so the `"#"` branch is dead at runtime. Still
  worth fixing — defensive code that lies about its semantics is
  worse than an explicit `null` guard.
- **Naming drift (ARCH10-2, CR10-4):** Each cycle-8 widening adds a
  little semantic load to existing names without rebalancing. The
  helper `canShowParticipationView` (ARCH10-2) and the
  `getEnrolledContestDetail` rename (CR10-4) would both pay this
  back.

## Carry-forward concerns

- The `decryptPluginSecret` name remains semantically misleading
  even after the cycle-9 JSDoc clarification: a function that
  routinely returns the input unchanged is not "decrypting". Cycle-9
  CR9-3 was addressed via JSDoc as a deliberate non-renaming. Still
  on the deferred ledger via CR8b-3.

## Verdict

Nothing critical. The cycle-8/cycle-9 batches landed cleanly. Four
LOW housekeeping items (i18n, dead bag fields, link-vs-button, name
drift) are the only NEW concerns.
