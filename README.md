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
  Docker-sandboxed execution for <a href="docs/languages.md">55 language variants</a> on both AMD64 and ARM64.
</p>

---

## Features

- **Cross-platform (AMD64 + ARM64)** — Full stack runs natively on both architectures: Next.js app, Rust judge worker, Rust sidecars, and all 44 Docker judge images. Deploy on x86-64 servers or ARM64 (AWS Graviton, Ampere Altra, Apple Silicon) with automatic architecture detection — no emulation, no cross-compilation
- **55 languages** — C/C++, Java, Python, Rust, Go, and [50 more](docs/languages.md), all with multi-arch Docker images and admin-customizable compile/run settings
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

## Docker Judge Images (amd64)

44 language-specific Docker images are used for sandboxed code execution. Sizes measured on amd64 (x86-64):

| Image | Size | Image | Size |
|-------|------|-------|------|
| `judge-awk` | 13 MB | `judge-lua` | 14 MB |
| `judge-bash` | 15 MB | `judge-tcl` | 20 MB |
| `judge-perl` | 64 MB | `judge-python` | 71 MB |
| `judge-commonlisp` | 80 MB | `judge-brainfuck` | 119 MB |
| `judge-postscript` | 124 MB | `judge-ruby` | 128 MB |
| `judge-erlang` | 147 MB | `judge-php` | 155 MB |
| `judge-elixir` | 173 MB | `judge-esoteric` | 201 MB |
| `judge-pascal` | 219 MB | `judge-prolog` | 245 MB |
| `judge-node` | 257 MB | `judge-clojure` | 312 MB |
| `judge-fortran` | 323 MB | `judge-cpp` | 340 MB |
| `judge-go` | 357 MB | `judge-racket` | 359 MB |
| `judge-scheme` | 404 MB | `judge-ada` | 443 MB |
| `judge-cobol` | 443 MB | `judge-powershell` | 461 MB |
| `judge-dart` | 492 MB | `judge-v` | 492 MB |
| `judge-ocaml` | 554 MB | `judge-d` | 563 MB |
| `judge-crystal` | 581 MB | `judge-jvm` | 593 MB |
| `judge-zig` | 598 MB | `judge-groovy` | 613 MB |
| `judge-nim` | 727 MB | `judge-scala` | 780 MB |
| `judge-clang` | 879 MB | `judge-octave` | 830 MB |
| `judge-csharp` | 1.07 GB | `judge-rust` | 1.21 GB |
| `judge-r` | 1.27 GB | `judge-julia` | 1.50 GB |
| `judge-swift` | 2.79 GB | `judge-haskell` | 1.81 GB |

**Total: ~24 GB** across 44 images.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite + Drizzle ORM |
| Auth | Auth.js v5 (Credentials) |
| UI | Tailwind CSS v4, shadcn/ui |
| Judge Worker | Rust binary with Docker-sandboxed execution |
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

## Documentation

- [Deployment Guide](docs/deployment.md) — provisioning, deploy scripts, nginx, post-deploy checks
- [Authentication](docs/authentication.md) — sign-in flow, cookie architecture, API smoke test
- [Languages](docs/languages.md) — all 55 variants, Docker image presets, admin management

## License

MIT
