# JudgeKit — Agent Guide

## Project Overview

JudgeKit is a secure online judge platform for programming assignments. Next.js 16 frontend + API, Rust judge worker, Docker-sandboxed execution, SQLite database.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/` | Next.js app (App Router), components, lib, types |
| `judge-worker-rs/` | Rust judge worker (production) |
| `docker/` | Judge language Dockerfiles + seccomp profile |
| `scripts/` | Systemd services, deploy helpers, backup tools |
| `tests/` | Playwright E2E tests, Vitest unit/integration tests |
| `data/` | SQLite database (gitignored) |

## Supported Languages (92)

JudgeKit supports 92 language variants across 72 Docker images:

| # | Language ID | Description | Docker Image |
|---|-------------|-------------|--------------|
| 1 | `c89` | C (C89, GCC) | `judge-cpp` |
| 2 | `c99` | C (C99, GCC) | `judge-cpp` |
| 3 | `c17` | C (C17, GCC) | `judge-cpp` |
| 4 | `c23` | C (C23, GCC) | `judge-cpp` |
| 5 | `cpp20` | C++ (C++20, GCC) | `judge-cpp` |
| 6 | `cpp23` | C++ (C++23, GCC) | `judge-cpp` |
| 7 | `clang_c23` | C (C23, Clang) | `judge-clang` |
| 8 | `clang_cpp23` | C++ (C++23, Clang) | `judge-clang` |
| 9 | `llvm_ir` | LLVM IR | `judge-clang` |
| 10 | `java` | Java 25 | `judge-jvm` |
| 11 | `kotlin` | Kotlin 2.3 | `judge-jvm` |
| 12 | `python` | Python 3.14 | `judge-python` |
| 13 | `javascript` | Node.js 24 | `judge-node` |
| 14 | `typescript` | TypeScript 5.9 (Node.js 24) | `judge-node` |
| 15 | `coffeescript` | CoffeeScript 2.7 | `judge-node` |
| 16 | `rust` | Rust 1.94 | `judge-rust` |
| 17 | `go` | Go 1.26 | `judge-go` |
| 18 | `swift` | Swift 6.2 | `judge-swift` |
| 19 | `objective_c` | Objective-C (GCC gobjc) | `judge-objective-c` |
| 20 | `csharp` | C# (Mono 6.12) | `judge-csharp` |
| 21 | `fsharp` | F# (.NET 10) | `judge-fsharp` |
| 22 | `vbnet` | Visual Basic .NET (.NET 10) | `judge-fsharp` |
| 23 | `r` | R 4.5 | `judge-r` |
| 24 | `perl` | Perl 5.40 | `judge-perl` |
| 25 | `php` | PHP 8.4 | `judge-php` |
| 26 | `ruby` | Ruby 3.4 | `judge-ruby` |
| 27 | `lua` | Lua 5.4 | `judge-lua` |
| 28 | `haskell` | Haskell (GHC 9.4) | `judge-haskell` |
| 29 | `dart` | Dart 3.8 | `judge-dart` |
| 30 | `zig` | Zig 0.13 | `judge-zig` |
| 31 | `nim` | Nim 2.2 | `judge-nim` |
| 32 | `ocaml` | OCaml 4.14 | `judge-ocaml` |
| 33 | `elixir` | Elixir 1.18 | `judge-elixir` |
| 34 | `julia` | Julia 1.12 | `judge-julia` |
| 35 | `d` | D (LDC 1.39) | `judge-d` |
| 36 | `racket` | Racket 8.10 | `judge-racket` |
| 37 | `vlang` | V 0.5 | `judge-v` |
| 38 | `fortran` | Fortran (GFortran 14) | `judge-fortran` |
| 39 | `pascal` | Pascal (FPC 3.2) | `judge-pascal` |
| 40 | `delphi` | Delphi (FPC, Delphi mode) | `judge-pascal` |
| 41 | `nasm` | Assembly (NASM x86-64 / GNU as AArch64) | `judge-nasm` |
| 42 | `cobol` | COBOL (GnuCOBOL 3.2) | `judge-cobol` |
| 43 | `scala` | Scala 3.5 | `judge-scala` |
| 44 | `erlang` | Erlang 27 | `judge-erlang` |
| 45 | `commonlisp` | Common Lisp (SBCL 2.5) | `judge-commonlisp` |
| 46 | `bash` | Bash 5.2 | `judge-bash` |
| 47 | `sed` | Sed | `judge-bash` |
| 48 | `dc` | dc (desk calculator) | `judge-bash` |
| 49 | `ada` | Ada (GNAT 14) | `judge-ada` |
| 50 | `clojure` | Clojure 1.12 | `judge-clojure` |
| 51 | `prolog` | Prolog (SWI-Prolog 9) | `judge-prolog` |
| 52 | `tcl` | Tcl 8.6 | `judge-tcl` |
| 53 | `awk` | AWK (GAWK 5) | `judge-awk` |
| 54 | `scheme` | Scheme (Chicken 5) | `judge-scheme` |
| 55 | `raku` | Raku (Rakudo) | `judge-raku` |
| 56 | `groovy` | Groovy 4.0 | `judge-groovy` |
| 57 | `octave` | GNU Octave 9 | `judge-octave` |
| 58 | `crystal` | Crystal 1.14 | `judge-crystal` |
| 59 | `powershell` | PowerShell 7.5 | `judge-powershell` |
| 60 | `postscript` | PostScript (Ghostscript 10) | `judge-postscript` |
| 61 | `haxe` | Haxe 4.3 (Python backend) | `judge-haxe` |
| 62 | `odin` | Odin | `judge-odin` |
| 63 | `forth` | Forth (Gforth) | `judge-forth` |
| 64 | `brainfuck` | Brainfuck | `judge-brainfuck` |
| 65 | `befunge` | Befunge-93 | `judge-esoteric` |
| 66 | `aheui` | Aheui | `judge-esoteric` |
| 67 | `hyeong` | Hyeong | `judge-esoteric` |
| 68 | `whitespace` | Whitespace | `judge-esoteric` |
| 69 | `b` | B (BCause) | `judge-b` |
| 70 | `j` | J 9.6 | `judge-j` |
| 71 | `apl` | APL (GNU APL) | `judge-apl` |
| 72 | `freebasic` | FreeBASIC | `judge-freebasic` |
| 73 | `smalltalk` | Smalltalk (GNU Smalltalk) | `judge-smalltalk` |
| 74 | `bqn` | BQN (CBQN) | `judge-bqn` |
| 75 | `k` | K (ngn/k) | `judge-k` |
| 76 | `uiua` | Uiua | `judge-uiua` |
| 77 | `icon` | Icon | `judge-icon` |
| 78 | `algol68` | Algol 68 (a68g) | `judge-algol68` |
| 79 | `simula` | Simula (GNU Cim) | `judge-simula` |
| 80 | `snobol4` | SNOBOL4 (CSNOBOL4) | `judge-snobol4` |
| 81 | `lolcode` | LOLCODE (lci) | `judge-lolcode` |
| 82 | `intercal` | INTERCAL (C-INTERCAL) | `judge-intercal` |
| 83 | `shakespeare` | Shakespeare (shakespearelang) | `judge-shakespeare` |
| 84 | `unlambda` | Unlambda | `judge-unlambda` |
| 85 | `umjunsik` | 엄준식 (Umjunsik) | `judge-umjunsik` |
| 86 | `deno_js` | JavaScript (Deno) | `judge-deno` |
| 87 | `deno_ts` | TypeScript (Deno) | `judge-deno` |
| 88 | `bun_js` | JavaScript (Bun) | `judge-bun` |
| 89 | `bun_ts` | TypeScript (Bun) | `judge-bun` |
| 90 | `gleam` | Gleam (Erlang target) | `judge-gleam` |
| 91 | `sml` | Standard ML (Poly/ML) | `judge-sml` |
| 92 | `fennel` | Fennel (Lua VM) | `judge-lua` |
| 93 | `flix` | Flix (JVM) | `judge-jvm` |

## Adding a New Language

1. Add to `Language` union in `src/types/index.ts`
2. Add config in `src/lib/judge/languages.ts` (toolchain version, Docker image info, compile/run commands)
3. Add Rust enum variant in `judge-worker-rs/src/types.rs`
4. Add Rust config + match arm + test entry in `judge-worker-rs/src/languages.rs`
5. Create `docker/Dockerfile.judge-<name>`
6. Add A+B test solution in `tests/e2e/all-languages-judge.spec.ts`
7. Run `npm run languages:sync` to sync to database

After syncing, the judge worker reads `dockerImage`, `compileCommand`, and `runCommand` from the database at runtime — not from compiled-in defaults. Language settings can be overridden via the admin UI at `/dashboard/admin/languages` without redeploying the worker.

## Admin Language Management

`/dashboard/admin/languages` lets admins view and override per-language settings stored in the DB:
- Docker image name (`dockerImage`)
- Compile command (`compileCommand`)
- Run command (`runCommand`)
- Toggle languages enabled/disabled
- **Disk usage** — a progress bar shows total Docker disk usage on the host with color coding (green/yellow/red). Displayed at the top of the page, fetched live via the Docker images API.
- **Per-image sizes** — each language row shows the local image size fetched live from `GET /api/v1/admin/docker/images`. Rows where the image is not yet pulled show "Not built".

Changes take effect immediately for new submissions without restarting services.

## Docker Image Sizes (amd64, 2026-03-20)

| Image | Size | Base | Change |
|-------|------|------|--------|
| `judge-haskell` | 1.81 GB | ghc:9.4-alpine | **-2.16 GB (54%)** |
| `judge-swift` | 2.79 GB | Multi-stage ubuntu:24.04 | **-2.26 GB (45%)** |
| `judge-julia` | 1.50 GB | julia:1.12 | — |
| `judge-r` | 1.27 GB | r-base:4.5.0 | — |
| `judge-rust` | 1.21 GB | rust:1.94-slim-bookworm | — |
| `judge-csharp` | 1.07 GB | mono:6.12 | — |
| `judge-clang` | 879 MB | Alpine 3.21 | — |
| `judge-octave` | 830 MB | Alpine 3.21 | **-94 MB** |
| `judge-scala` | 780 MB | temurin:21-jdk-alpine | **-111 MB** |
| `judge-nim` | 727 MB | Alpine 3.21 | — |
| `judge-groovy` | 613 MB | temurin:21-jdk-alpine | **-117 MB** |
| `judge-zig` | 598 MB | Alpine 3.21 | — |
| `judge-jvm` | 593 MB | temurin:25-jdk-alpine | **-128 MB** |
| `judge-crystal` | 581 MB | Debian Bookworm | — |
| `judge-d` | 563 MB | Ubuntu Noble | — |
| `judge-ocaml` | 554 MB | Alpine 3.21 | — |
| `judge-dart` | 492 MB | Multi-stage bookworm-slim | **-578 MB (54%)** |
| `judge-v` | 492 MB | Debian Bookworm slim | — |
| `judge-powershell` | 461 MB | Debian Bookworm | — |
| `judge-cobol` | 443 MB | Debian Bookworm slim | — |
| `judge-ada` | 443 MB | Alpine 3.21 | **-72 MB** |
| `judge-scheme` | 404 MB | Debian Bookworm slim | — |
| `judge-racket` | 359 MB | Debian Bookworm | — |
| `judge-go` | 357 MB | golang:1.26.1-alpine | **-853 MB (71%)** |
| `judge-cpp` | 340 MB | Alpine 3.21 | — |
| `judge-fortran` | 323 MB | Alpine 3.21 | **-115 MB** |
| `judge-clojure` | 312 MB | temurin:25-jre-alpine | **-123 MB** |
| `judge-node` | 257 MB | node:24-alpine | **-96 MB** |
| `judge-prolog` | 245 MB | Debian Bookworm slim | — |
| `judge-pascal` | 219 MB | Debian Bookworm slim | — |
| `judge-esoteric` | 201 MB | Debian Bookworm | — |
| `judge-elixir` | 173 MB | Alpine 3.21 | — |
| `judge-php` | 155 MB | php:8.4-cli-alpine | **-596 MB (79%)** |
| `judge-erlang` | 147 MB | Alpine 3.21 | — |
| `judge-ruby` | 128 MB | Alpine 3.21 | — |
| `judge-postscript` | 124 MB | Alpine 3.21 | **-98 MB** |
| `judge-brainfuck` | 119 MB | Debian Bookworm slim | — |
| `judge-commonlisp` | 80 MB | Alpine 3.21 | — |
| `judge-python` | 71 MB | python:3.14-alpine | **-109 MB** |
| `judge-perl` | 64 MB | Alpine 3.21 | **-198 MB** |
| `judge-tcl` | 20 MB | Alpine 3.21 | — |
| `judge-bash` | 15 MB | Alpine 3.21 | — |
| `judge-lua` | 14 MB | Alpine 3.21 | — |
| `judge-awk` | 13 MB | Alpine 3.21 | — |

**Total: ~24 GB** across 68 images (down from ~31.1 GB, saved **~7.1 GB / 23%**)

## Docker Image Management API

- `GET /api/v1/admin/docker/images` — returns the list of locally available Docker images on the judge host, including per-image size in bytes. Used by the language management UI to show image availability status and sizes.
- `POST /api/v1/admin/docker/images/build` — builds a Docker image from its Dockerfile in `docker/`. Body: `{ language: string }`. Looks up the language config to derive the Dockerfile path. Admin/super_admin only. Audit logged.
- `DELETE /api/v1/admin/docker/images` — removes a Docker image by tag. Body: `{ imageTag: string }`. Admin/super_admin only. Audit logged.

The language admin UI at `/dashboard/admin/languages` includes per-language Build (hammer icon) and Remove (trash icon) buttons. Image availability is shown as a badge ("Available" / "Not built") per row, with live image size fetched from the API.

**CSRF**: Mutation API routes require the `X-Requested-With: XMLHttpRequest` header. This is the correct header name — do not use `x-csrf-token`. The admin language management UI and E2E fetch helpers must include this header on POST/DELETE/PATCH requests.

## Student Detail Page

`/dashboard/contests/[assignmentId]/students/[userId]` — accessible to admins and instructors. Shows a per-student submission breakdown for a specific assignment, with per-problem status and submission history drill-down.

## Contest System

JudgeKit supports full contest management with two scoring models and two scheduling modes:

### Scoring Models
- **IOI** (`ioi`) — partial scoring; each problem scored independently, best score per problem counts
- **ICPC** (`icpc`) — binary scoring; problems are either accepted or not, ties broken by penalty time

### Scheduling Modes
- **Scheduled** (`scheduled`) — fixed start and end times set by the admin
- **Windowed** (`windowed`) — each participant gets a fixed-duration window starting from when they begin

### Contest Features
- **Leaderboard** with real-time rankings and optional freeze period before contest end
- **Anti-cheat** — event recording (tab switches, copy/paste, focus loss), filtering, code similarity detection
- **Participant audit** — per-participant timeline of anti-cheat events, accessible to admins/instructors
- **Contest analytics** — score distribution stats (mean, median, submitted count, perfect-score count)

## Architecture

### Database
- **SQLite** at `/app/data/judge.db` (inside Docker: volume-mounted)
- **ORM**: Drizzle ORM with schema in `src/lib/db/schema.ts`
- **Migrations**: Drizzle-generated SQL files in `drizzle/`, applied via Node script during Docker deployment (reads `.sql` files, splits on `--> statement-breakpoint`, executes each statement)
- **Sync**: `npm run languages:sync` syncs language definitions from TypeScript config to the `language_configs` table

### Security Sandbox
- **Seccomp profile**: Uses a **deny-list** approach — default action is `SCMP_ACT_ALLOW`, with specific dangerous syscalls explicitly blocked. This is more permissive during container init (avoids Docker 28+/modern-kernel init errors) while still restricting the attack surface during code execution.
- **Docker isolation**: No network access, memory/CPU limits, non-root user, resource timeouts
- **`JUDGE_DISABLE_CUSTOM_SECCOMP=1`**: Env var to fall back to Docker default seccomp on hosts where the custom profile is rejected

### Docker Deployment Architecture
- **Server-side builds**: `deploy-docker.sh` rsyncs source to the remote server and builds Docker images there. No local image builds — avoids architecture mismatches between dev machines (e.g., arm64 Mac) and the target host (e.g., amd64 Linux).
- **`--no-cache` on app and worker builds**: `deploy-docker.sh` passes `--no-cache` when building `judgekit-app` and `judgekit-judge-worker` to ensure a clean build on every deploy. Language images are not rebuilt with `--no-cache` by default.
- **DNS in Dockerfiles**: Languages that need network access during build (e.g., `cargo install`) set DNS explicitly in their Dockerfiles via `resolv.conf` override. The `--dns` flag is not used because it is incompatible with Docker BuildKit/buildx.
- **Architecture auto-detection**: The deploy script runs `uname -m` on the remote host and sets `--platform linux/amd64` or `--platform linux/arm64` accordingly. All `docker build` commands (app, judge worker, and all language images) receive this flag.
- **Docker CLI in the app container**: The `judgekit-app` image installs `docker-cli` (Alpine package) and the `nextjs` user is added to the `docker` group (gid 987) so it can reach the socket. The compose file mounts `/var/run/docker.sock:/var/run/docker.sock` on both the `app` and `judge-worker` containers. This enables the admin Docker image management API (`GET/POST/DELETE /api/v1/admin/docker/images`) to operate without a separate privileged sidecar.
- **`privileged: true`** on the judge-worker container — required for Docker-in-Docker execution (the worker spawns sibling containers to run student code).
- **`/judge-workspaces` volume mount** — `/judge-workspaces:/judge-workspaces` is mounted on the worker container. The `TMPDIR=/judge-workspaces` env var ensures the worker writes temporary files to this shared volume. The host must have `/judge-workspaces` created before starting the stack.
- **Compiled output path**: All compiled language Dockerfiles output binaries to `/workspace/solution` (not `/tmp/solution`). `/tmp` is an ephemeral per-container tmpfs; `/workspace` is the shared workspace bind-mounted between the worker and sibling judge containers.
- **Groovy uses Java 21**: The `judge-groovy` image is based on `eclipse-temurin:21-jdk-jammy`. Groovy 4.0 requires Java 21 — Java 25 class file versions are incompatible with the Groovy bytecode verifier.
- **PID limits**: Judge containers use `--pids-limit 64` for run phase and `--pids-limit 128` for compile phase (increased from 16/64) — required for VM-based runtimes (BEAM, JVM, PowerShell) that spawn many OS threads.
- **DNS**: Judge containers use Cloudflare DNS (1.1.1.1). `/etc/resolv.conf` is locked with `chattr +i` to prevent container overrides.
- **Claim endpoint sh -c wrapping**: The judge claim API endpoint wraps `compileCommand` and `runCommand` values in `["sh", "-c", cmd]` before passing to the worker. The DB stores raw commands without `sh -c` — do not double-wrap when editing via admin UI.
- **Zig compile flag**: Zig 0.13 uses `-femit-bin=/workspace/solution` (not `-o`) to specify the output binary path. Example: `zig build-exe --cache-dir /tmp/zig-cache -femit-bin=/workspace/solution /workspace/solution.zig`.

### Known Flaky Languages (E2E)

6 languages remain in KNOWN_FLAKY (45 passed, 6 skipped, 0 failed). Per-language individual tests run in ~5 minutes:
- **simula**: No Docker image (GNU Cim won't compile)
- **intercal**: No A+B solution possible in INTERCAL
- **unlambda**: No A+B solution possible in Unlambda
- **umjunsik**: Korean esoteric lang — compiler compiles to Lamina IR, syntax unclear
- **k**: ngn/k can't read stdin in script mode (eoleof error)
- **uiua**: Needs GLIBC 2.39+ (rebuilt with Ubuntu 24.10 base)

Previously flaky, now fixed:
- **F#**: Dockerfile sets `HOME=/tmp` and `DOTNET_CLI_HOME=/tmp` so the .NET SDK writes to writable directories.
- **FreeBASIC**: SourceForge download uses `--retry 5 --retry-delay 10 --max-time 180` with file-based download instead of piped tar.

Test cases use only positive single-digit sums (<=9) to maximize esoteric language compatibility.

## Setup

### `scripts/setup.sh` — Interactive Setup Wizard

Run `bash scripts/setup.sh` for guided initial setup. The wizard handles:
1. Admin credential configuration (`ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars, defaults: `admin` / `admin123`)
2. Language preset selection (`core`, `popular`, `extended`, `all`, `none`)
3. Individual language add/remove
4. `npm install`, `db:push`, seed, `languages:sync`, and Docker image builds

