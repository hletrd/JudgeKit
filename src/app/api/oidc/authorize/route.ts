import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findSessionUser } from "@/lib/auth/find-session-user";
import { recordAuditEvent } from "@/lib/audit/events";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";
import { getDbNowUncached } from "@/lib/db-time";
import { issueAuthorizationCode } from "@/lib/oidc/authorization-code-store";
import { getOidcClient, isOidcEnabled } from "@/lib/oidc/config";
import { oidcDisabled, oidcError } from "@/lib/oidc/http";
import {
  createAuthorizationErrorRedirect,
  validateAuthorizationRequest,
} from "@/lib/oidc/protocol";

export const runtime = "nodejs";

function redirectError(redirectUri: string, code: string, description: string, state?: string | null) {
  return NextResponse.redirect(createAuthorizationErrorRedirect(redirectUri, code, description, state), 302);
}

function loginRedirect(request: NextRequest, forceReauthentication: boolean) {
  const callback = new URL(request.nextUrl.pathname + request.nextUrl.search, request.nextUrl.origin);
  if (forceReauthentication) callback.searchParams.delete("prompt");
  const login = new URL("/login", request.nextUrl.origin);
  login.searchParams.set("callbackUrl", callback.pathname + callback.search);
  return NextResponse.redirect(login, 302);
}

export async function GET(request: NextRequest) {
  if (!isOidcEnabled()) return oidcDisabled();

  const validation = validateAuthorizationRequest(request.nextUrl.searchParams, getOidcClient());
  if (!validation.ok) {
    const { error, description, redirectUri, state } = validation.error;
    return redirectUri
      ? redirectError(redirectUri, error, description, state)
      : oidcError(error, description);
  }

  const authorization = validation.value;
  const session = await auth();

  if (authorization.prompt === "login") {
    return loginRedirect(request, true);
  }
  if (!session?.user) {
    return authorization.prompt === "none"
      ? redirectError(
          authorization.redirectUri,
          "login_required",
          "The user is not signed in.",
          authorization.state,
        )
      : loginRedirect(request, false);
  }

  const user = await findSessionUser(session);
  if (!user?.isActive || user.mustChangePassword) {
    return redirectError(
      authorization.redirectUri,
      "access_denied",
      "The account is not permitted to authorize this client.",
      authorization.state,
    );
  }

  // Rate-limit code ISSUANCE per user: every successful GET inserts an
  // authorization-code row, and this is the only unmetered DB-write path in
  // the provider (the token endpoint already counts attempts). Anonymous
  // requests redirect to login above without writing, so they stay unmetered.
  const rateLimitResponse = await consumeUserApiRateLimit(request, user.id, "oidc:authorize");
  if (rateLimitResponse) return rateLimitResponse;

  const now = await getDbNowUncached();
  const code = await issueAuthorizationCode({
    clientId: authorization.clientId,
    userId: user.id,
    redirectUri: authorization.redirectUri,
    scope: authorization.scope,
    codeChallenge: authorization.codeChallenge,
    nonce: authorization.nonce,
    now,
  });

  recordAuditEvent({
    actorId: user.id,
    actorRole: user.role,
    action: "oidc.authorization_code_issued",
    resourceType: "oidc_client",
    resourceId: authorization.clientId,
    summary: "OIDC authorization code issued",
    details: { scope: authorization.scope },
    request,
  });

  const redirect = new URL(authorization.redirectUri);
  redirect.searchParams.set("code", code);
  if (authorization.state) redirect.searchParams.set("state", authorization.state);
  return NextResponse.redirect(redirect, 302);
}
