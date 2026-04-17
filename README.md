<p align="center">
  <img src="src/app/icon.svg" alt="JudgeKit" width="96" height="96" />
</p>

<h1 align="center">JudgeKit</h1>

<p align="center">
  <a href="https://github.com/hletrd/JudgeKit"><img src="https://img.shields.io/badge/GitHub-JudgeKit-181717?logo=github" alt="GitHub" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/PostgreSQL-Drizzle_ORM-green?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-Sandboxed-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/Platform-AMD64_%7C_ARM64-orange?logo=linux" alt="AMD64 | ARM64" />
</p>

<p align="center">
  A secure, cross-platform code evaluation platform for programming assignments.<br/>
  Docker-sandboxed execution for <a href="docs/languages.md">124 language variants</a> on both AMD64 and ARM64.
</p>

---

## Features

- **Cross-platform (AMD64 + ARM64)** — Full stack runs natively on both architectures: Next.js app, Rust judge worker, Rust sidecars, and the full supported judge-image set. Deploy on x86-64 servers or ARM64 (AWS Graviton, Ampere Altra, Apple Silicon) with automatic architecture detection — no emulation, no cross-compilation
- **124 languages** — C/C++, Java, Python, Rust, Go, Deno, Bun, Gleam, Lean 4, Hare, Koka, Chapel, Elm, Idris 2, plaintext, HDL output-only modes, and [many more](docs/languages.md), all with multi-arch Docker images and admin-customizable compile/run settings
- **Scalable judging** — Distributed judge workers with automatic registration and heartbeats. Live admin dashboard. Deploy across multiple machines with a single script
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

100 language-specific Docker images for sandboxed code execution on both AMD64 and ARM64.

| Image | amd64 | arm64 | Image | amd64 | arm64 |
|-------|-------|-------|-------|-------|-------|
| `judge-awk` | 13 MB | 10 MB | `judge-lua` | 14 MB | 10 MB |
| `judge-micropython` | 14 MB | 9 MB | `judge-bash` | 15 MB | 13 MB |
| `judge-tcl` | 20 MB | 13 MB | `judge-janet` | 27 MB | 19 MB |
| `judge-nasm` | 34 MB | 26 MB | `judge-perl` | 64 MB | 48 MB |
| `judge-python` | 71 MB | 51 MB | `judge-commonlisp` | 80 MB | 50 MB |
| `judge-hy` | 84 MB | 59 MB | `judge-malbolge` | 114 MB | 136 MB |
| `judge-rexx` | 114 MB | 99 MB | `judge-algol68` | 115 MB | 100 MB |
| `judge-squirrel` | 115 MB | 100 MB | `judge-forth` | 116 MB | 101 MB |
| `judge-snobol4` | 116 MB | 101 MB | `judge-lolcode` | 117 MB | 101 MB |
| `judge-brainfuck` | 119 MB | 103 MB | `judge-icon` | 120 MB | 102 MB |
| `judge-smalltalk` | 122 MB | 76 MB | `judge-postscript` | 124 MB | 95 MB |
| `judge-arturo` | 127 MB | 111 MB | `judge-ruby` | 128 MB | 84 MB |
| `judge-picat` | 141 MB | 118 MB | `judge-erlang` | 147 MB | 88 MB |
| `judge-j` | 150 MB | 507 MB | `judge-bun` | 153 MB | 107 MB |
| `judge-php` | 155 MB | 105 MB | `judge-bqn` | 157 MB | 125 MB |
| `judge-elixir` | 173 MB | 102 MB | `judge-b` | 177 MB | 385 MB |
| `judge-gleam` | 187 MB | 113 MB | `judge-deno` | 194 MB | 124 MB |
| `judge-shakespeare` | 199 MB | 160 MB | `judge-umjunsik` | 200 MB | 98 MB |
| `judge-esoteric` | 201 MB | 161 MB | `judge-apl` | 206 MB | 147 MB |
| `judge-pascal` | 219 MB | 185 MB | `judge-uiua` | 230 MB | 178 MB |
| `judge-wat` | 235 MB | 97 MB | `judge-prolog` | 245 MB | 192 MB |
| `judge-raku` | 258 MB | 212 MB | `judge-node` | 260 MB | 188 MB |
| `judge-elm` | 276 MB | 186 MB | `judge-hare` | 287 MB | 181 MB |
| `judge-roc` | 293 MB | 207 MB | `judge-clojure` | 312 MB | 229 MB |
| `judge-fortran` | 323 MB | 213 MB | `judge-cpp` | 340 MB | 231 MB |
| `judge-go` | 357 MB | 237 MB | `judge-haxe` | 377 MB | 277 MB |
| `judge-nelua` | 380 MB | 277 MB | `judge-scheme` | 404 MB | 298 MB |
| `judge-rescript` | 406 MB | 283 MB | `judge-clean` | 415 MB | 126 MB |
| `judge-carp` | 418 MB | 303 MB | `judge-objective-c` | 427 MB | 305 MB |
| `judge-freebasic` | 441 MB | 320 MB | `judge-ada` | 443 MB | 315 MB |
| `judge-cobol` | 443 MB | 321 MB | `judge-powershell` | 460 MB | 352 MB |
| `judge-dart` | 492 MB | 374 MB | `judge-v` | 492 MB | 273 MB |
| `judge-sml` | 493 MB | 356 MB | `judge-modula2` | 512 MB | 364 MB |
| `judge-curry` | 520 MB | 302 MB | `judge-purescript` | 530 MB | 260 MB |
| `judge-ocaml` | 554 MB | 406 MB | `judge-d` | 563 MB | 388 MB |
| `judge-c3` | 580 MB | 610 MB | `judge-crystal` | 581 MB | 405 MB |
| `judge-zig` | 598 MB | 395 MB | `judge-groovy` | 613 MB | 400 MB |
| `judge-vala` | 619 MB | 452 MB | `judge-koka` | 641 MB | 470 MB |
| `judge-jvm` | 656 MB | 436 MB | `judge-flix` | 657 MB | 665 MB |
| `judge-idris2` | 660 MB | 721 MB | `judge-nim` | 727 MB | 523 MB |
| `judge-racket` | 730 MB | 507 MB | `judge-minizinc` | 747 MB | 326 MB |
| `judge-scala` | 780 MB | 523 MB | `judge-factor` | 781 MB | 584 MB |
| `judge-octave` | 830 MB | 538 MB | `judge-moonbit` | 833 MB | 890 MB |
| `judge-fsharp` | 985 MB | 687 MB | `judge-clang` | 1.02 GB | 670 MB |
| `judge-csharp` | 1.07 GB | 693 MB | `judge-mercury` | 1.14 GB | 2.03 GB |
| `judge-rust` | 1.21 GB | 810 MB | `judge-r` | 1.27 GB | 850 MB |
| `judge-grain` | 1.30 GB | 186 MB | `judge-julia` | 1.50 GB | 1.23 GB |
| `judge-haskell` | 1.81 GB | 1.59 GB | `judge-odin` | 1.81 GB | 1.34 GB |
| `judge-chapel` | 2.39 GB | 1.60 GB | `judge-pony` | 2.62 GB | 1.22 GB |
| `judge-swift` | 2.79 GB | 2.11 GB | `judge-lean` | 3.87 GB | 3.02 GB |

