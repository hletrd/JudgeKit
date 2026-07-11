import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose";
import { getOidcClient, getOidcIssuer, getOidcSigningKeyConfig } from "@/lib/oidc/config";

const ID_TOKEN_TTL_SECONDS = 300;
export const ACCESS_TOKEN_TTL_SECONDS = 600;
const ALGORITHM = "RS256";

type SigningKeys = Awaited<ReturnType<typeof loadSigningKeys>>;
let keyCache: { source: string; promise: Promise<SigningKeys> } | null = null;

async function loadSigningKeys() {
  const { privateKeyBase64, keyId } = getOidcSigningKeyConfig();
  const privatePem = Buffer.from(privateKeyBase64, "base64").toString("utf8");
  if (!privatePem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("OIDC_SIGNING_PRIVATE_KEY_B64 must contain a base64-encoded PKCS#8 private key.");
  }

  const nodePrivateKey = createPrivateKey(privatePem);
  const publicPem = createPublicKey(nodePrivateKey).export({ type: "spki", format: "pem" }).toString();
  const [privateKey, publicKey] = await Promise.all([
    importPKCS8(privatePem, ALGORITHM),
    importSPKI(publicPem, ALGORITHM),
  ]);
  const publicJwk = await exportJWK(publicKey);

  return {
    privateKey,
    publicKey,
    publicJwk: { ...publicJwk, use: "sig", alg: ALGORITHM, kid: keyId },
    keyId,
  };
}

function getSigningKeys() {
  const config = getOidcSigningKeyConfig();
  const source = `${config.keyId}:${config.privateKeyBase64}`;
  if (!keyCache || keyCache.source !== source) {
    keyCache = { source, promise: loadSigningKeys() };
  }
  return keyCache.promise;
}

export async function getOidcPublicJwk() {
  return (await getSigningKeys()).publicJwk;
}

type OidcTokenUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  className: string | null;
};

export async function createOidcTokenResponse(input: {
  user: OidcTokenUser;
  scope: string;
  nonce: string | null;
  now: Date;
}) {
  const issuer = getOidcIssuer();
  const client = getOidcClient();
  const { privateKey, keyId } = await getSigningKeys();
  const issuedAt = Math.floor(input.now.getTime() / 1000);

  const idClaims: JWTPayload = {
    preferred_username: input.user.username,
    name: input.user.name,
    role: input.user.role,
  };
  if (input.user.className) idClaims.class_name = input.user.className;
  if (input.user.email && input.scope.split(" ").includes("email")) {
    idClaims.email = input.user.email;
  }
  if (input.nonce) idClaims.nonce = input.nonce;

  const idToken = await new SignJWT(idClaims)
    .setProtectedHeader({ alg: ALGORITHM, kid: keyId, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(client.id)
    .setSubject(input.user.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ID_TOKEN_TTL_SECONDS)
    .sign(privateKey);

  const accessToken = await new SignJWT({
    token_use: "access",
    client_id: client.id,
    scope: input.scope,
  })
    .setProtectedHeader({ alg: ALGORITHM, kid: keyId, typ: "at+jwt" })
    .setIssuer(issuer)
    .setAudience(`${issuer}/api/oidc/userinfo`)
    .setSubject(input.user.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(privateKey);

  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    id_token: idToken,
    scope: input.scope,
  };
}

export async function verifyOidcAccessToken(token: string) {
  const issuer = getOidcIssuer();
  const client = getOidcClient();
  const { publicKey } = await getSigningKeys();
  const result = await jwtVerify(token, publicKey, {
    issuer,
    audience: `${issuer}/api/oidc/userinfo`,
    algorithms: [ALGORITHM],
  });
  if (result.payload.token_use !== "access" || result.payload.client_id !== client.id) {
    throw new Error("The bearer token is not an OIDC access token for this client.");
  }
  return result.payload;
}
