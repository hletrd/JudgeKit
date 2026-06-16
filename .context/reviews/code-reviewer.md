# Code Review — cycle 4 (2026-06-17)

Focus: function-signature judging pipeline + the cross-file interactions that
carry the open findings forward. Re-read live this cycle; nothing downgraded.

## CARRIED FORWARD — re-confirmed real this cycle

### CR4-1 = AGG-2 / CF-1 (Medium) mapCompileError `:(\d+):` over-matches
`src/lib/judge/function-judging/error-mapping.ts:26`. The second
`.replace(/:(\d+):/g, …)` shifts ANY `:N:` token, not only `file:line:col`. A
column-pair rendered as `12:5` inside a caret line, or an unrelated `:8:` in a
path or message, gets silently decremented by `preludeLineCount`. The existing
test (`error-mapping.test.ts`) only exercises real `file:line:col` shapes, so it
does not catch the over-match. Fix: gate the `:N:` rewrite on a preceding
source-filename token (e.g. require `\.\w+:N:` or a `file:line:col` anchor) and
add a unit test that proves a bare `:8:` in prose is left intact.

### CR4-2 = AGG-3 / CF-2 (Medium) Cross-language string-escaping divergence — BROADER THAN PREVIOUSLY RECORDED
Expected output is computed by running the reference solution in ONE language
(`compute-expected/route.ts:75-79` assembles with
`problem.referenceSolution.language`), stored, then student output in ANY enabled
language is compared against it. For a `string` / `string[]` return (both ARE
authorable; only `double` is excluded, `types.ts:20`) the per-language JSON
writers diverge:
- **C++** (`adapters/cpp.ts:117`) and **Java** (`adapters/java.ts:178`): escape
  only `" \ \n \t \r`; emit `<`, `>`, `&` and all non-ASCII bytes RAW.
- **Go** (`adapters/go.ts:92`, `json.Marshal`): escapes `<`,`>`,`&` as
  `<`/`>`/`&`; emits non-ASCII raw.
- **Python** (`adapters/python.ts:12`, `json.dumps` default `ensure_ascii=True`):
  escapes ALL non-ASCII to `\uXXXX`; keeps `<`,`>`,`&` raw. **(Python was NOT
  called out in the cycle-3 note — the divergence is wider than recorded: the
  default-language reference (python) itself diverges from C++/Java/Go/JS/TS on
  non-ASCII.)**
- **JS/TS** (`JSON.stringify`): keeps `<`,`>`,`&` and non-ASCII raw.
So a `string` problem whose expected is computed in Python and submitted in Go
(or vice-versa) WRONG-ANSWERs a correct solution whenever the value contains
`<`, `>`, `&`, or any non-ASCII character, under the default `exact` mode. Fix:
pin one canonical escaping contract and reconcile every writer to it
(recommended: keep `<>&` raw and non-ASCII raw — Python emit with
`ensure_ascii=False`, Go use an `Encoder` with `SetEscapeHTML(false)`), then add
a cross-language golden test for `string` / `string[]` returns containing `<`,
`>`, `&`, non-ASCII, quotes, backslash, and control chars.

### CR4-3 = AGG-4 / CF-3 (Medium) Implicit single-line stdin contract is unasserted
`serialization.ts:18,22` join encoded args with no newline, and every harness
reads exactly one stdin line. Nothing asserts the encoded output is
newline-free. A `string` arg carrying `\n` is escaped to `\\n` by
`JSON.stringify` (safe today), but the invariant is undocumented and unguarded:
the moment any path emits a literal newline into `encodeArgs` output the
one-line protocol breaks silently across all adapters. Fix: assert/document that
`encodeArgs` output contains no raw `\n`, plus a round-trip fuzz test.

## LOW (carried) CF-5
SEC-3 (host-path trim from compute-expected diagnostics), PERF-1
(compute-expected concurrency cap), ARC-4 (shared `resolveExecLanguage`), DBG-4
(confirm-on-param-removal), TST-3/TST-4 (string[] fuzz + student-GET
referenceSolution-absence integration test). All still open, unchanged.

## DEFERRED (unchanged, exit criterion preserved)
D1 / CR-2 / VER-3 (Low, latent) locale-sensitive double printers
(`adapters/cpp.ts:115` `%.10g`, `adapters/java.ts:176` `String.format("%.10g")`).
Unreachable while `double`/`double[]` are excluded from
`AUTHORABLE_FUNCTION_TYPES` (`types.ts:20`), documented deferred to v1.1
(`types.ts:11-22`) — the repo's own design note authorizes the deferral. Exit
criterion: re-open and fix (force `"C"` locale / `Locale.ROOT`) with a
cross-locale double golden test BEFORE re-enabling authorable double.

## POSITIVES (re-confirmed)
- Reference solution stripped from student reads (problem GET route).
- `preludeLineCount` recomputed, never stored (`assemble.ts`) — no drift.
- Safe-integer guard on int/long authoring (`value-fields.ts:28`).
- Local e2e standalone bring-up (cycle-3 P1) holds: strong ephemeral secrets
  minted, standalone `server.js` served.