All 100 images build on both amd64 and arm64.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Auth.js v5 (Credentials) |
| UI | Tailwind CSS v4, shadcn/ui |
| Judge Worker | Rust binary with Docker-sandboxed execution (multi-worker) |
| Code Runner | Rust axum HTTP endpoint in judge worker for interactive code execution |
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
└── data/                # Local database files (gitignored)
```

## Architecture

<p align="center">
  <img src="docs/architecture.svg" alt="JudgeKit Architecture" width="720" />
</p>

Workers connect to the app server via HTTP(S) only. Each worker registers on startup, sends periodic heartbeats, and deregisters on graceful shutdown. The atomic `UPDATE...RETURNING` claim SQL prevents two workers from claiming the same submission. Stale workers are detected automatically and their submissions reclaimed.

The judge worker also exposes an HTTP runner endpoint (default port `3001`) for interactive "Run Code" requests plus a small internal Docker-management API used by the admin image-management screens. In the shipped Docker deployment, the Next.js app delegates all Docker work to the Rust worker instead of talking to the Docker daemon directly.

## Deployment

### Single-machine with local worker (default)

```bash
# Starts the full stack including the co-located judge worker
docker compose -f docker-compose.production.yml --env-file .env.production up -d

# Or via deploy script
./deploy-docker.sh
```

### App server only (remote workers)

When judge workers run on separate machines, start the full stack and then stop the local worker. Since the worker is always in the compose file, there is no flag to disable it up front:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d
docker compose -f docker-compose.production.yml --env-file .env.production stop judge-worker

# Or via deploy script
./deploy-docker.sh --no-worker
```

### Dedicated workers (scale-out)

Deploy workers to separate machines using `docker-compose.worker.yml`:

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

