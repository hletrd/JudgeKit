import { createHash, timingSafeEqual } from "node:crypto";
import type { OidcClient } from "@/lib/oidc/config";

export const OIDC_SUPPORTED_SCOPES = ["openid", "profile", "email"] as const;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OidcAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  nonce: string | null;
  codeChallenge: string;
  prompt: "login" | "none" | null;
};

export type OidcAuthorizationError = {
  error: "invalid_request" | "unauthorized_client" | "unsupported_response_type" | "invalid_scope";
  description: string;
  redirectUri?: string;
  state?: string | null;
};

function one(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function error(
  code: OidcAuthorizationError["error"],
  description: string,
  redirectUri?: string,
  state?: string | null,
): { ok: false; error: OidcAuthorizationError } {
  return { ok: false, error: { error: code, description, redirectUri, state } };
}

export function validateAuthorizationRequest(
  params: URLSearchParams,
  client: OidcClient,
): { ok: true; value: OidcAuthorizationRequest } | { ok: false; error: OidcAuthorizationError } {
  const clientId = one(params, "client_id");
  const redirectUri = one(params, "redirect_uri");

  if (!clientId || clientId !== client.id) {
    return error("unauthorized_client", "The client is not registered.");
  }
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return error("invalid_request", "The redirect_uri is not registered for this client.");
  }

  const stateValues = params.getAll("state");
  const state = stateValues.length === 0 ? null : stateValues.length === 1 ? stateValues[0] : null;
  if (stateValues.length > 1 || (state && state.length > 1024)) {
    return error("invalid_request", "state is invalid.", redirectUri);
  }

  if (one(params, "response_type") !== "code") {
    return error("unsupported_response_type", "Only response_type=code is supported.", redirectUri, state);
  }

  const scope = one(params, "scope");
  const scopes = scope?.split(/\s+/).filter(Boolean) ?? [];
  if (
    !scope ||
    scope.length > 256 ||
    !scopes.includes("openid") ||
    scopes.some((item) => !(OIDC_SUPPORTED_SCOPES as readonly string[]).includes(item))
  ) {
    return error("invalid_scope", "The request must use supported scopes and include openid.", redirectUri, state);
  }

  const codeChallenge = one(params, "code_challenge");
  if (!codeChallenge || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return error("invalid_request", "A valid PKCE code_challenge is required.", redirectUri, state);
  }
  if (one(params, "code_challenge_method") !== "S256") {
    return error("invalid_request", "Only code_challenge_method=S256 is supported.", redirectUri, state);
  }

  const nonceValues = params.getAll("nonce");
  const nonce = nonceValues.length === 0 ? null : nonceValues.length === 1 ? nonceValues[0] : null;
  if (nonceValues.length > 1 || (nonce && nonce.length > 512)) {
    return error("invalid_request", "nonce is invalid.", redirectUri, state);
  }

  const promptValue = params.get("prompt");
  if (params.getAll("prompt").length > 1 || (promptValue !== null && promptValue !== "login" && promptValue !== "none")) {
    return error("invalid_request", "Only prompt=login or prompt=none is supported.", redirectUri, state);
  }

  const responseMode = params.get("response_mode");
  if (params.getAll("response_mode").length > 1 || (responseMode !== null && responseMode !== "query")) {
    return error("invalid_request", "Only response_mode=query is supported.", redirectUri, state);
  }

  return {
    ok: true,
    value: {
      clientId,
      redirectUri,
      scope: [...new Set(scopes)].join(" "),
      state,
      nonce,
      codeChallenge,
      prompt: promptValue as OidcAuthorizationRequest["prompt"],
    },
  };
}

export function createAuthorizationErrorRedirect(
  redirectUri: string,
  errorCode: string,
  description: string,
  state?: string | null,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", errorCode);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url;
}

export function isValidPkceVerifier(verifier: string) {
  return PKCE_VERIFIER_PATTERN.test(verifier);
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function verifyPkce(verifier: string, expectedChallenge: string) {
  if (!isValidPkceVerifier(verifier)) return false;
  return constantTimeEqual(createPkceChallenge(verifier), expectedChallenge);
}

export function constantTimeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
