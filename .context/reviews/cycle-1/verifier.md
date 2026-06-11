# Verifier — Evidence-Based Correctness — Cycle 1 (2026-05-29)

Each claim verified by reading the cited code; gate results recorded.

## Gate evidence
- `npm run lint`: PASS — 0 errors, 1 warning (unused `canManageContest` import,
  anti-cheat/route.ts:12). Captured live this cycle.

## Verified claims

### VER-C1-1 — SMTP decrypt WILL throw in production on plaintext input [CONFIRMED / High]
Chain verified by reading source:
1. `encryption.ts:99-100`: `allowPlaintext = options?.allowPlaintextFallback ?? (NODE_ENV !== "production")`.
   In production with no option → `false`.
2. `encryption.ts:102-108`: when input lacks `enc:` and `allowPlaintext` is false → `throw`.
3. `smtp.ts:47`: `decrypt(raw.smtpPass as string)` passes NO option.
   ⇒ A non-`enc:` `smtpPass` throws in production. CONFIRMED.
Contrast `hcaptcha.ts:23` passes `{ allowPlaintextFallback: true }`. Inconsistent.

### VER-C1-2 — SMTP password masking does NOT clobber the stored secret [CONFIRMED-SAFE / High]
`system-settings-form.tsx:169`: `...(smtpPass !== initialSmtpPassMasked ? { smtpPass } : {})`
and `page.tsx:135`: masked placeholder is `"••••••••"` only when a value is stored.
⇒ Submitting without changing the password omits `smtpPass`, and
`updateSystemSettings` only writes keys present via `hasOwnInput` (system-settings.ts:173).
The stored secret is preserved. CONFIRMED safe.

### VER-C1-3 — Email HTML bodies escape all interpolated values [CONFIRMED / High]
`templates.ts`: every `${...}` in an `html` string uses an `escapeHtml`-wrapped local
(`url`, `name`, `title`, `eventType`, `details`). `text` bodies use raw values (correct —
plaintext). Subjects use raw values (see SEC-C1-2, low risk). CONFIRMED.

### VER-C1-4 — `canManageContest` import is unused [CONFIRMED / High]
Full read of anti-cheat/route.ts: GET uses `canMonitorContest`, POST uses inline
`rawQueryOne` access check; `canManageContest` never invoked. CONFIRMED dead import.
