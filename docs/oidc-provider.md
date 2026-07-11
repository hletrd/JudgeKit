# OpenID Connect provider

JudgeKit can provide single sign-on to one trusted first-party application. The implementation supports the Authorization Code flow with mandatory S256 PKCE. It does not share JudgeKit cookies with another subdomain.

## Endpoints

| Purpose | Endpoint |
| --- | --- |
| Discovery | `/.well-known/openid-configuration` |
| OAuth metadata | `/.well-known/oauth-authorization-server` |
| Authorization | `/api/oidc/authorize` |
| Token | `/api/oidc/token` |
| User information | `/api/oidc/userinfo` |
| Public signing keys | `/api/oidc/jwks` |

The provider supports `openid`, `profile`, and `email`. `profile` also returns the JudgeKit-specific `role` and `class_name` claims. The subject claim is the stable JudgeKit user ID.

## Configuration

OIDC remains disabled unless `OIDC_ENABLED=1`. Configure the following values in the runtime environment:

```dotenv
OIDC_ENABLED=1
OIDC_ISSUER=https://oj.auraedu.me
OIDC_CLIENT_ID=info-course-portal
OIDC_CLIENT_SECRET=<independent random secret of at least 32 characters>
OIDC_CLIENT_REDIRECT_URIS=["https://info.auraedu.me/api/auth/callback/judgekit"]
OIDC_SIGNING_PRIVATE_KEY_B64=<base64-encoded PKCS#8 RSA private key>
OIDC_SIGNING_KEY_ID=judgekit-2026-01
```

Generate an independent RSA signing key as follows. Store `oidc-private.pem` outside the repository and secret-management logs.

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out oidc-private.pem
base64 < oidc-private.pem | tr -d '\n'
```

JudgeKit validates this configuration at startup. Production issuers and redirect URIs must use HTTPS. Redirect URIs are compared as exact strings; wildcards are not supported.

## Token behavior

- Authorization codes expire after five minutes, are stored only as SHA-256 hashes, and can be consumed once.
- ID tokens use RS256 and expire after five minutes.
- Access tokens use RS256 and expire after ten minutes.
- `userinfo` reloads the user from the database. A disabled account or `tokenInvalidatedAt` change invalidates access immediately.
- Token and error responses carry `Cache-Control: no-store`.

After enabling the provider, verify discovery and confirm that the portal uses these values:

```dotenv
AUTH_JUDGEKIT_ISSUER=https://oj.auraedu.me
AUTH_JUDGEKIT_CLIENT_ID=info-course-portal
AUTH_JUDGEKIT_CLIENT_SECRET=<same client secret>
AUTH_JUDGEKIT_REDIRECT_URI=https://info.auraedu.me/api/auth/callback/judgekit
```
