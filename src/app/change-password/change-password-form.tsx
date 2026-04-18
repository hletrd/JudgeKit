"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/actions/change-password";

export function ChangePasswordForm({ username }: { username: string }) {
  const router = useRouter();
  const t = useTranslations("changePassword");
  const [error, setError] = useState<string | null>(null);
  const [reauthFailed, setReauthFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [confirmPasswordValue, setConfirmPasswordValue] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setReauthFailed(false);

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword);

      if (!result.success) {
        if (result.error === "sessionExpired" || result.error === "userNotFound") {
          await signOut({ redirect: false });
          router.replace("/login");
          router.refresh();
          return;
        }

        setError(t(result.error ?? "error"));
      } else {
        const refreshedSession = await signIn("credentials", {
          username,
          password: newPassword,
          redirect: false,
          redirectTo: "/dashboard",
        });

        if (refreshedSession?.error || !refreshedSession?.ok) {
          // Password was already changed server-side, but automatic re-login
          // failed (rate limit, network blip, etc.). Surface a clear notice
          // and a fallback link so the user is never left with a dead UI.
          // Do NOT call signOut here — it clears the next-auth session which
          // triggers a server-component re-render that replaces this form with
          // InvalidChangePasswordSession (auto-redirect), hiding the error.
          setReauthFailed(true);
          return;
        }

        if (refreshedSession.url) {
          const nextUrl = new URL(refreshedSession.url, window.location.origin);
          router.replace(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        } else {
          router.replace("/dashboard");
        }
        router.refresh();
      }
    });
  }

  const passwordsMatch = confirmPasswordValue.length > 0 && newPasswordValue === confirmPasswordValue;
  const passwordsMismatch = confirmPasswordValue.length > 0 && newPasswordValue !== confirmPasswordValue;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoFocus
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          minLength={8}
          required
          value={newPasswordValue}
          onChange={(e) => setNewPasswordValue(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          minLength={8}
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
            {t("passwordMismatch")}
          </p>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}
      {reauthFailed && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3" role="alert">
          <p className="text-sm text-amber-900 dark:text-amber-200">{t("reauthFailed")}</p>
          <Link
            href="/login"
            className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signInAgain")}
          </Link>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("changing") : t("changeButton")}
      </Button>
    </form>
  );
}
