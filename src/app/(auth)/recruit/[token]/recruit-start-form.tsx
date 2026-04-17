"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MIN_PASSWORD_LENGTH = 8;

export function RecruitStartForm({
  token,
  assignmentId,
  isReentry,
  resumeWithCurrentSession,
  requiresAccountPassword,
  assessmentTitle,
  examDurationMinutes,
}: {
  token: string;
  assignmentId: string;
  isReentry: boolean;
  resumeWithCurrentSession: boolean;
  requiresAccountPassword: boolean;
  assessmentTitle?: string;
  examDurationMinutes?: number | null;
}) {
  const t = useTranslations("recruit");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function validateStartInput() {
    const normalizedAccountPassword = accountPassword.trim();
    if (requiresAccountPassword && !normalizedAccountPassword) {
      setError(t("accountPasswordMissing"));
      return null;
    }

    if (requiresAccountPassword && normalizedAccountPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("accountPasswordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return null;
    }

    return normalizedAccountPassword;
  }

  async function executeStart() {
    setLoading(true);
    setError(null);

    try {
      if (resumeWithCurrentSession) {
        router.push(`/dashboard/contests/${assignmentId}`);
        router.refresh();
        return;
      }

      const normalizedAccountPassword = validateStartInput();
      if (requiresAccountPassword && !normalizedAccountPassword) {
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

  async function handlePrimaryAction() {
    setError(null);

    if (resumeWithCurrentSession || isReentry) {
      await executeStart();
      return;
    }

    if (!validateStartInput()) {
      return;
    }

    setConfirmOpen(true);
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
        onClick={handlePrimaryAction}
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
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("startConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {assessmentTitle
                ? t("startConfirmDescription", { title: assessmentTitle })
                : t("startConfirmDescriptionFallback")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            {examDurationMinutes ? (
              <p>{t("durationDetail", { minutes: examDurationMinutes })}</p>
            ) : null}
            <p>{t("noteTimer")}</p>
            <p>{t("startConfirmConnection")}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmOpen(false);
                await executeStart();
              }}
            >
              {t("startConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
