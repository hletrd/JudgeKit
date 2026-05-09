import { decrypt } from "@/lib/security/encryption";

const HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify";

function envSiteKey() {
  const value = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

function envSecret() {
  const value = process.env.HCAPTCHA_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

async function getDbHcaptchaFields() {
  const { getSystemSettings } = await import("@/lib/system-settings");
  const settings = await getSystemSettings();
  if (!settings) return { siteKey: null, secret: null };
  const hcaptchaSiteKey = (settings as Record<string, unknown>).hcaptchaSiteKey as string | null;
  const hcaptchaSecret = (settings as Record<string, unknown>).hcaptchaSecret as string | null;
  return {
    siteKey: hcaptchaSiteKey ?? null,
    secret: hcaptchaSecret != null ? decrypt(hcaptchaSecret, { allowPlaintextFallback: true }) : null,
  };
}

export async function getHcaptchaSiteKey() {
  const db = await getDbHcaptchaFields();
  return db.siteKey || envSiteKey();
}

export async function getHcaptchaSecret() {
  const db = await getDbHcaptchaFields();
  return db.secret || envSecret();
}

export async function isHcaptchaConfigured() {
  const [siteKey, secret] = await Promise.all([getHcaptchaSiteKey(), getHcaptchaSecret()]);
  return Boolean(siteKey && secret);
}

export async function verifyHcaptchaToken(token: string, remoteIp?: string | null) {
  const secret = await getHcaptchaSecret();
  if (!secret) {
    return {
      success: false,
      errorCodes: ["hcaptcha-not-configured"],
    };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(HCAPTCHA_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return {
      success: false,
      errorCodes: [`http-${response.status}`],
    };
  }

  const payload = await response.json().catch(() => ({
    success: false,
    "error-codes": ["parse-error"],
  })) as {
    success?: boolean;
    "error-codes"?: string[];
  };

  return {
    success: payload.success === true,
    errorCodes: payload["error-codes"] ?? [],
  };
}
