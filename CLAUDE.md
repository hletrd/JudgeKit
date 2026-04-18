# Project Rules

## Deployment: Preserve Production config.ts

When deploying, **always use the current `src/lib/auth/config.ts`** as-is. Do NOT revert, overwrite, or regenerate this file from a previous version. The current version contains production-specific logging that must be preserved during deployment.

## Deployment: algo.xylolabs.com Server Architecture

- **algo.xylolabs.com** is the app server: Next.js app, PostgreSQL DB, Nginx only. Do NOT build judge/worker images on this server.
- **worker-0.algo.xylolabs.com** is the dedicated judge worker. Judge images and language images must be built there, not on the app server.
- When deploying to algo.xylolabs.com, always use `SKIP_LANGUAGES=true`, `BUILD_WORKER_IMAGE=false`, `INCLUDE_WORKER=false`.
- Never run `docker system prune --volumes` on any production server (destroys DB data).

## Typography: Korean Letter Spacing

- Keep Korean text at the browser/font default letter spacing. Do **not** apply custom `letter-spacing` (or `tracking-*` Tailwind utilities) to Korean content.
- This applies to all markup rendering Korean characters (components, inline styles, CSS modules, Tailwind classes, globals.css, and locale-specific stylesheets).
- If a design spec asks for tighter/looser spacing, confirm the change is intended for Korean glyphs before overriding the default; Latin-only tracking utilities must not be applied globally to text that may contain Korean.