Non-interactive mode: `bash scripts/setup.sh --defaults` (uses admin/admin123, no Docker images).

The seed script (`scripts/seed.ts`) reads `ADMIN_USERNAME` and `ADMIN_PASSWORD` from environment variables. If not set, defaults to `admin` / `admin123`. Credentials are written to `data/.admin-password` for reference.

## Deployment

### `deploy-docker.sh` Workflow (Primary)

The recommended deployment method. Workflow:

1. **Pre-flight**: Tests SSH, verifies remote Docker, detects remote architecture
2. **Generate `.env.production`**: Creates with fresh secrets if not present
3. **rsync source to remote**: Syncs entire repo excluding `node_modules/`, `.next/`, `.git/`, `data/`, `.env*`, `*.db`, `judge-worker-rs/target/`, `rate-limiter-rs/target/`, `.omc/`, `.claude/`, `tests/`, `.playwright/`, `backups/`, `._*`
4. **Build images on remote**: Builds `judgekit-app` and `judgekit-judge-worker` with `--platform` flag, then builds judge language images
5. **Stop old containers, start new**: Uses `docker-compose.production.yml`
6. **Run database migrations**: Executes Drizzle SQL migrations inside the app container via a Node one-liner
7. **Configure nginx**: Writes config to `/tmp`, transfers via `scp`, then `sudo cp` into `/etc/nginx/sites-available/` (avoids heredoc + sudo + tee issues)
8. **Verify**: Checks HTTP response from the app container

