# Online Judge — Agent Instructions

## Project Overview

An online judge system for student programming assignments. Built with Next.js 16, TypeScript, SQLite (Drizzle ORM), Docker sandboxing, Auth.js v5, and shadcn/ui.

## Tech Stack

- **Framework:** Next.js 16 (App Router, `src/` directory)
- **Language:** TypeScript (strict mode)
- **Database:** SQLite via `better-sqlite3` + Drizzle ORM (WAL mode)
- **Auth:** Auth.js v5 (Credentials provider, JWT sessions)
- **i18n:** next-intl (English default, Korean)
- **UI:** Tailwind CSS v4, shadcn/ui components, Lucide icons
- **Validation:** Zod
- **Judge:** Docker containers (C/C++ via GCC, Python 3.14.3, Node.js 24.14.0 / TypeScript 5.9.3, Rust 1.94.0, Go 1.26.1, Swift 6.2.4)

## Project Structure

```
online-judge/
├── docker/                  # Judge Docker images & seccomp
├── judge-worker/            # Separate Node.js judge process
├── scripts/                 # Seed scripts, utilities
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login, register pages
│   │   ├── (dashboard)/     # Protected dashboard routes
│   │   └── api/             # API routes (auth, judge)
│   ├── lib/
│   │   ├── db/              # Schema, relations, DB connection
│   │   ├── auth/            # Auth config, permissions
│   │   ├── actions/         # Server actions
│   │   ├── system-settings.ts # Resolved global site identity settings
│   │   └── validators/      # Zod schemas
│   ├── components/
│   │   ├── ui/              # shadcn/ui primitives
│   │   └── layout/          # App sidebar, topbar
│   └── types/               # TypeScript type definitions
├── data/                    # SQLite DB files (gitignored)
└── drizzle/                 # Generated migrations
```

## Git Rules (MANDATORY)

