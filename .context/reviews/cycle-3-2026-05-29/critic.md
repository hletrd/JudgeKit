# critic — Cycle 3 (2026-05-29)

Multi-perspective critique of the change surface and the review process itself.

1. **Highest-signal net-new item is small and real: the silent signup catch.**
   The codebase has converged hard — cycle-1 and cycle-2 findings are all fixed or
   ledgered. The one genuinely net-new, fixable-this-cycle item is the asymmetry
   between the recruiting fire-and-forget catch (logs, 9cd4b16e) and the
   public-signup one (`() => {}`, swallows). The comment claims "logged inside",
   but `sendEmailVerification` only logs the `sendEmail`-failure branch, not its
   own DB/token/config throws. This is a 2-line fix + 1 test. Do it.
   (DBG-C3-3 / VER-C3-1 / TE-C3-1.)

2. **The base-URL host-trust item should finally be implemented, not re-deferred a
   third time.** It has appeared as F4-cycle1, SEC-C2-2/CR-C2-3 (cycle2), and now
   CR-C3-1/SEC-C3-1/ARCH-C3-1/VER-C3-2. Four cycles of "OPEN" with the exact fix
   anchor (`getAuthUrl()` + a `getPublicBaseUrl()` helper) now identified. It is
   low-risk, high-clarity, closes a duplication AND a CWE-601-class defense-in-
   depth gap. Re-deferring it again is the wrong call when the helper is trivial.

3. **F2 (bulk email divergence) is correctly deferred — don't force it.** It is a
   genuine product decision (auto-email on bulk import vs. deliberately not). The
   ledger criterion is right. Resist the urge to "fix" it by guessing intent.

4. **Process critique:** the per-send config re-resolution (PERF) and
   `hashConfig`-retains-cleartext (CR/SEC) items have been Low/OPEN for multiple
   cycles. They're legitimately low-priority, but bundling the
   `hashConfig`→fingerprint change with the base-URL helper would be cheap and
   would retire two long-standing deferrals at once. Optional.

5. **No over-engineering risk this cycle.** The actionable set is tiny (signup
   log symmetry + centralized base-URL helper + their tests). That is the right
   scope; do not invent refactors beyond it.

Verdict: implement (a) signup-catch logging + test, (b) `getPublicBaseUrl` helper
used in both email sites + test. Keep F2 deferred. Everything else stays
Low/OPEN.
