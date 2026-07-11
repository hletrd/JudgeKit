import { NextRequest } from "next/server";
import { getActiveAuthUserById } from "@/lib/api/auth";
import { isOidcEnabled } from "@/lib/oidc/config";
import { oidcDisabled, oidcError, oidcJson } from "@/lib/oidc/http";
import { verifyOidcAccessToken } from "@/lib/oidc/tokens";

export const runtime = "nodejs";

async function handleUserInfo(request: NextRequest) {
  if (!isOidcEnabled()) return oidcDisabled();

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) {
    return oidcError("invalid_token", "A bearer access token is required.", 401, {
      "WWW-Authenticate": 'Bearer realm="JudgeKit OIDC"',
    });
  }

  try {
    const payload = await verifyOidcAccessToken(match[1]);
    const user = await getActiveAuthUserById(payload.sub, payload.iat);
    if (!user || user.mustChangePassword) throw new Error("Inactive user");

    const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
    const claims: Record<string, string> = { sub: user.id };
    if (scopes.includes("profile")) {
      claims.preferred_username = user.username;
      claims.name = user.name;
      claims.role = user.role;
      if (user.className) claims.class_name = user.className;
    }
    if (scopes.includes("email") && user.email) claims.email = user.email;
    return oidcJson(claims);
  } catch {
    return oidcError("invalid_token", "The bearer access token is invalid or expired.", 401, {
      "WWW-Authenticate": 'Bearer realm="JudgeKit OIDC", error="invalid_token"',
    });
  }
}

export const GET = handleUserInfo;
export const POST = handleUserInfo;
