"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function RecruitStartForm({
  token,
  assignmentId,
  isReentry,
}: {
  token: string;
  assignmentId: string;
  isReentry: boolean;
}) {
  const t = useTranslations("recruit");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);

    try {
      // Sign out any existing session first
      await signOut({ redirect: false }).catch(() => {});

      const result = await signIn("credentials", {
        recruitToken: token,
        redirect: false,
      });

      if (result?.ok) {
        router.push(`/dashboard/contests/${assignmentId}`);
        router.refresh();
      } else {
        setError(t("startFailed"));
      }
    } catch {
      setError(t("startFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
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
