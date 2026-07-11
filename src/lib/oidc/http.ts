import { NextResponse } from "next/server";

export const OIDC_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

export function oidcJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(OIDC_NO_STORE_HEADERS)) headers.set(name, value);
  return NextResponse.json(body, { ...init, headers });
}

export function oidcError(
  error: string,
  errorDescription: string,
  status = 400,
  extraHeaders?: HeadersInit,
) {
  return oidcJson(
    { error, error_description: errorDescription },
    { status, headers: extraHeaders },
  );
}

export function oidcDisabled() {
  return oidcJson({ error: "not_found" }, { status: 404 });
}
