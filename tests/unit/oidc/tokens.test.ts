import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwt, importJWK, jwtVerify } from "jose";
import {
  createOidcTokenResponse,
  getOidcPublicJwk,
  verifyOidcAccessToken,
} from "@/lib/oidc/tokens";

describe("OIDC token signing", () => {
  beforeEach(() => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    vi.stubEnv("OIDC_ISSUER", "https://oj.auraedu.me");
    vi.stubEnv("OIDC_CLIENT_ID", "info-course-portal");
    vi.stubEnv("OIDC_CLIENT_SECRET", "s".repeat(32));
    vi.stubEnv(
      "OIDC_CLIENT_REDIRECT_URIS",
      JSON.stringify(["https://info.auraedu.me/api/auth/callback/judgekit"]),
    );
    vi.stubEnv("OIDC_SIGNING_PRIVATE_KEY_B64", Buffer.from(pem).toString("base64"));
    vi.stubEnv("OIDC_SIGNING_KEY_ID", "test-key-1");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("signs verifiable RS256 ID and access tokens with the configured issuer", async () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    const tokens = await createOidcTokenResponse({
      user: {
        id: "user-1",
        username: "sion",
        name: "시온",
        email: "sion@example.com",
        role: "student",
        className: "1반",
      },
      scope: "openid profile email",
      nonce: "nonce-1",
      now,
    });
    const jwk = await getOidcPublicJwk();
    const publicKey = await importJWK(jwk, "RS256");
    const verified = await jwtVerify(tokens.id_token, publicKey, {
      issuer: "https://oj.auraedu.me",
      audience: "info-course-portal",
      currentDate: now,
    });

    expect(verified.protectedHeader).toMatchObject({ alg: "RS256", kid: "test-key-1" });
    expect(verified.payload).toMatchObject({
      sub: "user-1",
      preferred_username: "sion",
      name: "시온",
      email: "sion@example.com",
      nonce: "nonce-1",
    });
    expect(decodeJwt(tokens.access_token)).toMatchObject({ token_use: "access", scope: "openid profile email" });
  });

  it("accepts a valid access token and rejects an ID token at userinfo", async () => {
    const now = new Date();
    const tokens = await createOidcTokenResponse({
      user: {
        id: "user-2",
        username: "yushi",
        name: "유우시",
        email: null,
        role: "student",
        className: null,
      },
      scope: "openid profile",
      nonce: null,
      now,
    });

    await expect(verifyOidcAccessToken(tokens.access_token)).resolves.toMatchObject({ sub: "user-2" });
    await expect(verifyOidcAccessToken(tokens.id_token)).rejects.toThrow();
  });
});
