"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({ error: "unknown" }));

      if (!res.ok) {
        if (data.error === "rateLimited") {
          setError(t("rateLimited"));
        } else if (data.error === "emailNotConfigured") {
          setError(t("emailNotConfigured"));
        } else {
          setError(t("sendFailed"));
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError(t("sendFailed"));
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-green-600 dark:text-green-400" role="status">
          {t("resetEmailSent")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("resetEmailInstructions")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("sending") : t("sendResetLink")}
      </Button>
    </form>
  );
}