Usage:
```bash
# Full deployment (password auth)
SSH_PASSWORD='...' REMOTE_HOST=10.50.1.116 REMOTE_USER=platform ./deploy-docker.sh

# Full deployment (key auth)
SSH_KEY=key.pem REMOTE_HOST=... REMOTE_USER=... DOMAIN=... ./deploy-docker.sh

# Skip image build (reuse existing)
./deploy-docker.sh --skip-build

# Skip judge language images only
./deploy-docker.sh --skip-languages

# Build only core language images (cpp, python, jvm)
./deploy-docker.sh --languages=core

# Build specific languages
./deploy-docker.sh --languages=cpp,python,node,rust
```

Language presets: `core` (~0.8 GB), `popular` (~2.5 GB), `extended` (~8 GB), `all` (~14 GB), `none`.

### SSH Authentication

The script supports two methods:
- **Password auth**: Set `SSH_PASSWORD` env var (requires `sshpass` installed locally)
- **Key auth**: Set `SSH_KEY` to the path of the private key file

### nginx Configuration

The deploy script writes the nginx config to a local temp file, transfers it to the remote host via `scp`, then uses `sudo cp` to install it. This avoids the common pitfall of heredoc + sudo + tee over SSH. The config includes rate limiting for auth and judge endpoints.

