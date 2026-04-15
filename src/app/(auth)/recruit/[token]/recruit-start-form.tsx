"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RecruitStartForm({
  token,
  assignmentId,
  isReentry,
  resumeWithCurrentSession,
  requiresAccountPassword,
}: {
  token: string;
  assignmentId: string;
  isReentry: boolean;
  resumeWithCurrentSession: boolean;
  requiresAccountPassword: boolean;
}) {
  const t = useTranslations("recruit");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountPassword, setAccountPassword] = useState("");

  async function handleStart() {
    setLoading(true);
    setError(null);

    try {
      if (resumeWithCurrentSession) {
        router.push(`/dashboard/contests/${assignmentId}`);
        router.refresh();
        return;
      }

      const normalizedAccountPassword = accountPassword.trim();
      if (requiresAccountPassword && !normalizedAccountPassword) {
        setError(t("accountPasswordMissing"));
        return;
      }

      // Sign out any existing session first
      await signOut({ redirect: false }).catch(() => {});

      const result = await signIn("credentials", {
        recruitToken: token,
        recruitAccountPassword: requiresAccountPassword ? normalizedAccountPassword : undefined,
        redirect: false,
      });

      if (result?.error || !result?.ok) {
        setError(t("startFailed"));
      } else {
        router.push(`/dashboard/contests/${assignmentId}`);
        router.refresh();
      }
    } catch {
      setError(t("startFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {requiresAccountPassword && (
        <div className="space-y-2 text-left">
          <label className="block text-sm font-medium" htmlFor="recruit-account-password">
            {t("accountPasswordLabel")}
          </label>
          <Input
            id="recruit-account-password"
            type="password"
            value={accountPassword}
            onChange={(event) => setAccountPassword(event.target.value)}
            placeholder={t("accountPasswordPlaceholder")}
            autoComplete="new-password"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">{t("accountPasswordHint")}</p>
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={handleStart}
        disabled={loading}
      >
        {loading
          ? t("starting")
          : isReentry
            ? t("continueAssessment")
            : t("startAssessment")}
      </Button>
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
