<p align="center">
  <img src="src/app/icon.svg" alt="JudgeKit" width="96" height="96" />
</p>

<h1 align="center">JudgeKit</h1>

<p align="center">
  <a href="https://github.com/hletrd/JudgeKit"><img src="https://img.shields.io/badge/GitHub-JudgeKit-181717?logo=github" alt="GitHub" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-Drizzle_ORM-green?logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Docker-Sandboxed-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/Platform-AMD64_%7C_ARM64-orange?logo=linux" alt="AMD64 | ARM64" />
</p>

<p align="center">
  A secure, cross-platform code evaluation platform for programming assignments.<br/>
  Docker-sandboxed execution for <a href="docs/languages.md">88 language variants</a> on both AMD64 and ARM64.
</p>

---

## Features

- **Cross-platform (AMD64 + ARM64)** — Full stack runs natively on both architectures: Next.js app, Rust judge worker, Rust sidecars, and all 70 Docker judge images. Deploy on x86-64 servers or ARM64 (AWS Graviton, Ampere Altra, Apple Silicon) with automatic architecture detection — no emulation, no cross-compilation
- **88 languages** — C/C++, Java, Python, Rust, Go, Deno, Bun, Gleam, Standard ML, and [78 more](docs/languages.md), all with multi-arch Docker images and admin-customizable compile/run settings
- **Scalable judging** — Dedicated judge workers with multi-worker support. Workers register, send heartbeats, and gracefully deregister. Admin dashboard for real-time monitoring. Deploy N workers across multiple machines with a single deploy script
- **Secure execution** — Docker containers with no network, seccomp, memory/CPU limits
- **Role-based access** — Super admin, admin, instructor, student
- **Classroom management** — Groups, enrollments, assignments with deadlines and late penalties
- **Contest system** — IOI and ICPC scoring, scheduled and windowed modes, real-time leaderboard, anti-cheat
- **Code similarity** — Rust-accelerated Jaccard n-gram analysis with TS fallback

## Getting Started

### Quickstart for Agents