### `deploy.sh` (Legacy Systemd Deploy)

For hosts running services directly via systemd (not Docker). Pulls latest code, runs `npm ci`, `npm run languages:sync`, `npm run db:push`, `npm run build`, optionally builds the Rust worker with `cargo build --release`, then restarts systemd services.

## Build & Verify

```bash
npx tsc --noEmit                              # TypeScript check
npx vitest run                                # Unit tests
npx vitest run --config vitest.config.integration.ts  # Integration tests
cd judge-worker-rs && cargo test              # Rust tests
npx playwright test tests/e2e/               # E2E tests (needs PLAYWRIGHT_BASE_URL)
```

## Testing Rules (MANDATORY)

Every feature, fix, or enhancement MUST include appropriate tests. **No code is considered complete without tests.** Work that lacks tests will be rejected.

### Test Layers (ALL required per feature)

Every new feature MUST have tests across all applicable layers:

| Layer | Tool | Location | Purpose | Required? |
|-------|------|----------|---------|-----------|
| **Unit** | Vitest | `tests/unit/` | Pure functions, validators, utilities, scoring logic, data helpers | Always |
| **API / Mock** | Vitest | `tests/unit/api/` | Route handlers with mocked DB/auth, mock external deps | When API routes are added/changed |
| **Integration** | Vitest | `tests/integration/` | Cross-module interactions, real DB queries | When DB logic is complex |
| **E2E** | Playwright | `tests/e2e/` | Full user flows through the browser UI | Always for user-facing features |