> **App-instance scaling note:** judge workers can scale horizontally. The
> Next.js app now supports two realtime modes for the routes that previously
> required a single instance:
> - **process-local mode** — declare `APP_INSTANCE_COUNT=1` (or
>   `REALTIME_SINGLE_INSTANCE_ACK=1`) and keep the web tier single-instance
> - **shared PostgreSQL mode** — set `REALTIME_COORDINATION_BACKEND=postgresql`
>   so SSE connection-cap enforcement and anti-cheat heartbeat deduplication use
>   the database instead of process-local memory
>
> `redis` remains unsupported. Before claiming exam-grade or public-contest
> readiness, still validate sticky-session / load-balancer behavior and broader
> realtime scaling under the PostgreSQL-backed path.

### Prerequisites

- **Docker socket proxy**: The deployment uses a dedicated `docker-proxy` service (`tecnativa/docker-socket-proxy`) as the only container with direct `/var/run/docker.sock` access. The **judge worker only** talks to Docker through `DOCKER_HOST=tcp://docker-proxy:2375`; the Next.js app uses the worker’s authenticated internal API instead of direct daemon access.
- **`/judge-workspaces`**: Must exist on the host before starting the stack — used as the shared workspace volume between the judge worker and sibling judge containers.
- **`COMPILER_RUNNER_URL`**: Set to `http://judge-worker:3001` in the app container to delegate interactive code execution to the Rust runner. When a runner URL is configured, local Docker fallback is now disabled by default; set `ENABLE_COMPILER_LOCAL_FALLBACK=1` only for explicit development/debug scenarios.
- **Output-only languages**: `plaintext`, `verilog`, `systemverilog`, and
  `vhdl` run through the shared `judge-node` image. HDL support here is
  intentionally limited to literal output statements (`$display`/`$write`/`$strobe`
  for Verilog/SystemVerilog and `report` for VHDL), not full simulation.
- **`TRUSTED_DOCKER_REGISTRIES`**: Optional comma-separated allowlist for externally qualified image references (for example `ghcr.io/your-org/,registry.example.com/`). Unqualified local images such as `judge-python:latest` remain allowed.
- The `deploy-docker.sh` script handles setup automatically (server-side builds, architecture detection, nginx config). See [Deployment Guide](docs/deployment.md).

## Platform Modes

Four platform modes control what users see and can access. Switch modes from **Settings > General**.

| | Homework | Exam | Contest | Recruiting |
|---|---|---|---|---|
| **Use case** | Coursework, practice, low-stakes work | Proctored tests and exams | Competitive programming events | Candidate coding evaluations |
| **AI code review** | Enabled by default | Disabled by default | Disabled by default | Disabled by default |
| **Standalone compiler** | Available | Blocked | Available | Blocked |
| **Contests page** | Visible | Visible | Visible | Hidden* |
| **Rankings page** | Visible | Visible | Visible | Hidden* |
| **Groups page** | Visible | Visible | Visible | Hidden* |
| **Problem Sets page** | Visible | Visible | Visible | Hidden (all users) |
| **Dashboard** | Student dashboard | Student dashboard | Student dashboard | Candidate dashboard |
| **"Problems" label** | Problems | Problems | Problems | Challenges |
| **"Submissions" label** | Submissions | Submissions | Submissions | Attempts |

\* Hidden for non-admin/non-instructor users only.

Default: `homework`. Change in admin settings or directly in the database (`system_settings.platform_mode`).

## Documentation

- [API Reference](docs/api.md) — all REST endpoints, authentication, request/response formats
- [Deployment Guide](docs/deployment.md) — provisioning, deploy scripts, nginx, post-deploy checks
- [Monitoring & Alerting](docs/monitoring.md) — health surfaces, metrics, and minimum operator alerting guidance
- [Authentication](docs/authentication.md) — sign-in flow, cookie architecture, API smoke test
- [Admin Security Operations](docs/admin-security-operations.md) — lockout policy, MFA/SSO integration guidance, and dependency scanning baseline
- [Languages](docs/languages.md) — all 124 variants, Docker image presets, admin management
- [Judge Workers](docs/judge-workers.md) — multi-worker architecture, registration, deployment
- [Privacy & Retention](docs/privacy-retention.md) — current retention windows and handling rules for sensitive operational data
- [High-Stakes Operations](docs/high-stakes-operations.md) — operational truth and launch checks for recruiting, exams, and serious contests
- [Exam Integrity Model](docs/exam-integrity-model.md) — what the current anti-cheat telemetry does and does not prove
- [Judge Worker Incident Runbook](docs/judge-worker-incident-runbook.md) — operational response guide for the privileged worker boundary
- [Operator Incident Runbook](docs/operator-incident-runbook.md) — containment and recovery checklist for backup/restore failures and credential leaks
- [High-Stakes Validation Matrix](docs/high-stakes-validation-matrix.md) — required evidence before changing exam/public-contest GO/NO-GO decisions

## License

Apache-2.0
