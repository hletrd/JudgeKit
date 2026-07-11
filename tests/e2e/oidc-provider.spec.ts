import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const clientId = "info-course-portal";
const clientSecret = "playwright-oidc-client-secret-32-characters";

test("JudgeKit login authorizes a PKCE client and exposes userinfo", async ({ page, request, baseURL }) => {
  const discoveryResponse = await request.get("/.well-known/openid-configuration");
  expect(discoveryResponse.status()).toBe(200);
  const discovery = await discoveryResponse.json();
  expect(discovery).toMatchObject({
    issuer: baseURL,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
  });

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const callback = `${baseURL}/oidc-test-callback`;
  const authorize = new URL("/api/oidc/authorize", baseURL);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  await page.goto(authorize.toString(), { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login\?/);
  await page.locator("#username").fill(DEFAULT_CREDENTIALS.username);
  await page.locator("#password").fill(DEFAULT_CREDENTIALS.password);
  await page.getByRole("button", { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/oidc-test-callback\?/, { timeout: 15_000 });

  const callbackUrl = new URL(page.url());
  expect(callbackUrl.searchParams.get("state")).toBe(state);
  const code = callbackUrl.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await request.post("/api/oidc/token", {
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    form: {
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: callback,
      code_verifier: verifier,
    },
  });
  expect(tokenResponse.status()).toBe(200);
  expect(tokenResponse.headers()["cache-control"]).toBe("no-store");
  const tokens = await tokenResponse.json();
  expect(tokens).toMatchObject({ token_type: "Bearer", scope: "openid profile email" });

  const userInfoResponse = await request.get("/api/oidc/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(userInfoResponse.status()).toBe(200);
  expect(await userInfoResponse.json()).toMatchObject({
    preferred_username: DEFAULT_CREDENTIALS.username,
    role: "super_admin",
  });
});
