# Cycle 5 (RPF, 2026-06-17) — Function-Judging NON-responsive correctness

Source: `.context/reviews/_aggregate.md` (cycle-5 section) +
`.context/reviews/code-reviewer.md` + `.context/reviews/test-engineer.md`.
Primary focus this run: clear the carried-forward NON-responsive correctness
findings (AGG-2/CF-1, AGG-3/CF-2, AGG-4/CF-3). The responsive UI gate stays a
regression guard only (no UI change planned; 16/16 green).

Repo policy binding this plan: GPG-signed commits (`git commit -S`),
Conventional Commits + gitmoji, no `--no-verify`, no force-push, no custom
letter-spacing / `tracking-*` on Korean text, preserve `src/lib/auth/config.ts`,
latest toolchains. Security/correctness/data-loss findings are NOT deferrable
unless a repo rule explicitly authorizes (D1 below cites such a rule).

## FRESH-REVIEW RESULT
No NEW defect surfaced beyond the tracked carry-forward set. The three Medium
correctness findings are scheduled below for FIX this cycle. The responsive
focus remains VERIFIED-CONVERGED (cycles 1-4); no UI change is planned.

## TO IMPLEMENT THIS CYCLE (PROMPT 3)

### P1 — AGG-2 / CF-1 (Medium) mapCompileError `:N:` over-match — FIX
- File: `src/lib/judge/function-judging/error-mapping.ts:26`.
- Problem: `.replace(/:(\d+):/g, …)` shifts ANY `:N:` token (column pairs like
  `12:5`, clock times like `:30:`, unrelated `:8:` in a path/message), not only
  `file:line:col`. Display-only (gated by showCompileOutput), never affects
  verdicts, but the displayed compiler output is corrupted/misleading.
- Fix: anchor the `:N:` rewrite on a preceding source-filename token, i.e. only
  rewrite the `line` portion of `<filename>.<ext>:N:` (optionally followed by a
  `:col:`). Bare `:N:` and column-pairs in caret/annotation lines stay intact.
  Keep the `line N` rewrite as-is (it is already word-anchored).
- Tests (TST-2): add regression cases proving a bare `:8:`, a `12:5` column pair
  not preceded by a filename, and a clock `12:30:45` are NOT shifted, while a
  real `solution.cpp:12:5:` IS shifted.
- Status: DONE.

### P2 — AGG-3 / CF-2 (Medium) Cross-language string-escaping divergence — FIX
- Files: `adapters/{python,go,cpp,java,csharp}.ts` + golden test.
- Canonical contract = `JSON.stringify` (ECMA-404), matching the TS/JS adapters
  and `serialization.ts encodeValue`: raw `<>&`, raw non-ASCII (UTF-8), named
  short escapes `\b \t \n \f \r \" \\`, `\u00XX` for remaining control chars.
- Fixes:
  - Python (`adapters/python.ts:12`): `json.dumps(result, ensure_ascii=False,
    separators=(",", ":"))` so non-ASCII stays raw.
  - Go (`adapters/go.ts`): replace `json.Marshal` with a `json.Encoder` that has
    `SetEscapeHTML(false)`, trimming the trailing newline the encoder adds.
  - C++/Java/C# string writers: add `\b` and `\f` named escapes and a
    `\u00XX` fallback for any other control char < 0x20.
- Tests (cross-language golden, TST-3): assert each adapter's EXPECTED writer
  output for strings containing `<>&`, non-ASCII, quotes, backslash, `\n\t\r\b\f`,
  NUL, U+001F is byte-identical to `encodeValue`. For the compiled adapters the
  writer logic is generated TS text, so the golden test reproduces the canonical
  contract in TS and checks the writers cover the same cases (assert the writer
  source emits the named escapes + `\u00XX` fallback).
- Status: DONE.

### P3 — AGG-4 / CF-3 (Medium) Single-line stdin contract — FIX (assert+document)
- File: `src/lib/judge/function-judging/serialization.ts`.
- Fix: document the single-line stdin invariant on `encodeArgs`; add a defensive
  guard that throws if the produced encoding contains a raw `\n` or `\r`
  (`JSON.stringify` escapes them, so this only fires if the contract is ever
  broken upstream).
- Tests (TST-3): round-trip fuzz for string/string[] args with newlines, commas,
  quotes, backslashes, non-ASCII — assert single-line + decode round-trip.
- Status: DONE.

## CARRIED FORWARD — LOW cleanups (CF-5; still open, unchanged)
- SEC-3: trim host paths from compute-expected returned diagnostics.
- PERF-1: optional concurrency cap for compute-expected case runs.
- ARC-4: extract shared `resolveExecLanguage`.
- DBG-4: confirm prompt when removing a param that has authored values.
- TST-4: integration test that student GET omits `referenceSolution`.
Reason these stay open: all Low severity, none correctness/security/data-loss;
this cycle prioritizes the three Medium correctness findings. Exit criterion:
schedule in a future RPF cycle; no severity downgrade.

## DEFERRED (existing review findings; severity preserved, exit criteria stated)

### D1 — CR-2 / VER-3 (Low, latent) Locale-sensitive double printers (C++/Java/C#)
- Files: `adapters/cpp.ts:115`, `adapters/java.ts:176`, `adapters/csharp.ts:141`.
- Reason for deferral: `double`/`double[]` are intentionally excluded from
  `AUTHORABLE_FUNCTION_TYPES` (`types.ts:20`) in v1, so this code path is
  unreachable from any authorable problem. The repo's own design note
  (`types.ts:11-22`) documents that double is deferred to v1.1 with the mapping
  code kept intact — that design note is the authority permitting this deferral.
- Severity: Low (latent). Confidence: High.
- Exit criterion: RE-OPEN and fix (C++ force `"C"` locale / manual format; Java
  `String.format(Locale.ROOT, …)`; C# already invariant) with a cross-locale
  double golden test BEFORE `double`/`double[]` is added back to
  `AUTHORABLE_FUNCTION_TYPES`.

## PROGRESS
- 2026-06-17: Fresh review (no new findings). P1/P2/P3 implemented in PROMPT 3.
  CF-5 low cleanups carried forward unchanged; D1 deferred with exit criterion.
  No finding dropped or downgraded.
