import { NextResponse } from "next/server";
import { getOidcIssuer, isOidcEnabled } from "@/lib/oidc/config";
import { oidcDisabled } from "@/lib/oidc/http";

export const runtime = "nodejs";

export function GET() {
  if (!isOidcEnabled()) return oidcDisabled();
  const issuer = getOidcIssuer();
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/oidc/authorize`,
      token_endpoint: `${issuer}/api/oidc/token`,
      userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
      jwks_uri: `${issuer}/api/oidc/jwks`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email"],
      claims_supported: ["sub", "preferred_username", "name", "email", "role", "class_name"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    },
    { headers: { "Cache-Control": "public, max-age=300, must-revalidate" } },
  );
}
