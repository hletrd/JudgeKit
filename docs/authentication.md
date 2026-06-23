# Authentication

## Sign-in

- Credentials sign-in accepts either username or email; the seeded admin uses username `admin`.
- Protected-route login preserves `callbackUrl` — logging in from a deep link returns the user to the original destination (unless forced password-change overrides it).

## Architecture

- Next.js 16 route protection lives in `src/proxy.ts`, not `src/middleware.ts`.
- HTTPS deployments behind a reverse proxy must preserve the original scheme. Auth.js JWT readers rely on `src/lib/auth/secure-cookie.ts` for the correct secure cookie name.
- Protected `/api/v1/*` routes accept the Auth.js session cookie (JWT-backed)
  for browser clients. Programmatic clients can use JudgeKit API keys via
  `Authorization: Bearer jk_...`; API-key requests skip the API-route CSRF
  header. Judge worker endpoints use separate worker tokens.
- The session token (JWT) carries only core identity and security fields: `id`, `username`, `email`, `name`, `className`, `role`, `mustChangePassword`, plus `authenticatedAt`/`uaHash`. User editor/UI **preferences are not stored in the token** — they are read on demand from the database via `getUserPreferences()` (`src/lib/user-preferences.ts`, React-cached per request), so the cookie stays small and preference changes take effect without a token refresh.
- Token revocation is enforced by comparing the token's `authenticatedAt` against the user's `tokenInvalidatedAt`. Both the Auth.js `jwt` callback and `src/proxy.ts` re-validate the user against the DB (the proxy lookup is briefly cached).

## Password policy

- Enforced by `getPasswordValidationError()` in `src/lib/security/password.ts`.
- Rules: a minimum length (default 12, overridable via `system_settings.min_password_length`, range 4–128) **and** a check that the password does not contain the account's own username or email — case-insensitive, including the email local-part. There are no character-class complexity rules and no common-password blocklist; identity context is passed in at every password-setting flow (signup, change-password, recruiting redemption, admin create/update, bulk import).

## Remote API Smoke Test

For external scripts, log in through the credentials callback first and persist the session cookie:

```bash
export OJ_BASE_URL="https://your-domain.example"
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
  "$OJ_BASE_URL/api/v1/problems?limit=5" | python3 -m json.tool

rm -f "$COOKIE_JAR"
```
