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
- **Classroom management** — Groups, enrollments, and assignments with deadlines and late penalties
- **Problem management** — Markdown descriptions, configurable time/memory limits, public/private/hidden visibility
- **Secure code execution** — Docker containers with no network, seccomp profiles, memory/CPU limits, and non-root users
- **Multi-language support** — C, C++, and Python with admin-customizable compile options
- **Real-time judging** — Queue-based submission processing with per-test-case results

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
| Email | `admin@example.com` |
| Password | `admin123` |
| Role | `super_admin` |

> **Note:** Change the default password immediately in production.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite + Drizzle ORM |
| Auth | Auth.js v5 (Credentials) |
| UI | Tailwind CSS v4, shadcn/ui |
| Code Editor | Monaco Editor |
| Judge | Docker (GCC 14, Python 3.14) |
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
│   │   └── auth/        # Auth config & permissions
│   ├── components/      # UI components
│   └── types/           # TypeScript types
└── data/                # SQLite database (gitignored)
```

## License

MIT
