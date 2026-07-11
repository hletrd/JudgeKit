import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  createPkceChallenge,
  validateAuthorizationRequest,
  verifyPkce,
} from "@/lib/oidc/protocol";

const client = {
  id: "info-course-portal",
  secret: "s".repeat(32),
  redirectUris: ["https://info.auraedu.me/api/auth/callback/judgekit"],
};
const verifier = "a".repeat(43);

function validParams() {
  return new URLSearchParams({
    client_id: client.id,
    redirect_uri: client.redirectUris[0],
    response_type: "code",
    scope: "openid profile email",
    state: "state-1",
    nonce: "nonce-1",
    code_challenge: createPkceChallenge(verifier),
    code_challenge_method: "S256",
  });
}

describe("OIDC protocol validation", () => {
  it("accepts an authorization code request with S256 PKCE", () => {
    const result = validateAuthorizationRequest(validParams(), client);
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        clientId: client.id,
        redirectUri: client.redirectUris[0],
        scope: "openid profile email",
        state: "state-1",
        nonce: "nonce-1",
      }),
    });
  });

  it("does not return an attacker-controlled redirect URI on validation failure", () => {
    const params = validParams();
    params.set("redirect_uri", "https://attacker.example/callback");
    const result = validateAuthorizationRequest(params, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.redirectUri).toBeUndefined();
  });

  it("rejects implicit-flow and plain-PKCE requests", () => {
    const implicit = validParams();
    implicit.set("response_type", "token");
    expect(validateAuthorizationRequest(implicit, client)).toMatchObject({
      ok: false,
      error: { error: "unsupported_response_type", redirectUri: client.redirectUris[0] },
    });

    const plain = validParams();
    plain.set("code_challenge_method", "plain");
    expect(validateAuthorizationRequest(plain, client)).toMatchObject({
      ok: false,
      error: { error: "invalid_request" },
    });
  });

  it("verifies PKCE without accepting malformed verifiers", () => {
    const challenge = createPkceChallenge(verifier);
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("b".repeat(43), challenge)).toBe(false);
    expect(verifyPkce("short", challenge)).toBe(false);
  });

  it("compares client credentials in constant-time digest space", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different-length-value")).toBe(false);
  });
});