### Per-Feature Test Checklist

For every feature, go through this checklist:

1. **Unit tests** — Test all pure logic (helpers, validators, scoring, data transforms) with known inputs/outputs. Mock DB and external dependencies. Cover both success and error paths.
2. **API / Mock tests** — Test route handlers with mocked auth and DB. Verify request validation, authorization checks, happy path responses, and error responses (401, 403, 404, 422).
3. **E2E tests** — Test the full user flow in a real browser. Navigate to the feature, interact with it, verify all sections render, verify navigation works. Test with both Korean and English locales where applicable.

### What to Test

- **New feature**: Unit tests for logic + API/mock tests for routes + E2E test for user flow (ALL three)
- **Bug fix**: Regression test that fails without the fix, passes with it
- **Refactor**: Existing tests must still pass; add tests if coverage gaps found
- **New language**: A+B solution in `tests/e2e/all-languages-judge.spec.ts` + Rust config test
- **New API route**: API test with auth/validation/happy-path/error cases + unit test for any helper functions
- **Validators**: Unit tests for valid/invalid inputs and edge cases
- **Scoring/contest logic**: Unit tests with known inputs and expected outputs
- **UI components**: E2E tests verifying rendering, interaction, and navigation

### Test Conventions

- Use factories from `tests/unit/support/factories.ts` for test data
- Mock external dependencies (DB, auth) in unit/API tests using `vi.mock()`
- E2E tests run against the test server (see `ENV.md` for target), never production
- Name test files as `<module>.test.ts` (unit/API) or `<feature>.spec.ts` (E2E)
- Group related assertions in `describe` blocks
- Test both success and error paths
- Use `test.skip()` with clear reason for tests that depend on external state (e.g., "No contests available")

