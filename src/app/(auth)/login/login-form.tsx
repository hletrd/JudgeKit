"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const redirectTo = getSafeRedirectUrl(searchParams.get("callbackUrl"));

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        redirectTo,
      });

      if (result?.error || !result?.ok) {
        setError(t("invalidCredentials"));
        setLoading(false);
        return;
      }

      if (result.url) {
        const nextUrl = new URL(result.url, window.location.origin);
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      } else {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (error) {
      setError(t("invalidCredentials"));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">{t("identifier")}</Label>
        <Input
          id="username"
          name="username"
          type="text"
          placeholder={t("identifierPlaceholder")}
          autoComplete="username"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
