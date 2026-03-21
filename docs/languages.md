# Supported Languages (89 variants)

70 Docker images covering 89 language variants. E2E test suite (amd64): 88 passed, 1 skipped (KNOWN_FLAKY), 0 failed (~4 min).

| # | Language ID | Description | Docker Image | E2E (amd64) |
|---|-------------|-------------|--------------|-------------|
| 1 | `c89` | C (C89, GCC) | `judge-cpp` | ✅ Pass |
| 2 | `c99` | C (C99, GCC) | `judge-cpp` | ✅ Pass |
| 3 | `c17` | C (C17, GCC) | `judge-cpp` | ✅ Pass |
| 4 | `c23` | C (C23, GCC) | `judge-cpp` | ✅ Pass |
| 5 | `cpp20` | C++ (C++20, GCC) | `judge-cpp` | ✅ Pass |
| 6 | `cpp23` | C++ (C++23, GCC) | `judge-cpp` | ✅ Pass |
| 7 | `clang_c23` | C (C23, Clang) | `judge-clang` | ✅ Pass |
| 8 | `clang_cpp23` | C++ (C++23, Clang) | `judge-clang` | ✅ Pass |
| 9 | `llvm_ir` | LLVM IR (compiled with clang) | `judge-clang` | ✅ Pass |
| 10 | `java` | Java 25 | `judge-jvm` | ✅ Pass |
| 11 | `kotlin` | Kotlin 2.3 | `judge-jvm` | ✅ Pass |
| 12 | `python` | Python 3.14 | `judge-python` | ✅ Pass |
| 13 | `javascript` | Node.js 24 | `judge-node` | ✅ Pass |
| 14 | `typescript` | TypeScript 5.9 (Node.js 24) | `judge-node` | ✅ Pass |
| 15 | `coffeescript` | CoffeeScript 2.7 (Node.js 24) | `judge-node` | ✅ Pass |
| 16 | `rust` | Rust 1.94 | `judge-rust` | ✅ Pass |
| 17 | `go` | Go 1.26 | `judge-go` | ✅ Pass |
| 18 | `swift` | Swift 6.2 | `judge-swift` | ✅ Pass |
| 19 | `csharp` | C# (Mono 6.12) | `judge-csharp` | ✅ Pass |
| 20 | `fsharp` | F# (.NET 10) | `judge-fsharp` | ✅ Pass |
| 21 | `vbnet` | Visual Basic .NET (.NET 10) | `judge-fsharp` | ✅ Pass |
| 22 | `r` | R 4.5 | `judge-r` | ✅ Pass |
| 23 | `perl` | Perl 5.40 | `judge-perl` | ✅ Pass |
| 24 | `php` | PHP 8.4 | `judge-php` | ✅ Pass |
| 25 | `ruby` | Ruby 3.4 | `judge-ruby` | ✅ Pass |
| 26 | `lua` | Lua 5.4 | `judge-lua` | ✅ Pass |
| 27 | `haskell` | Haskell (GHC 9.4) | `judge-haskell` | ✅ Pass |
| 28 | `dart` | Dart 3.8 | `judge-dart` | ✅ Pass |
| 29 | `zig` | Zig 0.13 | `judge-zig` | ✅ Pass |
| 30 | `nim` | Nim 2.2 | `judge-nim` | ✅ Pass |
| 31 | `ocaml` | OCaml 4.14 | `judge-ocaml` | ✅ Pass |
| 32 | `elixir` | Elixir 1.18 | `judge-elixir` | ✅ Pass |
| 33 | `julia` | Julia 1.12 | `judge-julia` | ✅ Pass |
| 34 | `d` | D (LDC 1.39) | `judge-d` | ✅ Pass |
| 35 | `racket` | Racket 8.10 | `judge-racket` | ✅ Pass |
| 36 | `vlang` | V 0.5 | `judge-v` | ✅ Pass |
| 37 | `fortran` | Fortran (GFortran 14) | `judge-fortran` | ✅ Pass |
| 38 | `pascal` | Pascal (FPC 3.2) | `judge-pascal` | ✅ Pass |
| 39 | `delphi` | Delphi (FPC, Delphi mode) | `judge-pascal` | ✅ Pass |
| 40 | `cobol` | COBOL (GnuCOBOL 3.2) | `judge-cobol` | ✅ Pass |
| 41 | `scala` | Scala 3.5 | `judge-scala` | ✅ Pass |
| 42 | `erlang` | Erlang 27 | `judge-erlang` | ✅ Pass |
| 43 | `commonlisp` | Common Lisp (SBCL 2.5) | `judge-commonlisp` | ✅ Pass |
| 44 | `bash` | Bash 5.2 | `judge-bash` | ✅ Pass |
| 45 | `sed` | Sed | `judge-bash` | ✅ Pass |
| 46 | `dc` | dc (desk calculator) | `judge-bash` | ✅ Pass |
| 47 | `ada` | Ada (GNAT 14) | `judge-ada` | ✅ Pass |
| 48 | `clojure` | Clojure 1.12 | `judge-clojure` | ✅ Pass |
| 49 | `prolog` | Prolog (SWI-Prolog 9) | `judge-prolog` | ✅ Pass |
| 50 | `tcl` | Tcl 8.6 | `judge-tcl` | ✅ Pass |
| 51 | `awk` | AWK (GAWK 5) | `judge-awk` | ✅ Pass |
| 52 | `scheme` | Scheme (Chicken 5) | `judge-scheme` | ✅ Pass |
| 53 | `groovy` | Groovy 4.0 | `judge-groovy` | ✅ Pass |
| 54 | `octave` | GNU Octave 9 | `judge-octave` | ✅ Pass |
| 55 | `crystal` | Crystal 1.14 | `judge-crystal` | ✅ Pass |
| 56 | `powershell` | PowerShell 7.5 | `judge-powershell` | ✅ Pass |
| 57 | `postscript` | PostScript (Ghostscript 10) | `judge-postscript` | ✅ Pass |
| 58 | `brainfuck` | Brainfuck | `judge-brainfuck` | ✅ Pass |
| 59 | `befunge` | Befunge-93 | `judge-esoteric` | ✅ Pass |
| 60 | `aheui` | Aheui | `judge-esoteric` | ✅ Pass |
| 61 | `hyeong` | Hyeong | `judge-esoteric` | ✅ Pass |
| 62 | `whitespace` | Whitespace | `judge-esoteric` | ✅ Pass |
| 63 | `b` | B (BCause) | `judge-b` | ✅ Pass |
| 64 | `flix` | Flix 0.69.2 | `judge-flix` | ✅ Pass |
| 65 | `apl` | APL (GNU APL) | `judge-apl` | ✅ Pass |
| 66 | `freebasic` | FreeBASIC | `judge-freebasic` | ✅ Pass |
| 67 | `smalltalk` | Smalltalk (GNU Smalltalk) | `judge-smalltalk` | ✅ Pass |
| 68 | `nasm` | Assembly (NASM x86-64 / GNU as AArch64) | `judge-nasm` | ✅ Pass |
| 69 | `objective_c` | Objective-C (GCC gobjc) | `judge-objective-c` | ✅ Pass |
| 70 | `forth` | Forth (Gforth) | `judge-forth` | ✅ Pass |
| 71 | `raku` | Raku (Rakudo) | `judge-raku` | ✅ Pass |
| 72 | `haxe` | Haxe 4.3 (Python backend) | `judge-haxe` | ✅ Pass |
| 73 | `odin` | Odin | `judge-odin` | ✅ Pass |
| 74 | `uiua` | Uiua | `judge-uiua` | ✅ Pass |
| 75 | `bqn` | BQN (CBQN) | `judge-bqn` | ✅ Pass |
| 76 | `k` | K (ngn/k) | `judge-k` | ⚠️ Skip (stdout broken in script mode) |
| 77 | `icon` | Icon | `judge-icon` | ✅ Pass |
| 78 | `algol68` | Algol 68 (a68g) | `judge-algol68` | ✅ Pass |
| 79 | `snobol4` | SNOBOL4 (CSNOBOL4) | `judge-snobol4` | ✅ Pass |
| 80 | `lolcode` | LOLCODE (lci) | `judge-lolcode` | ✅ Pass |
| 81 | `shakespeare` | Shakespeare (shakespearelang) | `judge-shakespeare` | ✅ Pass |
| 82 | `umjunsik` | 엄준식 (Umjunsik) | `judge-umjunsik` | ✅ Pass |
| 83 | `deno_js` | JavaScript (Deno) | `judge-deno` | ✅ Pass |
| 84 | `deno_ts` | TypeScript (Deno) | `judge-deno` | ✅ Pass |
| 85 | `bun_js` | JavaScript (Bun) | `judge-bun` | ✅ Pass |
| 86 | `bun_ts` | TypeScript (Bun) | `judge-bun` | ✅ Pass |
| 87 | `gleam` | Gleam (Erlang target) | `judge-gleam` | ✅ Pass |
| 88 | `sml` | Standard ML (Poly/ML) | `judge-sml` | ✅ Pass |
| 89 | `fennel` | Fennel (Lua VM) | `judge-lua` | ✅ Pass |

### KNOWN_FLAKY (1 language)

These languages are skipped in E2E tests:
- **k**: ngn/k can't write to stdout in script mode (type/eoleof errors)

### Newly Fixed (previously flaky, now passing)

- **flix**: Flix 0.69.2 with build-jar + Files.readString approach
- **gleam**: Gleam 1.14.0 with Erlang FFI and erl direct run
- **umjunsik**: Python interpreter with fixed 0-indexed jump targets
- **lolcode**: tr wrapper for space-separated input
- **uiua**: Ubuntu 25.04, &sc syntax for 0.18.x
- **shakespeare**: tr wrapper for space-separated input

## Docker Image Presets

| Preset | Languages | Est. Size |
|--------|-----------|-----------|
| `core` | C/C++, Python, Java/Kotlin | ~0.8 GB |
| `popular` | Core + Node.js, Rust, Go | ~2.5 GB |
| `extended` | Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig | ~8 GB |
| `all` | All 70 images | ~30 GB |

## Admin Language Management

`/dashboard/admin/languages` lets admins override per-language settings at runtime:
- Docker image name, compile command, run command
- Enable/disable toggle
- Build and remove Docker images from the UI

Changes take effect immediately for new submissions without restarting services.
