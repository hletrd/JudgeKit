# Supported Languages (114 variants)

95 Docker images covering 114 language variants. Deployed on both AMD64 (test) and ARM64 (production).

| # | Language ID | Description | Docker Image | amd64 | arm64 | amd64 E2E | arm64 E2E |
|---|-------------|-------------|--------------|-------|-------|-----------|-----------|
| 1 | `c89` | C (C89, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 2 | `c99` | C (C99, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 3 | `c17` | C (C17, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 4 | `c23` | C (C23, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 5 | `cpp20` | C++ (C++20, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 6 | `cpp23` | C++ (C++23, GCC) | `judge-cpp` | ✅ | ✅ | ✅ | ✅ |
| 7 | `clang_c23` | C (C23, Clang) | `judge-clang` | ✅ | ✅ | ✅ | ✅ |
| 8 | `clang_cpp23` | C++ (C++23, Clang) | `judge-clang` | ✅ | ✅ | ✅ | ✅ |
| 9 | `llvm_ir` | LLVM IR (compiled with clang) | `judge-clang` | ✅ | ✅ | ✅ | ✅ |
| 10 | `java` | Java 25 | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 11 | `kotlin` | Kotlin 2.3 | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 12 | `python` | Python 3.14 | `judge-python` | ✅ | ✅ | ✅ | ✅ |
| 13 | `javascript` | Node.js 24 | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 14 | `typescript` | TypeScript 5.9 (Node.js 24) | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 15 | `coffeescript` | CoffeeScript 2.7 (Node.js 24) | `judge-node` | ✅ | ✅ | ✅ | ✅ |
| 16 | `rust` | Rust 1.94 | `judge-rust` | ✅ | ✅ | ✅ | ✅ |
| 17 | `go` | Go 1.26 | `judge-go` | ✅ | ✅ | ✅ | ✅ |
| 18 | `swift` | Swift 6.2 | `judge-swift` | ✅ | ✅ | ✅ | ✅ |
| 19 | `csharp` | C# (Mono 6.12) | `judge-csharp` | ✅ | ✅ | ✅ | ✅ |
| 20 | `fsharp` | F# (.NET 10) | `judge-fsharp` | ✅ | ✅ | ✅ | ✅ |
| 21 | `vbnet` | Visual Basic .NET (.NET 10) | `judge-fsharp` | ✅ | ✅ | ✅ | ✅ |
| 22 | `r` | R 4.5 | `judge-r` | ✅ | ✅ | ✅ | ✅ |
| 23 | `perl` | Perl 5.40 | `judge-perl` | ✅ | ✅ | ✅ | ✅ |
| 24 | `php` | PHP 8.4 | `judge-php` | ✅ | ✅ | ✅ | ✅ |
| 25 | `ruby` | Ruby 3.4 | `judge-ruby` | ✅ | ✅ | ✅ | ✅ |
| 26 | `lua` | Lua 5.4 | `judge-lua` | ✅ | ✅ | ✅ | ✅ |
| 27 | `haskell` | Haskell (GHC 9.4) | `judge-haskell` | ✅ | ✅ | ✅ | ✅ |
| 28 | `dart` | Dart 3.8 | `judge-dart` | ✅ | ✅ | ✅ | ✅ |
| 29 | `zig` | Zig 0.13 | `judge-zig` | ✅ | ✅ | ✅ | ✅ |
| 30 | `nim` | Nim 2.2 | `judge-nim` | ✅ | ✅ | ✅ | ✅ |
| 31 | `ocaml` | OCaml 4.14 | `judge-ocaml` | ✅ | ✅ | ✅ | ✅ |
| 32 | `elixir` | Elixir 1.18 | `judge-elixir` | ✅ | ✅ | ✅ | ✅ |
| 33 | `julia` | Julia 1.12 | `judge-julia` | ✅ | ✅ | ✅ | ✅ |
| 34 | `d` | D (LDC 1.39) | `judge-d` | ✅ | ✅ | ✅ | ✅ |
| 35 | `racket` | Racket 8.10 | `judge-racket` | ✅ | ✅ | ✅ | ✅ |
| 36 | `vlang` | V 0.5 | `judge-v` | ✅ | ✅ | ✅ | ✅ |
| 37 | `fortran` | Fortran (GFortran 14) | `judge-fortran` | ✅ | ✅ | ✅ | ✅ |
| 38 | `pascal` | Pascal (FPC 3.2) | `judge-pascal` | ✅ | ✅ | ✅ | ✅ |
| 39 | `delphi` | Delphi (FPC, Delphi mode) | `judge-pascal` | ✅ | ✅ | ✅ | ✅ |
| 40 | `cobol` | COBOL (GnuCOBOL 3.2) | `judge-cobol` | ✅ | ✅ | ✅ | ✅ |
| 41 | `scala` | Scala 3.5 | `judge-scala` | ✅ | ✅ | ✅ | ✅ |
| 42 | `erlang` | Erlang 27 | `judge-erlang` | ✅ | ✅ | ✅ | ✅ |
| 43 | `commonlisp` | Common Lisp (SBCL 2.5) | `judge-commonlisp` | ✅ | ✅ | ✅ | ✅ |
| 44 | `bash` | Bash 5.2 | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 45 | `sed` | Sed | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 46 | `dc` | dc (desk calculator) | `judge-bash` | ✅ | ✅ | ✅ | ✅ |
| 47 | `ada` | Ada (GNAT 14) | `judge-ada` | ✅ | ✅ | ✅ | ✅ |
| 48 | `clojure` | Clojure 1.12 | `judge-clojure` | ✅ | ✅ | ✅ | ✅ |
| 49 | `prolog` | Prolog (SWI-Prolog 9) | `judge-prolog` | ✅ | ✅ | ✅ | ✅ |
| 50 | `tcl` | Tcl 8.6 | `judge-tcl` | ✅ | ✅ | ✅ | ✅ |
| 51 | `awk` | AWK (GAWK 5) | `judge-awk` | ✅ | ✅ | ✅ | ✅ |
| 52 | `scheme` | Scheme (Chicken 5) | `judge-scheme` | ✅ | ✅ | ✅ | ✅ |
| 53 | `groovy` | Groovy 4.0 | `judge-groovy` | ✅ | ✅ | ✅ | ✅ |
| 54 | `octave` | GNU Octave 9 | `judge-octave` | ✅ | ✅ | ✅ | ✅ |
| 55 | `crystal` | Crystal 1.14 | `judge-crystal` | ✅ | ✅ | ✅ | ✅ |
| 56 | `powershell` | PowerShell 7.5 | `judge-powershell` | ✅ | ✅ | ✅ | ✅ |
| 57 | `postscript` | PostScript (Ghostscript 10) | `judge-postscript` | ✅ | ✅ | ✅ | ✅ |
| 58 | `brainfuck` | Brainfuck | `judge-brainfuck` | ✅ | ✅ | ✅ | ✅ |
| 59 | `befunge` | Befunge-93 | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 60 | `aheui` | Aheui | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 61 | `hyeong` | Hyeong | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 62 | `whitespace` | Whitespace | `judge-esoteric` | ✅ | ✅ | ✅ | ✅ |
| 63 | `b` | B (BCause) | `judge-b` | ✅ | ❌ x86 asm | ✅ | ❌ x86-64 inline assembly |
| 64 | `flix` | Flix (JVM) | `judge-jvm` | ✅ | ✅ | ✅ | ✅ |
| 65 | `apl` | APL (GNU APL) | `judge-apl` | ✅ | ❌ make fails | ❌ output format | ❌ build fails on ARM64 |
| 66 | `freebasic` | FreeBASIC | `judge-freebasic` | ✅ | ✅ | ✅ | ✅ |
| 67 | `smalltalk` | Smalltalk (GNU Smalltalk) | `judge-smalltalk` | ✅ | ✅ | ✅ | ✅ |
| 68 | `nasm` | Assembly (NASM x86-64 / GNU as AArch64) | `judge-nasm` | ✅ | ✅ | ✅ | ✅ |
| 69 | `objective_c` | Objective-C (GCC gobjc) | `judge-objective-c` | ✅ | ✅ | ✅ | ✅ |
| 70 | `forth` | Forth (Gforth) | `judge-forth` | ✅ | ✅ | ✅ | ✅ |
| 71 | `raku` | Raku (Rakudo) | `judge-raku` | ✅ | ✅ | ✅ | ✅ |
| 72 | `haxe` | Haxe 4.3 (Python backend) | `judge-haxe` | ✅ | ✅ | ✅ | ✅ |
| 73 | `odin` | Odin | `judge-odin` | ✅ | ✅ | ✅ | ✅ |
| 74 | `uiua` | Uiua | `judge-uiua` | ✅ | ✅ | ✅ | ✅ |
| 75 | `bqn` | BQN (CBQN) | `judge-bqn` | ✅ | ✅ | ✅ | ✅ |
| 76 | `icon` | Icon | `judge-icon` | ✅ | ✅ | ✅ | ✅ |
| 77 | `algol68` | Algol 68 (a68g) | `judge-algol68` | ✅ | ✅ | ✅ | ✅ |
| 78 | `snobol4` | SNOBOL4 (CSNOBOL4) | `judge-snobol4` | ✅ | ✅ | ✅ | ✅ |
| 79 | `lolcode` | LOLCODE (lci) | `judge-lolcode` | ✅ | ✅ | ✅ | ✅ |
| 80 | `shakespeare` | Shakespeare (shakespearelang) | `judge-shakespeare` | ✅ | ✅ | ✅ | ✅ |
| 81 | `umjunsik` | 엄준식 (Umjunsik) | `judge-umjunsik` | ✅ | ✅ | ✅ | ✅ |
| 82 | `deno_js` | JavaScript (Deno) | `judge-deno` | ✅ | ✅ | ✅ | ✅ |
| 83 | `deno_ts` | TypeScript (Deno) | `judge-deno` | ✅ | ✅ | ✅ | ✅ |
| 84 | `bun_js` | JavaScript (Bun) | `judge-bun` | ✅ | ✅ | ✅ | ✅ |
| 85 | `bun_ts` | TypeScript (Bun) | `judge-bun` | ✅ | ✅ | ✅ | ✅ |
| 86 | `gleam` | Gleam (Erlang target) | `judge-gleam` | ✅ | ✅ | ✅ | ✅ |
| 87 | `sml` | Standard ML (Poly/ML) | `judge-sml` | ✅ | ✅ | ✅ | ✅ |
| 88 | `fennel` | Fennel (Lua VM) | `judge-lua` | ✅ | ✅ | ✅ | ✅ |
| 89 | `micropython` | MicroPython | `judge-micropython` | ✅ | ✅ | ✅ | ✅ |
| 90 | `squirrel` | Squirrel 3.2 | `judge-squirrel` | ✅ | ✅ | ✅ | ✅ |
| 91 | `rexx` | Rexx (Regina) | `judge-rexx` | ✅ | ✅ | ✅ | ✅ |
| 92 | `hy` | Hy (Lisp on Python) | `judge-hy` | ✅ | ✅ | ✅ | ✅ |
| 93 | `arturo` | Arturo | `judge-arturo` | ✅ | ✅ | ✅ | ✅ |
| 94 | `janet` | Janet | `judge-janet` | ✅ | ✅ | ✅ | ✅ |
| 95 | `c3` | C3 | `judge-c3` | ✅ | ❌ amd64 only | ✅ | ❌ amd64 only binary |
| 96 | `vala` | Vala | `judge-vala` | ✅ | ✅ | ✅ | ✅ |
| 97 | `nelua` | Nelua | `judge-nelua` | ✅ | ✅ | ✅ | ✅ |
| 98 | `hare` | Hare | `judge-hare` | ✅ | ✅ | ✅ | ✅ |
| 99 | `koka` | Koka | `judge-koka` | ✅ | ✅ | ✅ | ✅ |
| 100 | `lean` | Lean 4 | `judge-lean` | ✅ | ✅ | ✅ | ✅ |
| 101 | `picat` | Picat 3.9 | `judge-picat` | ✅ | ✅ | ✅ | ✅ |
| 102 | `mercury` | Mercury 22.01.8 | `judge-mercury` | ✅ | ✅ | ✅ | ✅ |
| 103 | `wat` | WebAssembly (WAT, wabt+wasmtime) | `judge-wat` | ✅ | ✅ | ✅ | ✅ |
| 104 | `purescript` | PureScript 0.15.16 | `judge-purescript` | ✅ | ✅ | ✅ | ✅ |
| 105 | `modula2` | Modula-2 (GCC gm2) | `judge-modula2` | ✅ | ✅ | ✅ | ✅ |
| 106 | `factor` | Factor 0.101 | `judge-factor` | ✅ | ❌ x64 only | ✅ | ❌ x64 only binary |
| 107 | `spark` | SPARK (Ada/SPARK 2014, GNAT) | `judge-ada` | ✅ | ✅ | ✅ | ✅ |
| 108 | `minizinc` | MiniZinc 2.9.5 | `judge-minizinc` | ✅ | ✅ | ✅ | ✅ |
| 109 | `curry` | Curry (PAKCS 3.9.0) | `judge-curry` | ✅ | ✅ | ✅ | ✅ |
| 110 | `clean` | Clean 3.1 | `judge-clean` | ✅ | ✅ | ✅ | ✅ |
| 111 | `roc` | Roc (alpha4) | `judge-roc` | ✅ | ✅ | ✅ | ✅ |
| 112 | `carp` | Carp 0.5.5 | `judge-carp` | ✅ | ✅ | ✅ | ✅ |
| 113 | `grain` | Grain 0.7.2 | `judge-grain` | ✅ | ❌ x64 only | ✅ | ❌ x64 only binary |
| 114 | `pony` | Pony 0.61.1 | `judge-pony` | ✅ | ✅ | ✅ | ✅ |

### ARM64 Build Summary

**93 of 95 images build on ARM64** (production, Ampere Altra). 2 cannot build on ARM64:
- **B (BCause)**: uses x86-64 inline assembly (`syscall` instruction), fundamentally incompatible with ARM64
- **APL (GNU APL)**: `make` fails on ARM64 due to old C++ code with portability issues

### amd64 E2E Summary (2026-03-24)

**113 of 114 languages pass** on amd64. 1 failure:
- **apl**: GNU APL output format issue

### arm64 E2E Summary (2026-03-24)

**109 of 114 languages pass** on arm64. 5 failures (architecture limits):
- **b**: x86-64 inline assembly
- **apl**: GNU APL build fails on ARM64
- **c3**: amd64 only binary
- **grain**: x64 only binary
- **factor**: x64 only binary

## Docker Image Presets

| Preset | Languages | Est. Size |
|--------|-----------|-----------|
| `core` | C/C++, Python, Java/Kotlin | ~0.8 GB |
| `popular` | Core + Node.js, Rust, Go | ~2.5 GB |
| `extended` | Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig | ~8 GB |
| `all` | All 95 images | ~35 GB |

## Admin Language Management

`/dashboard/admin/languages` lets admins override per-language settings at runtime:
- Docker image name, compile command, run command
- Enable/disable toggle
- Build and remove Docker images from the UI

Changes take effect immediately for new submissions without restarting services.
