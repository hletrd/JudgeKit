<p align="center">
  <img src="src/app/icon.svg" alt="Online Judge" width="96" height="96" />
</p>

<h1 align="center">Online Judge</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-Drizzle_ORM-green?logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Docker-Sandboxed-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/Auth.js-v5-purple?logo=auth0" alt="Auth.js" />
</p>

<p align="center">
  A secure online judge system for student programming assignments.<br/>
  Automated code evaluation with Docker-sandboxed execution for C, C++, and Python.
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#tech-stack">Tech Stack</a> &middot;
  <a href="#project-structure">Project Structure</a>
</p>

---

## Features

- **Role-based access** — Super admin, admin, instructor, and student roles with granular permissions
- **Configurable site identity** — Admins can override the site title and description shown in metadata, the login screen, and dashboard chrome
- **Classroom management** — Groups, enrollments, and assignments with deadlines and late penalties
- **Problem management** — Sanitized descriptions, configurable time/memory limits, public/private/hidden visibility, and test-case editing before submissions exist
- **Secure code execution** — Docker containers with no network, seccomp profiles, memory/CPU limits, and non-root users
- **Multi-language support** — C, C++, and Python with admin-customizable compile options
- **Submission workflow** — JSON submission flow, live status polling, per-test-case results, and paginated submission history

## Current Status

- Phase 0 remediation is complete: submission flow works, the judge worker executes submissions, instructors can manage test cases during problem authoring, the problem edit page exists, and the group creation flow is wired
- High-priority Phase 1 work is also in place: dashboard `loading.tsx` / `error.tsx` / `not-found.tsx`, submission polling, paginated submissions, solved/attempted problem indicators, translated status badges, callback-aware login, sanitized problem descriptions, and admin-managed site identity settings
- Security hardening now includes login rate limiting, explicit auth/judge env validation, stronger API access checks, problem/test-case exposure fixes, and shared security headers
- As of 2026-03-07, a remote smoke test against `oj-demo.atik.kr` succeeded with instructor-authenticated `POST /api/v1/problems` calls and left six private Korean practice problems on the demo host for API verification
- Remaining roadmap items are still open: assignment CRUD, group membership management, audit logging, CI, and backup/observability work

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and set AUTH_SECRET (generate with: openssl rand -base64 32)

# Push database schema
npm run db:push

# Seed default admin user
npm run seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

### Default Admin Account

| Field | Value |
|-------|-------|
| Username | `admin` |
| Email | `admin@example.com` |
| Password | `admin123` |
| Role | `super_admin` |

> **Note:** The seeded admin is forced through `/change-password` on first login. Change the default password immediately in production.

### Local Production Run

```bash
npm run build
PORT=3000 npm run start
```

If port `3000` is already occupied, stop the stale process before restarting the production server on the same port.

## Authentication Notes

- Credentials sign-in accepts either username or email, but the seeded admin uses username `admin` by default.
- Protected-route login preserves `callbackUrl`, so logging in from a deep link should return the user to the original destination unless the forced password-change flow overrides it.
- Next.js 16 route protection now lives in `src/proxy.ts`, not `src/middleware.ts`.
- HTTPS deployments that terminate TLS at a reverse proxy must preserve the original scheme. Auth.js JWT readers in `src/proxy.ts` and `src/lib/api/auth.ts` rely on `src/lib/auth/secure-cookie.ts` to choose the correct secure cookie name.
- Normal protected `/api/v1/*` routes use the Auth.js credentials login plus the session cookie that carries the JWT-backed session rather than a standalone bearer token; the separate bearer token is reserved for `GET`/`POST /api/v1/judge/poll`.

## Remote API Smoke Test

For browser-driven or same-origin automation, the existing Auth.js session is reused automatically. For external scripts, log in through the credentials callback first and persist the session cookie in a cookie jar before calling protected user-facing `/api/v1/*` routes. The example below is read-only and safe to rerun; instructor/admin-only writes such as `POST /api/v1/problems` use the same cookie-jar flow but mutate remote state.

```bash
export OJ_BASE_URL="https://oj-demo.atik.kr"
export OJ_USERNAME="instructor"
export OJ_PASSWORD="your-password"

COOKIE_JAR="$(mktemp)"
CSRF_TOKEN="$(curl -s -c "$COOKIE_JAR" "$OJ_BASE_URL/api/auth/csrf" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrfToken"])')"

curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF_TOKEN" \
  --data-urlencode "username=$OJ_USERNAME" \
  --data-urlencode "password=$OJ_PASSWORD" \
  --data-urlencode "callbackUrl=$OJ_BASE_URL/dashboard" \
  "$OJ_BASE_URL/api/auth/callback/credentials" \
  >/dev/null

curl -s -b "$COOKIE_JAR" \
  "$OJ_BASE_URL/api/v1/problems?limit=5" \
  | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(json.dumps({"total": payload.get("total"), "titles": [item.get("title") for item in payload.get("data", [])]}, ensure_ascii=False, indent=2))'

rm -f "$COOKIE_JAR"
```