### E2E Testing Rules (MANDATORY)

**Target:** Always run E2E tests against the test server (see `ENV.md` for host and credentials). Never against production.

```bash
# Standard E2E run (read ENV.md for host, credentials)
PLAYWRIGHT_BASE_URL=<from ENV.md> E2E_USERNAME=<from ENV.md> E2E_PASSWORD='<from ENV.md>' \
  npx playwright test tests/e2e/
```

**What to E2E test:**
- All user-facing features (contest, assignments, submissions, admin pages)
- All user roles (admin, instructor, student) with proper capabilities
- Contest modes: scheduled (start/end time) and windowed (fixed duration)
- All supported judge languages (`tests/e2e/all-languages-judge.spec.ts`)
- Participant audit: navigation, all sections render, back link
- Admin console: roles, users, settings, audit logs, languages (`/dashboard/admin/languages`)
- Student detail: per-student submission breakdown per assignment (`/dashboard/contests/[assignmentId]/students/[userId]`)
- Anti-cheat: event recording, filtering, similarity checks

**After every deploy:** Run full E2E suite against the test server to verify the deployment is healthy.

### Quality Gates (ALL must pass before deploy)

- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all unit tests pass
- `cargo test` (in judge-worker-rs/) — all Rust tests pass
- E2E tests pass against test server after deploy