1. **Always GPG sign commits** — use `git commit -S -m "message"`
2. **Always commit and push** after every iteration, enhancement, or fix — do not batch changes
3. **Fine-grained commits** — one commit per single feature, fix, or enhancement; never bundle unrelated changes
4. **Always `git pull --rebase`** before `git push`
5. **Semantic commit messages** with [Conventional Commits](https://www.conventionalcommits.org/) format:
   - Format: `<type>(<scope>): <gitmoji> <description>`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   - Scope is optional but encouraged
   - Use imperative mood, keep header under 72 characters
   - Examples:
     - `feat(auth): ✨ add OAuth2 login flow`
     - `fix(api): 🐛 resolve null pointer in response handler`
     - `docs(readme): 📝 update installation instructions`
     - `refactor(db): ♻️ normalize schema relations`
6. **Always use gitmoji** — place after scope colon, before description
7. **Never use `Co-Authored-By`** lines in commits
8. **Never amend published commits** or force-push without explicit user approval

## Verification & Deployment Rules

- For every code change, always run a local production build check with `npm run build`
- For every UI, route, or page-affecting change, always verify the affected page locally before finishing the work
- Treat work as incomplete until the local build and local page verification both pass
- After verified code changes, always deploy the updated app to the remote server and confirm the deployed page or flow there
- When managed judge languages or toolchain versions change, run `npm run languages:sync` on existing deployments after `npm run db:push`

## Database Conventions

- All IDs are `nanoid()` generated text primary keys
- Timestamps stored as integer (Unix ms via `Date.now()`)
- Boolean fields use integer (0/1)
- Foreign keys enforced via `PRAGMA foreign_keys = ON`
- WAL mode enabled for concurrent reads
- Global site identity overrides live in the single-row `system_settings` table (`id = "global"`)

## Auth & Permissions

- Roles: `super_admin` > `admin` > `instructor` > `student`
- Credentials sign-in accepts either username or email
- Session includes `user.id`, `user.role`, and `user.username`
- Use `assertRole()`, `assertGroupAccess()`, `canAccessProblem()` from `@/lib/auth/permissions`
- All dashboard routes are protected via `src/proxy.ts`
- Any `getToken()` usage that must work on HTTPS or behind a reverse proxy should use `shouldUseSecureAuthCookie()` from `@/lib/auth/secure-cookie`
- The seeded `super_admin` account is `admin` / `admin@example.com` with password `admin123`
- Seeded and admin-created users may be forced through `/change-password` on first login
- Site title/description overrides from `system_settings` are resolved server-side and applied to login, dashboard chrome, and page metadata

## Admin Settings

- `/dashboard/admin/settings` is restricted to `admin` and `super_admin`
- `src/lib/actions/system-settings.ts` updates global site title/description overrides
- Blank settings should fall back to the localized defaults from `messages/en.json` and `messages/ko.json`
- Revalidation for system settings should cover `/`, `/login`, `/dashboard`, and `/dashboard/admin/settings`

## Code Style

- Use `@/` import alias for all project imports
- Server Components by default; `"use client"` only when needed
- Server Actions for mutations (in `src/lib/actions/`)
- Zod validation on all user inputs
- No `any` types — use proper TypeScript types from `@/types`

## Judge System

- Submissions are **queued** — status transitions: `pending` → `queued` → `judging` → final verdict
- Judge worker picks up `queued` submissions atomically (prevents double-judging)
- Execution happens in **ephemeral Docker containers** with:
  - No network access
  - Memory/CPU limits enforced
  - Custom seccomp profile when compatible; otherwise the worker can fall back to Docker's default seccomp, and the demo host currently sets `JUDGE_DISABLE_CUSTOM_SECCOMP=1`
  - Read-only rootfs, non-root user
  - Per-test-case timeout enforcement
- **Compile options are admin-customizable** — stored in DB per language, editable from admin panel
  - Default compiler flags (e.g., `-O2 -std=c++17`)
  - Additional allowed/disallowed flags
  - Configurable time/memory limits per problem
- Problem test cases are editable from the dashboard create/edit flow, but they should stay locked once submissions already exist to preserve historical `submission_results`

## REST API (v1)

All API endpoints live under `/api/v1/`. Protected user-facing routes authenticate through the Auth.js credentials flow plus the session cookie (JWT-backed session strategy), `GET /api/v1/languages` is public, and `GET`/`POST /api/v1/judge/poll` use the separate judge bearer token. Responses: `{ data: ... }` or `{ error: "..." }`.

| Endpoint | Methods | Auth | Description |
|----------|---------|------|-------------|
| `/api/v1/problems` | GET, POST | User / Instructor+ | List/create problems |
| `/api/v1/problems/[id]` | GET, PATCH, DELETE | User / Author+Admin | Problem CRUD |
| `/api/v1/submissions` | GET, POST | User | List own / submit code |
| `/api/v1/submissions/[id]` | GET | User (own) / Admin | Submission detail with results |
| `/api/v1/groups` | GET, POST | User / Instructor+ | List/create groups |
| `/api/v1/groups/[id]` | GET, PATCH, DELETE | Member / Admin | Group CRUD |
| `/api/v1/users` | GET, POST | Admin | List/create users |
| `/api/v1/users/[id]` | GET, PATCH, DELETE | Admin / Self | User CRUD |
| `/api/v1/languages` | GET | Public | List enabled languages |
| `/api/v1/judge/poll` | GET, POST | Judge token | Poll/report submissions |

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | All Drizzle table definitions |
| `src/lib/db/index.ts` | DB connection singleton |
| `src/lib/auth/index.ts` | Auth.js exports (handlers, auth, signIn, signOut) |
| `src/lib/auth/secure-cookie.ts` | Shared HTTPS/reverse-proxy secure cookie detection for Auth.js token readers |
| `src/lib/auth/permissions.ts` | Role & access control helpers |
| `src/lib/system-settings.ts` | Resolves global site title/description overrides with localized fallbacks |
| `src/lib/actions/system-settings.ts` | Server action for updating admin-managed site identity settings |
| `src/proxy.ts` | Next.js 16 route guard for login, dashboard access, and forced password changes |
| `src/types/index.ts` | Shared TypeScript types |
| `drizzle.config.ts` | Drizzle Kit configuration |
| `scripts/seed.ts` | Database seeder (creates super_admin) |

## Operational Notes

- For demo or production resets, the SQLite files to purge are `data/judge.db`, `data/judge.db-shm`, and `data/judge.db-wal`; reseed with `npm run db:push && npm run seed`
- Do not assume `oj-demo.atik.kr` shares the same SSH target as `atik.kr`; verify the DNS target or deployment host before making destructive changes
- As of 2026-03-07, the demo host at `oj-demo.atik.kr` runs the web app from `/home/ubuntu/online-judge` via `online-judge.service` and the worker via `online-judge-worker.service`
- As of 2026-03-07, the demo host must keep `JUDGE_POLL_URL=http://localhost:3000/api/v1/judge/poll`; the previous `/api/judge/poll` path breaks grading
- As of 2026-03-07, the demo host also sets `JUDGE_DISABLE_CUSTOM_SECCOMP=1` because Docker 28.2.2 on Ubuntu 24.04 / kernel 6.17 rejects the repository seccomp profile during container init
- As of 2026-03-07, the demo host also contains six instructor-owned private smoke-test problems created through `/api/v1/problems`: `두 수의 합 (A+B)`, `두 수의 차 (A-B)`, `두 수의 곱 (A*B)`, `세 수의 합`, `두 수 중 큰 수`, and `절댓값 구하기`
