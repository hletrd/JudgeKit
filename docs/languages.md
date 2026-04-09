# Supported Languages (120 variants)

Multi-arch Docker images covering 120 language variants. Deployed on both AMD64 (test) and ARM64 (production).

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
| 15 | `javascript` | Node.js 24 | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 16 | `typescript` | TypeScript 6.0 (Node.js 24) | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 17 | `coffeescript` | CoffeeScript 2.7 (Node.js 24) | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 18 | `rust` | Rust 1.94 | `judge-rust` | ✅ | ✅ | ✅ | ✅ |
| 19 | `go` | Go 1.26 | `judge-go` | ✅ | ✅ | ✅ | ✅ |
| 20 | `swift` | Swift 6.2 | `judge-swift` | ✅ | ✅ | ✅ | ✅ |
| 21 | `csharp` | C# (Mono 6.12) | `judge-csharp` | ✅ | ✅ | ✅ | ✅ |
| 22 | `fsharp` | F# (.NET 10) | `judge-fsharp` | ✅ | ✅ | ✅ | ✅ |
| 23 | `vbnet` | Visual Basic .NET (.NET 10) | `judge-fsharp` | ✅ | ✅ | ✅ | ✅ |
| 24 | `r` | R 4.5 | `judge-r` | ✅ | ✅ | ✅ | ✅ |
| 25 | `perl` | Perl 5.40 | `judge-perl` | ✅ | ✅ | ✅ | ✅ |
| 26 | `php` | PHP 8.4 | `judge-php` | ✅ | ✅ | ✅ | ✅ |
| 27 | `ruby` | Ruby 3.4 | `judge-ruby` | ✅ | ✅ | ✅ | ✅ |
| 28 | `lua` | Lua 5.4 | `judge-lua` | ✅ | ✅ | ✅ | ✅ |
| 29 | `haskell` | Haskell (GHC 9.4) | `judge-haskell` | ✅ | ✅ | ✅ | ✅ |
| 30 | `dart` | Dart 3.8 | `judge-dart` | ✅ | ✅ | ✅ | ✅ |
| 31 | `zig` | Zig 0.13 | `judge-zig` | ✅ | ✅ | ✅ | ✅ |
| 32 | `nim` | Nim 2.2 | `judge-nim` | ✅ | ✅ | ✅ | ✅ |
| 33 | `ocaml` | OCaml 4.14 | `judge-ocaml` | ✅ | ✅ | ✅ | ✅ |
| 34 | `elixir` | Elixir 1.18 | `judge-elixir` | ✅ | ✅ | ✅ | ✅ |
| 35 | `julia` | Julia 1.12 | `judge-julia` | ✅ | ✅ | ✅ | ✅ |
| 36 | `d` | D (LDC 1.39) | `judge-d` | ✅ | ✅ | ✅ | ✅ |
| 37 | `racket` | Racket 8.10 | `judge-racket` | ✅ | ✅ | ✅ | ✅ |
| 38 | `vlang` | V 0.5 | `judge-v` | ✅ | ✅ | ✅ | ✅ |
| 39 | `fortran` | Fortran (GFortran 14) | `judge-fortran` | ✅ | ✅ | ✅ | ✅ |
| 40 | `pascal` | Pascal (FPC 3.2) | `judge-pascal` | ✅ | ✅ | ✅ | ✅ |
| 41 | `delphi` | Delphi (FPC, Delphi mode) | `judge-pascal` | ✅ | ✅ | ✅ | ✅ |
| 42 | `cobol` | COBOL (GnuCOBOL 3.2) | `judge-cobol` | ✅ | ✅ | ✅ | ✅ |
| 43 | `scala` | Scala 3.5 | `judge-scala` | ✅ | ✅ | ✅ | ✅ |
| 44 | `erlang` | Erlang 27 | `judge-erlang` | ✅ | ✅ | ✅ | ✅ |
| 45 | `commonlisp` | Common Lisp (SBCL 2.5) | `judge-commonlisp` | ✅ | ✅ | ✅ | ✅ |
| 46 | `bash` | Bash 5.2 | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 47 | `sed` | Sed | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 48 | `dc` | dc (desk calculator) | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 49 | `ada` | Ada (GNAT 14) | `judge-ada` | ✅ | ✅ | ✅ | ✅ |
| 50 | `clojure` | Clojure 1.12 | `judge-clojure` | ✅ | ✅ | ✅ | ✅ |
| 51 | `prolog` | Prolog (SWI-Prolog 9) | `judge-prolog` | ✅ | ✅ | ✅ | ✅ |
| 52 | `tcl` | Tcl 8.6 | `judge-tcl` | ✅ | ✅ | ✅ | ✅ |
| 53 | `awk` | AWK (GAWK 5) | `judge-awk` | ✅ | ✅ | ✅ | ✅ |
| 54 | `scheme` | Scheme (Chicken 5) | `judge-scheme` | ✅ | ✅ | ✅ | ✅ |
| 55 | `groovy` | Groovy 4.0 | `judge-groovy` | ✅ | ✅ | ✅ | ✅ |
| 56 | `octave` | GNU Octave 9 | `judge-octave` | ✅ | ✅ | ✅ | ✅ |
| 57 | `crystal` | Crystal 1.14 | `judge-crystal` | ✅ | ✅ | ✅ | ✅ |
| 58 | `powershell` | PowerShell 7.5 | `judge-powershell` | ✅ | ✅ | ✅ | ✅ |
| 59 | `postscript` | PostScript (Ghostscript 10) | `judge-postscript` | ✅ | ✅ | ✅ | ✅ |
| 60 | `brainfuck` | Brainfuck | `judge-brainfuck` | ✅ | ✅ | ✅ | ✅ |
| 61 | `befunge` | Befunge-93 | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 62 | `aheui` | Aheui | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 63 | `hyeong` | Hyeong | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 64 | `whitespace` | Whitespace | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 65 | `b` | B (BCause / bext-lang) | `judge-b` | ✅ | ✅ | ✅ | ✅ |
| 66 | `flix` | Flix (JVM) | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 67 | `apl` | APL (GNU APL) | `judge-apl` | ✅ | ✅ | ✅ | ✅ |
| 68 | `freebasic` | FreeBASIC | `judge-freebasic` | ✅ | ✅ | ✅ | ✅ |
| 69 | `smalltalk` | Smalltalk (GNU Smalltalk) | `judge-smalltalk` | ✅ | ✅ | ✅ | ✅ |
| 70 | `nasm` | Assembly (NASM x86-64 / GNU as AArch64) | `judge-nasm` | ✅ | ✅ | ✅ | ✅ |
| 71 | `objective_c` | Objective-C (GCC gobjc) | `judge-objective-c` | ✅ | ✅ | ✅ | ✅ |
| 72 | `forth` | Forth (Gforth) | `judge-forth` | ✅ | ✅ | ✅ | ✅ |
| 73 | `raku` | Raku (Rakudo) | `judge-raku` | ✅ | ✅ | ✅ | ✅ |
| 74 | `haxe` | Haxe 4.3 (Python backend) | `judge-haxe` | ✅ | ✅ | ✅ | ✅ |
| 75 | `odin` | Odin | `judge-odin` | ✅ | ✅ | ✅ | ✅ |
| 76 | `uiua` | Uiua | `judge-uiua` | ✅ | ✅ | ✅ | ✅ |
| 77 | `bqn` | BQN (CBQN) | `judge-bqn` | ✅ | ✅ | ✅ | ✅ |
| 78 | `icon` | Icon | `judge-icon` | ✅ | ✅ | ✅ | ✅ |
| 79 | `algol68` | Algol 68 (a68g) | `judge-algol68` | ✅ | ✅ | ✅ | ✅ |
| 80 | `snobol4` | SNOBOL4 (CSNOBOL4) | `judge-snobol4` | ✅ | ✅ | ✅ | ✅ |
| 81 | `lolcode` | LOLCODE (lci) | `judge-lolcode` | ✅ | ✅ | ✅ | ✅ |
| 82 | `shakespeare` | Shakespeare (shakespearelang) | `judge-shakespeare` | ✅ | ✅ | ✅ | ✅ |
| 83 | `umjunsik` | 엄준식 (Umjunsik) | `judge-umjunsik` | ✅ | ✅ | ✅ | ✅ |
| 84 | `deno_js` | JavaScript (Deno) | `judge-deno` | ✅ | ✅ | ✅ | ✅ |
| 85 | `deno_ts` | TypeScript (Deno) | `judge-deno` | ✅ | ✅ | ✅ | ✅ |
| 86 | `bun_js` | JavaScript (Bun) | `judge-bun` | ✅ | ✅ | ✅ | ✅ |
| 87 | `bun_ts` | TypeScript (Bun) | `judge-bun` | ✅ | ✅ | ✅ | ✅ |
| 88 | `gleam` | Gleam (Erlang target) | `judge-gleam` | ✅ | ✅ | ✅ | ✅ |
| 89 | `sml` | Standard ML (Poly/ML) | `judge-sml` | ✅ | ✅ | ✅ | ✅ |
| 90 | `fennel` | Fennel (Lua VM) | `judge-lua` | ✅ | ✅ | ✅ | ✅ |
| 91 | `micropython` | MicroPython | `judge-micropython` | ✅ | ✅ | ✅ | ✅ |
| 92 | `squirrel` | Squirrel 3.2 | `judge-squirrel` | ✅ | ✅ | ✅ | ✅ |
| 93 | `rexx` | Rexx (Regina) | `judge-rexx` | ✅ | ✅ | ✅ | ✅ |
| 94 | `hy` | Hy (Lisp on Python) | `judge-hy` | ✅ | ✅ | ✅ | ✅ |
| 95 | `arturo` | Arturo | `judge-arturo` | ✅ | ✅ | ✅ | ✅ |
| 96 | `janet` | Janet | `judge-janet` | ✅ | ✅ | ✅ | ✅ |
| 97 | `c3` | C3 | `judge-c3` | ✅ | ✅ | ✅ | ✅ |
| 98 | `vala` | Vala | `judge-vala` | ✅ | ✅ | ✅ | ✅ |
| 99 | `nelua` | Nelua | `judge-nelua` | ✅ | ✅ | ✅ | ✅ |
| 100 | `hare` | Hare | `judge-hare` | ✅ | ✅ | ✅ | ✅ |
| 101 | `koka` | Koka | `judge-koka` | ✅ | ✅ | ✅ | ✅ |
| 102 | `lean` | Lean 4 | `judge-lean` | ✅ | ✅ | ✅ | ✅ |
| 103 | `picat` | Picat 3.9 | `judge-picat` | ✅ | ✅ | ✅ | ✅ |
| 104 | `mercury` | Mercury 22.01.8 | `judge-mercury` | ✅ | ✅ | ✅ | ✅ |
| 105 | `wat` | WebAssembly (WAT, wabt+wasmtime) | `judge-wat` | ✅ | ✅ | ✅ | ✅ |
| 106 | `purescript` | PureScript 0.15.16 | `judge-purescript` | ✅ | ✅ | ✅ | ✅ |
| 107 | `modula2` | Modula-2 (GCC gm2) | `judge-modula2` | ✅ | ✅ | ✅ | ✅ |
| 108 | `factor` | Factor 0.101 | `judge-factor` | ✅ | ✅ | ✅ | ✅ |
| 109 | `spark` | SPARK (Ada/SPARK 2014, GNAT) | `judge-ada` | ✅ | ✅ | ✅ | ✅ |
| 110 | `minizinc` | MiniZinc 2.9.5 | `judge-minizinc` | ✅ | ✅ | ✅ | ✅ |
| 111 | `curry` | Curry (PAKCS 3.9.0) | `judge-curry` | ✅ | ✅ | ✅ | ✅ |
| 112 | `clean` | Clean 3.1 | `judge-clean` | ✅ | ✅ | ✅ | ✅ |
| 113 | `carp` | Carp 0.5.5 | `judge-carp` | ✅ | ✅ | ✅ | ✅ |
| 114 | `grain` | Grain 0.7.2 | `judge-grain` | ✅ | ✅ | ✅ | ✅ |
| 115 | `pony` | Pony 0.61.1 | `judge-pony` | ✅ | ✅ | ✅ | ✅ |
| 116 | `moonbit` | MoonBit 0.8 (native) | `judge-moonbit` | ✅ | ✅ | ✅ | ✅ |
| 117 | `chapel` | Chapel 2.8 | `judge-chapel` | ✅ | ✅ | ✅ | ✅ |
| 118 | `idris2` | Idris 2 0.8.0 (Chez Scheme) | `judge-idris2` | ✅ | ✅ | ✅ | ✅ |
| 119 | `rescript` | ReScript 12.2 (Node.js) | `judge-rescript` | ✅ | ✅ | ✅ | ✅ |
| 120 | `elm` | Elm 0.19.1 (Node.js) | `judge-elm` | ✅ | ✅ | ✅ | ✅ |

### ARM64 Build Summary

**100 of 100 images build on ARM64** (production, Ampere Altra).

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
| `all` | All 100 images | ~35 GB |

## Admin Language Management

`/dashboard/admin/languages` lets admins override per-language settings at runtime:
- Docker image name, compile command, run command
- Enable/disable toggle
- Build and remove Docker images from the UI

Changes take effect immediately for new submissions without restarting services.

## Potential Additions

Languages under evaluation for future support. Criteria: stable/packaged binary available for Linux amd64+arm64, self-contained Docker image feasible, general-purpose enough for competitive programming.

| Language | Status | Rationale | Notes |
|----------|--------|-----------|-------|
| **Mojo** | Pre-1.0 — targeting 1.0 in H1 2026; compiler still closed-source | Python-superset with C/Rust-level performance; high community interest; targets AI/systems workloads | Compiler is closed-source; Linux ARM64 support in progress; revisit at 1.0 |
| **Carbon** | Experimental — targeting v0.1 in late 2026; nightly builds only on limited platforms | Google's C++ successor; significant industry interest | Not suitable yet — no stable release, limited platform support |
| **Lobster** | Stable — active releases on GitHub; single-file binary | Statically typed scripting language with Rust-like ownership; small and self-contained | Very niche; low priority |
