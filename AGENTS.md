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
- **Judge:** Docker containers (C/C++ via GCC 14, Python 3.14)

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

## Database Conventions

- All IDs are `nanoid()` generated text primary keys
- Timestamps stored as integer (Unix ms via `Date.now()`)
- Boolean fields use integer (0/1)
- Foreign keys enforced via `PRAGMA foreign_keys = ON`
- WAL mode enabled for concurrent reads

## Auth & Permissions

- Roles: `super_admin` > `admin` > `instructor` > `student`
- Session includes `user.id` and `user.role`
- Use `assertRole()`, `assertGroupAccess()`, `canAccessProblem()` from `@/lib/auth/permissions`
- All dashboard routes are protected via middleware

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
  - Seccomp profile applied
  - Read-only rootfs, non-root user
  - Per-test-case timeout enforcement
- **Compile options are admin-customizable** — stored in DB per language, editable from admin panel
  - Default compiler flags (e.g., `-O2 -std=c++17`)
  - Additional allowed/disallowed flags
  - Configurable time/memory limits per problem

## REST API (v1)

All API endpoints under `/api/v1/`. Auth via JWT Bearer token. Responses: `{ data: ... }` or `{ error: "..." }`.

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
| `src/lib/auth/permissions.ts` | Role & access control helpers |
| `src/types/index.ts` | Shared TypeScript types |
| `drizzle.config.ts` | Drizzle Kit configuration |
| `scripts/seed.ts` | Database seeder (creates super_admin) |
