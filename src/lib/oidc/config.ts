import { getPublicBaseUrl } from "@/lib/security/env";

const CLIENT_SECRET_MIN_LENGTH = 32;

export type OidcClient = {
  id: string;
  secret: string;
  redirectUris: readonly string[];
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set when OIDC is enabled.`);
  }
  return value;
}

function parseAbsoluteUrl(name: string, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not contain credentials, a query, or a fragment.`);
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const allowInsecureLoopback = process.env.OIDC_ALLOW_INSECURE_LOOPBACK === "1" && isLoopback;
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !allowInsecureLoopback) {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  return url;
}

export function isOidcEnabled() {
  return process.env.OIDC_ENABLED === "1" || process.env.OIDC_ENABLED === "true";
}

export function getOidcIssuer() {
  const raw = process.env.OIDC_ISSUER?.trim() || getPublicBaseUrl();
  const url = parseAbsoluteUrl("OIDC_ISSUER", raw);
  if (url.pathname !== "/") {
    throw new Error("OIDC_ISSUER must be an origin without a path.");
  }
  return url.origin;
}

export function getOidcClient(): OidcClient {
  const id = required("OIDC_CLIENT_ID");
  const secret = required("OIDC_CLIENT_SECRET");
  if (secret.length < CLIENT_SECRET_MIN_LENGTH) {
    throw new Error(`OIDC_CLIENT_SECRET must contain at least ${CLIENT_SECRET_MIN_LENGTH} characters.`);
  }

  let redirectUris: unknown;
  try {
    redirectUris = JSON.parse(required("OIDC_CLIENT_REDIRECT_URIS"));
  } catch {
    throw new Error("OIDC_CLIENT_REDIRECT_URIS must be a JSON array of absolute URLs.");
  }
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new Error("OIDC_CLIENT_REDIRECT_URIS must contain at least one URL.");
  }

  const normalized = redirectUris.map((value, index) => {
    if (typeof value !== "string" || value.trim() !== value || !value) {
      throw new Error(`OIDC_CLIENT_REDIRECT_URIS[${index}] must be a non-empty string.`);
    }
    const url = parseAbsoluteUrl(`OIDC_CLIENT_REDIRECT_URIS[${index}]`, value);
    return url.toString();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("OIDC_CLIENT_REDIRECT_URIS must not contain duplicates.");
  }

  return { id, secret, redirectUris: normalized };
}

export function getOidcSigningKeyConfig() {
  const privateKeyBase64 = required("OIDC_SIGNING_PRIVATE_KEY_B64");
  const keyId = required("OIDC_SIGNING_KEY_ID");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId)) {
    throw new Error("OIDC_SIGNING_KEY_ID contains unsupported characters.");
  }
  return { privateKeyBase64, keyId };
}

export async function assertOidcConfiguration() {
  if (!isOidcEnabled()) return;
  getOidcIssuer();
  getOidcClient();
  await import("@/lib/oidc/tokens").then(({ getOidcPublicJwk }) => getOidcPublicJwk());
}
