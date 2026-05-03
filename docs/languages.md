# Supported Languages (125 variants)

Multi-arch Docker images covering 125 language variants. Deployed on both AMD64 (test) and ARM64 (production).

| # | Language ID | Description | Docker Image | amd64 | arm64 | amd64 E2E | arm64 E2E |
|---|-------------|-------------|--------------|-------|-------|-----------|-----------|
| 1 | `c89` | C (C89, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 2 | `c99` | C (C99, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 3 | `c17` | C (C17, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 4 | `c23` | C (C23, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 5 | `cpp20` | C++ (C++20, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 6 | `cpp23` | C++ (C++23, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 7 | `cpp26` | C++ (C++26, GCC) | `judge-cpp` | ✅ | ✅ | — | — |
| 8 | `clang_c23` | C (C23, Clang) | `judge-clang` | ✅ | ✅ | ✅ | ✅ |
| 9 | `clang_cpp23` | C++ (C++23, Clang) | `judge-clang` | ✅ | ✅ | ✅ | ✅ |
| 10 | `clang_cpp26` | C++ (C++26, Clang) | `judge-clang` | ✅ | ✅ | — | — |
| 11 | `llvm_ir` | LLVM IR (compiled with clang) | `judge-clang` | ✅ | ✅ | ✅ | ✅ |
| 12 | `java` | Java 25 | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 13 | `kotlin` | Kotlin 2.3 | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 14 | `python` | Python 3.14 | `judge-python` | ✅ | ✅ | ✅ | ✅ |
| 15 | `pypy` | PyPy 3.10 | `judge-pypy` | ✅ | ✅ | ✅ | ✅ |
| 16 | `javascript` | Node.js 24 | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 17 | `typescript` | TypeScript 6.0 (Node.js 24) | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 18 | `coffeescript` | CoffeeScript 2.7 (Node.js 24) | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 19 | `rust` | Rust 1.94 | `judge-rust` | ✅ | ✅ | ✅ | ✅ |
| 20 | `go` | Go 1.26 | `judge-go` | ✅ | ✅ | ✅ | ✅ |
| 21 | `swift` | Swift 6.2 | `judge-swift` | ✅ | ✅ | ✅ | ✅ |
| 22 | `csharp` | C# (Mono 6.12) | `judge-csharp` | ✅ | ✅ | ✅ | ✅ |
| 23 | `fsharp` | F# (.NET 10) | `judge-fsharp` | ✅ | ✅ | ✅ | ✅ |
| 24 | `vbnet` | Visual Basic .NET (.NET 10) | `judge-fsharp` | ✅ | ✅ | ✅ | ✅ |
| 25 | `r` | R 4.5 | `judge-r` | ✅ | ✅ | ✅ | ✅ |
| 26 | `perl` | Perl 5.40 | `judge-perl` | ✅ | ✅ | ✅ | ✅ |
| 27 | `php` | PHP 8.4 | `judge-php` | ✅ | ✅ | ✅ | ✅ |
| 28 | `ruby` | Ruby 3.4 | `judge-ruby` | ✅ | ✅ | ✅ | ✅ |
| 29 | `lua` | Lua 5.4 | `judge-lua` | ✅ | ✅ | ✅ | ✅ |
| 30 | `haskell` | Haskell (GHC 9.4) | `judge-haskell` | ✅ | ✅ | ✅ | ✅ |
| 31 | `dart` | Dart 3.8 | `judge-dart` | ✅ | ✅ | ✅ | ✅ |
| 32 | `zig` | Zig 0.13 | `judge-zig` | ✅ | ✅ | ✅ | ✅ |
| 33 | `nim` | Nim 2.2 | `judge-nim` | ✅ | ✅ | ✅ | ✅ |
| 34 | `ocaml` | OCaml 4.14 | `judge-ocaml` | ✅ | ✅ | ✅ | ✅ |
| 35 | `elixir` | Elixir 1.18 | `judge-elixir` | ✅ | ✅ | ✅ | ✅ |
| 36 | `julia` | Julia 1.12 | `judge-julia` | ✅ | ✅ | ✅ | ✅ |
| 37 | `d` | D (LDC 1.39) | `judge-d` | ✅ | ✅ | ✅ | ✅ |
| 38 | `racket` | Racket 8.10 | `judge-racket` | ✅ | ✅ | ✅ | ✅ |
| 39 | `vlang` | V 0.5 | `judge-v` | ✅ | ✅ | ✅ | ✅ |
| 40 | `fortran` | Fortran (GFortran 14) | `judge-fortran` | ✅ | ✅ | ✅ | ✅ |
| 41 | `pascal` | Pascal (FPC 3.2) | `judge-pascal` | ✅ | ✅ | ✅ | ✅ |
| 42 | `delphi` | Delphi (FPC, Delphi mode) | `judge-pascal` | ✅ | ✅ | ✅ | ✅ |
| 43 | `cobol` | COBOL (GnuCOBOL 3.2) | `judge-cobol` | ✅ | ✅ | ✅ | ✅ |
| 44 | `scala` | Scala 3.5 | `judge-scala` | ✅ | ✅ | ✅ | ✅ |
| 45 | `erlang` | Erlang 27 | `judge-erlang` | ✅ | ✅ | ✅ | ✅ |
| 46 | `commonlisp` | Common Lisp (SBCL 2.5) | `judge-commonlisp` | ✅ | ✅ | ✅ | ✅ |
| 47 | `bash` | Bash 5.2 | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 48 | `sed` | Sed | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 49 | `dc` | dc (desk calculator) | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 50 | `ada` | Ada (GNAT 14) | `judge-ada` | ✅ | ✅ | ✅ | ✅ |
| 51 | `clojure` | Clojure 1.12 | `judge-clojure` | ✅ | ✅ | ✅ | ✅ |
| 52 | `prolog` | Prolog (SWI-Prolog 9) | `judge-prolog` | ✅ | ✅ | ✅ | ✅ |
| 53 | `tcl` | Tcl 8.6 | `judge-tcl` | ✅ | ✅ | ✅ | ✅ |
| 54 | `awk` | AWK (GAWK 5) | `judge-awk` | ✅ | ✅ | ✅ | ✅ |
| 55 | `scheme` | Scheme (Chicken 5) | `judge-scheme` | ✅ | ✅ | ✅ | ✅ |
| 56 | `groovy` | Groovy 4.0 | `judge-groovy` | ✅ | ✅ | ✅ | ✅ |
| 57 | `octave` | GNU Octave 9 | `judge-octave` | ✅ | ✅ | ✅ | ✅ |
| 58 | `crystal` | Crystal 1.14 | `judge-crystal` | ✅ | ✅ | ✅ | ✅ |
| 59 | `powershell` | PowerShell 7.5 | `judge-powershell` | ✅ | ✅ | ✅ | ✅ |
| 60 | `postscript` | PostScript (Ghostscript 10) | `judge-postscript` | ✅ | ✅ | ✅ | ✅ |
| 61 | `brainfuck` | Brainfuck | `judge-brainfuck` | ✅ | ✅ | ✅ | ✅ |
| 62 | `befunge` | Befunge-93 | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 63 | `aheui` | Aheui | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 64 | `hyeong` | Hyeong | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 65 | `whitespace` | Whitespace | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 66 | `b` | B (BCause / bext-lang) | `judge-b` | ✅ | ✅ | ✅ | ✅ |
| 67 | `flix` | Flix (JVM) | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 68 | `apl` | APL (GNU APL) | `judge-apl` | ✅ | ✅ | ✅ | ✅ |
| 69 | `freebasic` | FreeBASIC | `judge-freebasic` | ✅ | ✅ | ✅ | ✅ |
| 70 | `smalltalk` | Smalltalk (GNU Smalltalk) | `judge-smalltalk` | ✅ | ✅ | ✅ | ✅ |
| 71 | `nasm` | Assembly (NASM x86-64 / GNU as AArch64) | `judge-nasm` | ✅ | ✅ | ✅ | ✅ |
| 72 | `objective_c` | Objective-C (GCC gobjc) | `judge-objective-c` | ✅ | ✅ | ✅ | ✅ |
| 73 | `forth` | Forth (Gforth) | `judge-forth` | ✅ | ✅ | ✅ | ✅ |
| 74 | `raku` | Raku (Rakudo) | `judge-raku` | ✅ | ✅ | ✅ | ✅ |
| 75 | `haxe` | Haxe 4.3 (Python backend) | `judge-haxe` | ✅ | ✅ | ✅ | ✅ |
| 76 | `odin` | Odin | `judge-odin` | ✅ | ✅ | ✅ | ✅ |
| 77 | `uiua` | Uiua | `judge-uiua` | ✅ | ✅ | ✅ | ✅ |
| 78 | `bqn` | BQN (CBQN) | `judge-bqn` | ✅ | ✅ | ✅ | ✅ |
| 79 | `icon` | Icon | `judge-icon` | ✅ | ✅ | ✅ | ✅ |
| 80 | `algol68` | Algol 68 (a68g) | `judge-algol68` | ✅ | ✅ | ✅ | ✅ |
| 81 | `snobol4` | SNOBOL4 (CSNOBOL4) | `judge-snobol4` | ✅ | ✅ | ✅ | ✅ |
| 82 | `lolcode` | LOLCODE (lci) | `judge-lolcode` | ✅ | ✅ | ✅ | ✅ |
| 83 | `shakespeare` | Shakespeare (shakespearelang) | `judge-shakespeare` | ✅ | ✅ | ✅ | ✅ |
| 84 | `umjunsik` | 엄준식 (Umjunsik) | `judge-umjunsik` | ✅ | ✅ | ✅ | ✅ |
| 85 | `deno_js` | JavaScript (Deno) | `judge-deno` | ✅ | ✅ | ✅ | ✅ |
| 86 | `deno_ts` | TypeScript (Deno) | `judge-deno` | ✅ | ✅ | ✅ | ✅ |
| 87 | `bun_js` | JavaScript (Bun) | `judge-bun` | ✅ | ✅ | ✅ | ✅ |
| 88 | `bun_ts` | TypeScript (Bun) | `judge-bun` | ✅ | ✅ | ✅ | ✅ |
| 89 | `gleam` | Gleam (Erlang target) | `judge-gleam` | ✅ | ✅ | ✅ | ✅ |
| 90 | `sml` | Standard ML (Poly/ML) | `judge-sml` | ✅ | ✅ | ✅ | ✅ |
| 91 | `fennel` | Fennel (Lua VM) | `judge-lua` | ✅ | ✅ | ✅ | ✅ |
| 92 | `micropython` | MicroPython | `judge-micropython` | ✅ | ✅ | ✅ | ✅ |
| 93 | `squirrel` | Squirrel 3.2 | `judge-squirrel` | ✅ | ✅ | ✅ | ✅ |
| 94 | `rexx` | Rexx (Regina) | `judge-rexx` | ✅ | ✅ | ✅ | ✅ |
| 95 | `hy` | Hy (Lisp on Python) | `judge-hy` | ✅ | ✅ | ✅ | ✅ |
| 96 | `arturo` | Arturo | `judge-arturo` | ✅ | ✅ | ✅ | ✅ |
| 97 | `janet` | Janet | `judge-janet` | ✅ | ✅ | ✅ | ✅ |
| 98 | `c3` | C3 | `judge-c3` | ✅ | ✅ | ✅ | ✅ |
| 99 | `vala` | Vala | `judge-vala` | ✅ | ✅ | ✅ | ✅ |
| 100 | `nelua` | Nelua | `judge-nelua` | ✅ | ✅ | ✅ | ✅ |
| 101 | `hare` | Hare | `judge-hare` | ✅ | ✅ | ✅ | ✅ |
| 102 | `koka` | Koka | `judge-koka` | ✅ | ✅ | ✅ | ✅ |
| 103 | `lean` | Lean 4 | `judge-lean` | ✅ | ✅ | ✅ | ✅ |
| 104 | `picat` | Picat 3.9 | `judge-picat` | ✅ | ✅ | ✅ | ✅ |
| 105 | `mercury` | Mercury 22.01.8 | `judge-mercury` | ✅ | ✅ | ✅ | ✅ |
| 106 | `wat` | WebAssembly (WAT, wabt+wasmtime) | `judge-wat` | ✅ | ✅ | ✅ | ✅ |
| 107 | `purescript` | PureScript 0.15.16 | `judge-purescript` | ✅ | ✅ | ✅ | ✅ |
| 108 | `modula2` | Modula-2 (GCC gm2) | `judge-modula2` | ✅ | ✅ | ✅ | ✅ |
| 109 | `factor` | Factor 0.101 | `judge-factor` | ✅ | ✅ | ✅ | ✅ |
| 110 | `spark` | SPARK (Ada/SPARK 2014, GNAT) | `judge-ada` | ✅ | ✅ | ✅ | ✅ |
| 111 | `minizinc` | MiniZinc 2.9.5 | `judge-minizinc` | ✅ | ✅ | ✅ | ✅ |
| 112 | `curry` | Curry (PAKCS 3.9.0) | `judge-curry` | ✅ | ✅ | ✅ | ✅ |
| 113 | `clean` | Clean 3.1 | `judge-clean` | ✅ | ✅ | ✅ | ✅ |
| 114 | `carp` | Carp 0.5.5 | `judge-carp` | ✅ | ✅ | ✅ | ✅ |
| 115 | `grain` | Grain 0.7.2 | `judge-grain` | ✅ | ✅ | ✅ | ✅ |
| 116 | `pony` | Pony 0.61.1 | `judge-pony` | ✅ | ✅ | ✅ | ✅ |
| 117 | `moonbit` | MoonBit 0.8 (native) | `judge-moonbit` | ✅ | ✅ | ✅ | ✅ |
| 118 | `chapel` | Chapel 2.8 | `judge-chapel` | ✅ | ✅ | ✅ | ✅ |
| 119 | `idris2` | Idris 2 0.8.0 (Chez Scheme) | `judge-idris2` | ✅ | ✅ | ✅ | ✅ |
| 120 | `rescript` | ReScript 12.2 (Node.js) | `judge-rescript` | ✅ | ✅ | ✅ | ✅ |
| 121 | `elm` | Elm 0.19.1 (Node.js) | `judge-elm` | ✅ | ✅ | ✅ | ✅ |
| 122 | `plaintext` | Plaintext (output-only passthrough) | `judge-node` | ✅ | ✅ | — | — |
| 123 | `verilog` | Verilog (literal `$display` / `$write` only) | `judge-node` | ✅ | ✅ | — | — |
| 124 | `systemverilog` | SystemVerilog (literal `$display` / `$write` only) | `judge-node` | ✅ | ✅ | — | — |
| 125 | `vhdl` | VHDL (literal `report` only) | `judge-node` | ✅ | ✅ | — | — |

> Note: `plaintext`, `verilog`, `systemverilog`, and `vhdl` are new output-only additions that reuse the shared `judge-node` image. They are not included in the historical March 29 remote E2E totals below yet.

## Output-only Language Behavior

The following languages are intentionally **output-only**. They do not use a
full HDL simulator or compiler toolchain:

| Language | Behavior | Supported output syntax |
|----------|----------|-------------------------|
| `plaintext` | Emits the submission source verbatim | Raw file contents |
| `verilog` | Extracts literal output strings | `$display`, `$write`, `$strobe` |
| `systemverilog` | Extracts literal output strings | `$display`, `$write`, `$strobe` |
| `vhdl` | Extracts literal output strings | `report` |

### Important limitations

- These languages are meant for **display/report-style output checks only**.
- They are **not** a general Verilog/SystemVerilog/VHDL simulation environment.
- Only **literal string output statements** are supported.
- Comments are ignored before output extraction.
- If no supported output statement is found, the submission fails with a clear
  error instead of silently passing.

### Practical examples

#### `plaintext`

```text
Hello, JudgeKit!
```

#### `verilog` / `systemverilog`

```verilog
module solution;
initial begin
  $display("Hello, JudgeKit!");
end
endmodule
```

#### `vhdl`

```vhdl
entity solution is
end solution;

architecture beh of solution is
begin
  process
  begin
    report "Hello, JudgeKit!";
    wait;
  end process;
end beh;
```

### ARM64 Build Summary

**102 of 102 images build on ARM64** (production, Ampere Altra).

### amd64 E2E Summary (2026-03-29)

**113 of 113 languages pass** on amd64.

### arm64 E2E Summary (2026-03-29)

**112 of 113 languages pass** on arm64.

| Failing | Status | Root Cause |
|---------|--------|------------|
| `curry` | compile_error | pakcs-frontend (amd64 binary under qemu) exceeds 3.8GB server memory during compilation. Tested with 8GB swap + 2GB container limit + 600s timeout — still OOM killed. Needs server with >=8GB RAM or native arm64 pakcs build. |

### Disabled Languages

| Language | Reason |
|----------|--------|
| `roc` | Upstream compiler panic (`Arc references to module_ids`) when loading any platform. Affects all available releases (alpha1 through alpha4-rolling) on all architectures. Dockerfile preserved at `docker/Dockerfile.judge-roc`. Re-enable when upstream fix is available. |

## Docker Image Presets

| Preset | Languages | Est. Size |
|--------|-----------|-----------|
| `core` | C/C++, Python, Java/Kotlin | ~0.8 GB |
| `popular` | Core + Node.js, Rust, Go | ~2.5 GB |
| `extended` | Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig | ~8 GB |
| `all` | All 102 images | ~35 GB |

## Admin Language Management

`/dashboard/admin/languages` lets admins override per-language settings at runtime:
- Docker image name, compile command, run command
- Enable/disable toggle
- Build and remove Docker images from the UI
- **Time-limit multiplier** (`language_configs.time_limit_multiplier`, default `1.0`) — applied at judge claim time so the worker receives `problem.timeLimitMs * multiplier`. Use this to give slower runtimes a fair shake on the same problem (e.g. Python `2.5`, Ruby `4.0`, Java `1.5`) without forcing instructors to duplicate problems per language. Floor of 1 ms; the math runs in `src/app/api/v1/judge/claim/route.ts` next to the existing time-limit hand-off.

Changes take effect immediately for new submissions without restarting services.

## Potential Additions

Languages under evaluation for future support. Criteria: stable/packaged binary available for Linux amd64+arm64, self-contained Docker image feasible, general-purpose enough for competitive programming.

| Language | Status | Rationale | Notes |
|----------|--------|-----------|-------|
| **Mojo** | Pre-1.0 — targeting 1.0 in H1 2026; compiler still closed-source | Python-superset with C/Rust-level performance; high community interest; targets AI/systems workloads | Compiler is closed-source; Linux ARM64 support in progress; revisit at 1.0 |
| **Carbon** | Experimental — targeting v0.1 in late 2026; nightly builds only on limited platforms | Google's C++ successor; significant industry interest | Not suitable yet — no stable release, limited platform support |
| **Lobster** | Stable — active releases on GitHub; single-file binary | Statically typed scripting language with Rust-like ownership; small and self-contained | Very niche; low priority |
