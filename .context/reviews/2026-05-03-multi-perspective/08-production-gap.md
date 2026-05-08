# Production Deployment Gap — Live Verification

**Date**: 2026-05-03
**Method**: `curl` against https://algo.xylolabs.com
**Purpose**: Verify which code-level fixes have been deployed to production

---

## Summary

The production instance at `algo.xylolabs.com` is **significantly behind** the current `main` branch. Multiple CRITICAL and HIGH fixes committed in the last 2 weeks have **not been deployed**. This means the production instance still has the vulnerabilities that the codebase has already fixed.

---

## Verified against production

| Check | Expected (code) | Actual (production) | Status |
|---|---|---|---|
| `/rankings` excludes staff | No admin/super_admin visible | "admin" / "Super Admin" still visible | **NOT DEPLOYED** |
| `/practice/problems/999999` returns 404 | HTTP 404 status | HTTP 200 (soft 404) | **NOT DEPLOYED** |
| `/api/metrics` no CRON_SECRET leak | 401 Unauthorized | `{"error":"CRON_SECRET not configured"}` | **NOT DEPLOYED** |
| `/privacy` page | HTTP 200 | HTTP 404 | **NOT DEPLOYED** |
| CSP headers | Per-request nonces | Nonces present | **DEPLOYED** |
| HSTS | max-age=31536000 | Present | **DEPLOYED** |
| X-Content-Type-Options | nosniff | Present | **DEPLOYED** |
| X-Frame-Options | DENY | Present | **DEPLOYED** |
| No X-Powered-By | Absent | Absent | **DEPLOYED** |

---

## Production-exposed vulnerabilities (not yet fixed in prod)

These are fixed in code but **still exploitable on the live production instance**:

1. **[CRITICAL] `/api/metrics` leaks `CRON_SECRET` env var name** — any anonymous caller sees the error message revealing the env var name. Fix: commit `d30c362b`.

2. **[HIGH] Admin username + "Super Admin" role on public `/rankings`** — anonymous internet visitors see the literal username `admin` with a "Super Admin" badge. This is a credential-stuffing magnet. Fix: commit `fd12f9f1`.

3. **[HIGH] Soft 404s return HTTP 200** — Google indexes non-existent pages as valid content. Fix: commit `09e6c035`.

4. **[MEDIUM] Privacy page missing** — `/privacy` returns 404. Fix: commit `689cf61d`.

---

## Recommended action

**Deploy the current `main` branch to production immediately.** The gap between the codebase and the live instance means that known, fixed vulnerabilities are still exploitable. A deployment should take <30 minutes with `deploy-docker.sh`.

If a full deploy is not possible right now, at minimum:
1. Set `CRON_SECRET` in `.env.production` on the server
2. Deploy the rankings fix (`fd12f9f1`) to stop leaking the admin username
3. Deploy the not-found fix (`09e6c035`) to stop soft-404s

---

## Security headers (positive findings)

The deployed instance has excellent security headers:
- **CSP**: `default-src 'self'` with per-request nonces, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
- **HSTS**: `max-age=31536000; includeSubDomains`
- **X-Content-Type-Options**: `nosniff`
- **X-Frame-Options**: `DENY`
- **No X-Powered-By** header (properly suppressed)

These are correctly configured and deployed.