Paste the following prompt into [Claude Code](https://claude.com/claude-code), [Codex](https://openai.com/index/codex/), [OpenCode](https://opencode.ai/), [Gemini CLI](https://github.com/google-gemini/gemini-cli), or any AI coding agent:

```text
Clone and set up JudgeKit (online judge platform) for local development.

1. git clone https://github.com/hletrd/JudgeKit.git && cd JudgeKit
2. Run `bash scripts/setup.sh` (or `bash scripts/setup.sh --defaults` for non-interactive)
3. Run `npm run dev` to start on http://localhost:3000
4. Log in with admin / admin123

Do NOT build Docker judge images — they are only needed for submission judging, not for running the web app.
```

### Manual setup

<details>
<summary>Step-by-step instructions</summary>

```bash
npm install
cp .env.example .env        # Set AUTH_SECRET (openssl rand -base64 32)
npm run db:push
npm run seed                 # Creates admin/admin123
npm run dev
```

Optionally build judge Docker images:

```bash
docker build -t judge-python -f docker/Dockerfile.judge-python .
```

See [Language presets](docs/languages.md#docker-image-presets) for preset options (`core`, `popular`, `extended`, `all`).

</details>

## Docker Judge Images

70 language-specific Docker images for sandboxed code execution on both AMD64 and ARM64. 68 of 70 build on both architectures.

| Image | amd64 | arm64 | Image | amd64 | arm64 |
|-------|-------|-------|-------|-------|-------|
| `judge-awk` | 13 MB | 10 MB | `judge-lua` | 14 MB | 10 MB |
| `judge-bash` | 15 MB | 13 MB | `judge-tcl` | 20 MB | 13 MB |
| `judge-nasm` | 34 MB | 26 MB | `judge-perl` | 64 MB | 48 MB |
| `judge-python` | 71 MB | 51 MB | `judge-commonlisp` | 80 MB | 50 MB |
| `judge-postscript` | 124 MB | 95 MB | `judge-ruby` | 128 MB | 84 MB |
| `judge-erlang` | 147 MB | 88 MB | `judge-algol68` | 115 MB | 100 MB |
| `judge-forth` | 116 MB | 101 MB | `judge-lolcode` | 116 MB | 101 MB |
| `judge-snobol4` | — | 101 MB | `judge-icon` | 120 MB | 102 MB |
| `judge-elixir` | 173 MB | 102 MB | `judge-brainfuck` | 119 MB | 103 MB |
| `judge-php` | 155 MB | 105 MB | `judge-bun` | 153 MB | 107 MB |
| `judge-gleam` | 184 MB | 113 MB | `judge-umjunsik` | 113 MB | 98 MB |
| `judge-deno` | 194 MB | 124 MB | `judge-bqn` | 157 MB | 125 MB |
| `judge-shakespeare` | 199 MB | 160 MB | `judge-esoteric` | 201 MB | 161 MB |
| `judge-uiua` | 202 MB | 178 MB | `judge-pascal` | 219 MB | 185 MB |
| `judge-node` | 257 MB | 188 MB | `judge-prolog` | 245 MB | 192 MB |
| `judge-raku` | 258 MB | 212 MB | `judge-fortran` | 323 MB | 213 MB |
| `judge-clojure` | 312 MB | 229 MB | `judge-cpp` | 340 MB | 231 MB |
| `judge-go` | 357 MB | 237 MB | `judge-v` | 492 MB | 273 MB |
| `judge-haxe` | 377 MB | 277 MB | `judge-scheme` | 404 MB | 298 MB |
| `judge-objective-c` | 427 MB | 305 MB | `judge-ada` | 443 MB | 315 MB |
| `judge-freebasic` | 436 MB | 320 MB | `judge-cobol` | 443 MB | 321 MB |
| `judge-sml` | 493 MB | 356 MB | `judge-dart` | 492 MB | 374 MB |
| `judge-racket` | 359 MB | 507 MB | `judge-d` | 563 MB | 388 MB |
| `judge-zig` | 598 MB | 395 MB | `judge-groovy` | 613 MB | 400 MB |
| `judge-crystal` | 581 MB | 405 MB | `judge-ocaml` | 554 MB | 406 MB |
| `judge-jvm` | 593 MB | 436 MB | `judge-nim` | 727 MB | 523 MB |
| `judge-scala` | 780 MB | 523 MB | `judge-octave` | 830 MB | 538 MB |
| `judge-clang` | 879 MB | 670 MB | `judge-fsharp` | 985 MB | 687 MB |
| `judge-csharp` | 1.07 GB | 693 MB | `judge-rust` | 1.21 GB | 810 MB |
| `judge-r` | 1.27 GB | 850 MB | `judge-julia` | 1.50 GB | 1.23 GB |
| `judge-odin` | 1.81 GB | 1.34 GB | `judge-haskell` | 1.81 GB | 1.59 GB |
| `judge-powershell` | 461 MB | 352 MB | `judge-smalltalk` | 122 MB | 76 MB |
| `judge-swift` | 2.79 GB | 2.11 GB | | | |

2 images are amd64-only: `judge-b` (x86 inline asm), `judge-apl` (make fails on arm64).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite + Drizzle ORM |
| Auth | Auth.js v5 (Credentials) |
| UI | Tailwind CSS v4, shadcn/ui |
| Judge Worker | Rust binary with Docker-sandboxed execution (multi-worker) |
| Code Similarity | Rust axum sidecar (rayon + ahash) |

## Project Structure

```
judgekit/
├── docker/              # Judge Docker images & seccomp profile
├── judge-worker-rs/     # Rust judge worker (production)
├── code-similarity-rs/  # Rust code similarity sidecar
├── rate-limiter-rs/     # Rust rate limiter sidecar
├── scripts/             # Systemd services & deploy scripts
├── src/
│   ├── app/             # Next.js App Router (pages, API routes)
│   ├── lib/             # Core logic (DB, auth, assignments, judge)
│   ├── components/      # UI components
│   └── types/           # TypeScript types
├── tests/               # Vitest unit + Playwright E2E
├── docs/                # Extended documentation
└── data/                # SQLite database (gitignored)
```

## Architecture

<p align="center">
  <img src="docs/architecture.svg" alt="JudgeKit Architecture" width="720" />
</p>

Workers connect to the app server via HTTP(S) only. Each worker registers on startup, sends periodic heartbeats, and deregisters on graceful shutdown. The atomic `UPDATE...RETURNING` claim SQL ensures no two workers can claim the same submission. Stale workers are automatically detected and their submissions reclaimed.

## Deployment

### Single-machine (default)

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

### Dedicated workers (scale-out)

Deploy additional workers to separate machines using `docker-compose.worker.yml`:

```bash
JUDGE_BASE_URL=https://your-app-server/api/v1 \
JUDGE_AUTH_TOKEN=your-token \
JUDGE_CONCURRENCY=4 \
docker compose -f docker-compose.worker.yml up -d
```

Or use the deploy script:

```bash
./scripts/deploy-worker.sh --host=192.168.1.10 --app-url=https://oj.example.com/api/v1 --concurrency=4 --sync-images
```

Monitor workers at `/dashboard/admin/workers`.

### Prerequisites

- **Docker socket**: Both the `app` and `judge-worker` containers require `/var/run/docker.sock` mounted. The app container uses it for admin image management (build/remove language images via `/dashboard/admin/languages`). The judge worker uses it for sandboxed code execution.
- **`/judge-workspaces`**: Must exist on the host before starting the stack — used as the shared workspace volume between the judge worker and sibling judge containers.
- The `deploy-docker.sh` script handles setup automatically (server-side builds, architecture detection, nginx config). See [Deployment Guide](docs/deployment.md).

## Documentation

- [Deployment Guide](docs/deployment.md) — provisioning, deploy scripts, nginx, post-deploy checks
- [Authentication](docs/authentication.md) — sign-in flow, cookie architecture, API smoke test
- [Languages](docs/languages.md) — all 88 variants, Docker image presets, admin management
- [Judge Workers](docs/judge-workers.md) — multi-worker architecture, registration, deployment

## License

MIT
