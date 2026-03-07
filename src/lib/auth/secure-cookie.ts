import type { NextRequest } from "next/server";

export function shouldUseSecureAuthCookie(
  request: Pick<NextRequest, "headers" | "nextUrl">
) {
  const forwardedSsl = request.headers
    .get("x-forwarded-ssl")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const forwardedPort = request.headers
    .get("x-forwarded-port")
    ?.split(",")[0]
    ?.trim();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();

  if (forwardedSsl) {
    return forwardedSsl === "on";
  }

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  if (forwardedPort) {
    return forwardedPort === "443";
  }

  if (request.nextUrl.protocol === "https:") {
    return true;
  }

  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  return Boolean(forwardedHost) && typeof authUrl === "string" && authUrl.startsWith("https://");
}