## Environment Variables (`ENV.md`)

All deployment credentials, SSH access, target hosts, and runtime secrets are documented in **`ENV.md`** (gitignored, never committed). Before any deployment, SSH, or E2E testing task, **always read `ENV.md` first** to get the correct values.

`ENV.md` contains:
- **Deployment targets** — host IPs, domains, SSH users/passwords/keys, remote directories, app ports
- **Web admin credentials** — username/password for each environment
- **E2E test credentials** — `PLAYWRIGHT_BASE_URL`, `E2E_USERNAME`, `E2E_PASSWORD`
- **SSH access commands** — ready-to-use `sshpass`/`ssh` commands for each target
- **Docker & Nginx** — container management commands, nginx config paths

**CRITICAL**: Always read `ENV.md` for deployment targets, SSH credentials (hosts, users, passwords, keys), web admin logins, E2E test credentials, and remote directory paths. Never hardcode credentials in code or agent instructions. `ENV.md` contains ready-to-use SSH commands, Docker Compose commands, and E2E test invocations for each target environment.

## Deployment

**RULE: Always read `ENV.md` before any deployment, SSH, or E2E testing task.** Never guess credentials or host addresses — they are all documented in `ENV.md`. Failing to read it first leads to failed deploys and wasted time.

The primary deploy script is `deploy-docker.sh`. Pass environment variables from `ENV.md`:
- `SSH_PASSWORD` — for password-based SSH auth (Target 1)
- `SSH_KEY` — for key-based SSH auth (Target 2)
- `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN` — target overrides

