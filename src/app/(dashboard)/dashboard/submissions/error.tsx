"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function SubmissionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("dashboardState");

  useEffect(() => {
    console.error("[submissions-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{t("errorTitle")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("errorDescription")}
        </p>
      </div>
      <Button type="button" onClick={reset}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}