As of 2026-03-07, the demo deployment at `oj-demo.atik.kr` includes six instructor-owned private smoke-test problems with Korean titles and descriptions so you can verify the API against non-English content as well.

## System Settings

- Admins and super admins can manage site-wide title and description overrides from `/dashboard/admin/settings`.
- Settings are stored in the SQLite `system_settings` table and resolved through `src/lib/system-settings.ts`.
- The configured values flow into root metadata, the login card title, the dashboard header title, and the sidebar brand label.
- Leaving either field blank falls back to the localized defaults from `messages/en.json` and `messages/ko.json`.

## Deployment and Database Reset

- Before touching production, verify that the SSH target matches the public DNS for the environment you intend to change. `oj-demo.atik.kr` should be treated as a separate host from the main `atik.kr` box unless you confirm otherwise.
- As of 2026-03-07, the demo host runs the web app via `online-judge.service` and the judge worker via `online-judge-worker.service` from `/home/ubuntu/online-judge`.
- As of 2026-03-07, the demo host also contains six instructor-owned private smoke-test problems created through the API: `두 수의 합 (A+B)`, `두 수의 차 (A-B)`, `두 수의 곱 (A*B)`, `세 수의 합`, `두 수 중 큰 수`, and `절댓값 구하기`.
- To reset the SQLite database for a disposable or demo environment, stop the app first, remove `data/judge.db`, `data/judge.db-shm`, and `data/judge.db-wal`, then run:

```bash
npm run db:push
npm run seed
```

- Re-verify login after a reset with username `admin` and password `admin123`; the expected first destination is `/change-password`.

## Comprehensive Deployment Guide

### 1. Host prerequisites

- Ubuntu host with Docker Engine, Node.js 24, npm, and systemd
- Repo checked out at `/home/ubuntu/online-judge`
- `key.pem` available locally for SSH access
- Ports `80` and `443` terminated by nginx; app stays on port `3000`

### 2. Environment configuration

Start from `.env.example` and set at least:

```bash
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://oj-demo.atik.kr
JUDGE_AUTH_TOKEN=<openssl rand -hex 32>
JUDGE_POLL_URL=http://localhost:3000/api/v1/judge/poll
POLL_INTERVAL=2000
JUDGE_DISABLE_CUSTOM_SECCOMP=0
```

- Keep `JUDGE_POLL_URL` on the internal host URL unless the worker runs on another machine
- Set `JUDGE_DISABLE_CUSTOM_SECCOMP=1` on hosts where Docker 28+/modern kernels reject the repository seccomp profile during container init; the worker now also retries once with Docker's default seccomp if the custom profile fails with the known `fsmount:fscontext:proc` error

### 3. Initial provisioning

```bash
npm install
npm run db:push
npm run seed
docker build -t judge-cpp -f docker/Dockerfile.judge-cpp .
docker build -t judge-python -f docker/Dockerfile.judge-python .
npm run build
```

### 4. Install systemd services

The web app service is host-specific, but the judge-worker unit is now versioned in the repo.

```bash
sudo ./scripts/install-online-judge-worker-service.sh
sudo systemctl restart online-judge.service
```

The worker unit file lives at `scripts/online-judge-worker.service` and expects the repo at `/home/ubuntu/online-judge` with `.env` in the same directory.

### 5. Deploy updates

```bash
git pull --rebase origin main
npm install
npm run db:push
npm run build
sudo systemctl restart online-judge.service
sudo systemctl restart online-judge-worker.service
```

If you changed the judge Dockerfiles or compiler/runtime assumptions, rebuild the images before restarting the worker.

### 6. Post-deploy verification

```bash
systemctl is-active online-judge.service
systemctl is-active online-judge-worker.service
curl -I http://127.0.0.1:3000/login
journalctl -u online-judge-worker.service -n 50 --no-pager
```

- Confirm submissions progress out of `pending`
- If you see `401 Unauthorized` in worker logs, verify `JUDGE_AUTH_TOKEN`
- If you see the `fsmount:fscontext:proc` container-init error, set `JUDGE_DISABLE_CUSTOM_SECCOMP=1` and restart `online-judge-worker.service`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite + Drizzle ORM |
| Auth | Auth.js v5 (Credentials) |
| UI | Tailwind CSS v4, shadcn/ui |
| Code Editor | Textarea today, Monaco-ready dependency installed |
| Judge | Docker on Alpine Linux (GCC toolchain, Python 3) |
| Validation | Zod |

## Project Structure

```
online-judge/
├── docker/              # Judge Docker images & seccomp profile
├── judge-worker/        # Separate judge process (polls & executes)
├── scripts/             # Seed scripts
├── src/
│   ├── app/
│   │   ├── (auth)/      # Login page
│   │   ├── (dashboard)/ # Protected dashboard routes
│   │   └── api/         # API routes
│   ├── lib/
│   │   ├── db/          # Schema, relations, connection
│   │   ├── auth/        # Auth config & permissions
│   │   └── system-settings.ts # Resolved site identity settings
│   ├── components/      # UI components
│   └── types/           # TypeScript types
└── data/                # SQLite database (gitignored)
```

## License

MIT
