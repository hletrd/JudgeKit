# Critic — multi-perspective (cycle 1, 2026-06-16)

- Authoring UX (instructor): the FunctionSignatureBuilder param rows use a flex-wrap with min-w-[160px] name + min-w-[120px] type select + ghost remove button. On a ~375px phone the three items can wrap so the remove (trash) button drops to its own line, detaching it from the row it removes — confusing. LIVE-CHECK pending (designer).
- Student UX: the gated language dropdown only lists enabledLanguages for function problems — good, prevents submitting in an unsupported language. Reset-to-stub button present.
- Maintainability: 7 hand-written JSON readers/writers (one per language) duplicate escaping logic; a subtle divergence (e.g. C++ vs Java string-escape set) could cause cross-language judge disagreement on the SAME expected output. Only `\n \t \r \b \f / " \\` handled; control chars < 0x20 other than these are emitted raw by JS JSON.stringify as `\u00XX` — verify each reader handles `\uXXXX` (C++/Java do; JS/TS/Python/Go/C# use native JSON). Medium.
- Doc/code: AUTHORABLE excludes double; docs (commit b6a6acc5) updated. Consistent.
