import { NextResponse } from "next/server";
import { isOidcEnabled } from "@/lib/oidc/config";
import { oidcDisabled } from "@/lib/oidc/http";
import { getOidcPublicJwk } from "@/lib/oidc/tokens";

export const runtime = "nodejs";

export async function GET() {
  if (!isOidcEnabled()) return oidcDisabled();
  return NextResponse.json(
    { keys: [await getOidcPublicJwk()] },
    { headers: { "Cache-Control": "public, max-age=300, must-revalidate" } },
  );
}
