import { NextRequest } from "next/server";
import { getActiveAuthUserById } from "@/lib/api/auth";
import { getDbNowUncached } from "@/lib/db-time";
import {
  consumeAuthorizationCode,
  findAuthorizationCode,
} from "@/lib/oidc/authorization-code-store";
import { getOidcClient, isOidcEnabled } from "@/lib/oidc/config";
import { oidcDisabled, oidcError, oidcJson } from "@/lib/oidc/http";
import { constantTimeEqual, verifyPkce } from "@/lib/oidc/protocol";
import { createOidcTokenResponse } from "@/lib/oidc/tokens";
import {
  clearRateLimitMulti,
  consumeRateLimitAttemptMulti,
  getRateLimitKey,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const MAX_TOKEN_REQUEST_BYTES = 16_384;

function decodeBasicPart(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function parseBasicCredentials(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    const id = decodeBasicPart(decoded.slice(0, separator));
    const secret = decodeBasicPart(decoded.slice(separator + 1));
    return id !== null && secret !== null ? { id, secret } : null;
  } catch {
    return null;
  }
}

function getSingle(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : null;
}

export async function POST(request: NextRequest) {
  if (!isOidcEnabled()) return oidcDisabled();

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (contentType !== "application/x-www-form-urlencoded") {
    return oidcError("invalid_request", "The token endpoint requires form-encoded input.");
  }
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TOKEN_REQUEST_BYTES) {
    return oidcError("invalid_request", "The token request is too large.", 413);
  }

  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_TOKEN_REQUEST_BYTES) {
    return oidcError("invalid_request", "The token request is too large.", 413);
  }
  const params = new URLSearchParams(body);
  const client = getOidcClient();
  const rateLimitKeys = [getRateLimitKey("oidc-token", request.headers)];
  if (await consumeRateLimitAttemptMulti(...rateLimitKeys)) {
    return oidcError("temporarily_unavailable", "Too many token requests.", 429, { "Retry-After": "60" });
  }

  const authorizationHeader = request.headers.get("authorization");
  const basic = parseBasicCredentials(authorizationHeader);
  const bodyClientId = getSingle(params, "client_id");
  const bodyClientSecret = getSingle(params, "client_secret");
  if (
    (authorizationHeader && !basic) ||
    (basic && (bodyClientId !== null || bodyClientSecret !== null)) ||
    (!basic && (!bodyClientId || !bodyClientSecret))
  ) {
    return oidcError("invalid_client", "Exactly one client authentication method is required.", 401, {
      "WWW-Authenticate": 'Basic realm="JudgeKit OIDC"',
    });
  }

  const credentials = basic ?? { id: bodyClientId ?? "", secret: bodyClientSecret ?? "" };
  if (!constantTimeEqual(credentials.id, client.id) || !constantTimeEqual(credentials.secret, client.secret)) {
    return oidcError("invalid_client", "Client authentication failed.", 401, {
      "WWW-Authenticate": 'Basic realm="JudgeKit OIDC"',
    });
  }

  if (getSingle(params, "grant_type") !== "authorization_code") {
    return oidcError("unsupported_grant_type", "Only authorization_code is supported.");
  }

  const code = getSingle(params, "code");
  const redirectUri = getSingle(params, "redirect_uri");
  const verifier = getSingle(params, "code_verifier");
  if (!code || code.length > 512 || !redirectUri || !verifier) {
    return oidcError("invalid_grant", "The authorization grant is incomplete.");
  }

  const stored = await findAuthorizationCode(code);
  const now = await getDbNowUncached();
  if (
    !stored ||
    stored.clientId !== client.id ||
    stored.redirectUri !== redirectUri ||
    stored.consumedAt ||
    stored.expiresAt.getTime() <= now.getTime() ||
    !verifyPkce(verifier, stored.codeChallenge)
  ) {
    return oidcError("invalid_grant", "The authorization code is invalid, expired, or already used.");
  }

  const user = await getActiveAuthUserById(stored.userId);
  if (!user || user.mustChangePassword) {
    return oidcError("invalid_grant", "The resource owner account is no longer available.");
  }
  if (!(await consumeAuthorizationCode(stored.id, now))) {
    return oidcError("invalid_grant", "The authorization code is invalid, expired, or already used.");
  }

  const tokenResponse = await createOidcTokenResponse({
    user,
    scope: stored.scope,
    nonce: stored.nonce,
    now,
  });
  await clearRateLimitMulti(...rateLimitKeys);
  return oidcJson(tokenResponse);
}
