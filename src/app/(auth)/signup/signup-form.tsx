"use client";

import Script from "next/script";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { registerPublicUser } from "@/lib/actions/public-signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getSafeRedirectUrl(callbackUrl: string | null): string {
  if (!callbackUrl) return "/dashboard";
  if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/dashboard";
}

export function SignupForm({
  hcaptchaEnabled,
  hcaptchaSiteKey,
}: {
  hcaptchaEnabled: boolean;
  hcaptchaSiteKey: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [confirmPasswordValue, setConfirmPasswordValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "");
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const captchaToken = String(formData.get("h-captcha-response") ?? "").trim();
    const redirectTo = getSafeRedirectUrl(searchParams.get("callbackUrl"));

    if (password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      setLoading(false);
      return;
    }

    if (hcaptchaEnabled && !captchaToken) {
      setError(t("hcaptchaRequired"));
      setLoading(false);
      return;
    }

    const result = await registerPublicUser({
      username,
      name,
      email: email || undefined,
      password,
      confirmPassword,
      captchaToken: captchaToken || undefined,
    });

    if (!result.success) {
      const hcaptcha = (window as typeof window & { hcaptcha?: { reset?: () => void } }).hcaptcha;
      hcaptcha?.reset?.();

      const errorCode = result.error ?? "createUserFailed";
      // Map known server field errors to field-specific state
      if (errorCode === "usernameInUse") {
        setFieldErrors((prev) => ({ ...prev, username: t("usernameInUse") }));
      } else if (errorCode === "emailInUse") {
        setFieldErrors((prev) => ({ ...prev, email: t("emailInUse") }));
      } else if (errorCode === "invalidEmail") {
        setFieldErrors((prev) => ({ ...prev, email: t("invalidEmail") }));
      } else if (errorCode === "nameRequired") {
        setFieldErrors((prev) => ({ ...prev, name: t("nameRequired") }));
      } else {
        setError(t(errorCode));
      }
      setLoading(false);
      return;
    }

    try {
      const signInResult = await signIn("credentials", {
        username,
        password,
        redirect: false,
        redirectTo,
      });

      if (signInResult?.error || !signInResult?.ok) {
        router.push("/login");
        router.refresh();
        return;
      }

      if (signInResult.url) {
        const nextUrl = new URL(signInResult.url, window.location.origin);
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      } else {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      router.push("/login");
      router.refresh();
    }
  }

  const passwordsMatch = confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue;
  const passwordsMismatch = confirmPasswordValue.length > 0 && passwordValue !== confirmPasswordValue;

  return (
    <>
      {hcaptchaEnabled && hcaptchaSiteKey ? (
        <Script src="https://js.hcaptcha.com/1/api.js" strategy="afterInteractive" />
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">{t("username")}</Label>
          <Input
            id="username"
            name="username"
            type="text"
            placeholder={t("usernamePlaceholder")}
            autoComplete="username"
            autoFocus
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_]+"
            aria-invalid={!!fieldErrors.username || undefined}
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
          />
          {fieldErrors.username && (
            <p id="username-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.username}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder={t("namePlaceholder")}
            autoComplete="name"
            required
            aria-invalid={!!fieldErrors.name || undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
          />
          {fieldErrors.name && (
            <p id="name-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            autoComplete="email"
            aria-invalid={!!fieldErrors.email || undefined}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-sm text-destructive" role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPasswordValue}
            onChange={(e) => setConfirmPasswordValue(e.target.value)}
          />
          {passwordsMatch && (
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Check className="size-3.5" aria-hidden="true" />
              Passwords match
            </p>
          )}
          {passwordsMismatch && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <X className="size-3.5" aria-hidden="true" />
              {t("passwordsDoNotMatch")}
            </p>
          )}
        </div>
        {hcaptchaEnabled && hcaptchaSiteKey ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("hcaptchaPrompt")}</p>
            <div className="h-captcha" data-sitekey={hcaptchaSiteKey} />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("signUpNotice")}</p>
        {error ? (
          <p className="text-sm text-destructive" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("signingUp") : t("createAccount")}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </form>
    </>
  );
}