**Server-side builds:** `deploy-docker.sh` builds all Docker images directly on the remote server (not locally), avoiding architecture mismatches between dev machines and the target host. The script auto-detects the server's architecture (`amd64`/`arm64`) and sets the appropriate platform flag automatically.

**Docker Compose configuration (production):**
- The judge worker container runs with `privileged: true` to allow Docker-in-Docker execution
- `/judge-workspaces:/judge-workspaces` volume is mounted on the worker container for workspace sharing; `TMPDIR=/judge-workspaces` ensures the worker writes temp files there
- The host **must** have `/judge-workspaces` directory created before starting the stack

**Seccomp profile:** Uses a deny-list approach — default action is `SCMP_ACT_ALLOW`, with specific dangerous syscalls explicitly blocked. This is more permissive during container init (avoids Docker 28+/modern-kernel init errors) while still restricting the attack surface during code execution.

Always test against the test server documented in `ENV.md`, never against production. Read `ENV.md` for all target hosts and domains.

## Conventions

- Semantic commits: `<type>(<scope>): <gitmoji> <description>`
- GPG-signed commits with gitminer (7 leading zeros)
- Fine-grained commits (one per feature/fix)
- Always `git pull --rebase` before `git push`
- Every commit MUST include relevant tests (see Testing Rules above)
