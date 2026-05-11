"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState<string>(
    token ? "" : t("invalidOrExpiredToken")
  );

  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({ error: "unknown" }));

        if (!res.ok) {
          setStatus("error");
          if (data.error === "invalidOrExpiredToken") {
            setErrorMessage(t("invalidOrExpiredToken"));
          } else {
            setErrorMessage(t("verifyFailed"));
          }
          return;
        }

        setStatus("success");
      } catch {
        setStatus("error");
        setErrorMessage(t("verifyFailed"));
      }
    }

    verify();
  }, [token, t]);

  return (
    <Card className="w-full max-w-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          <h1>{t("verifyEmailTitle")}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "loading" && (
          <p className="text-center text-muted-foreground">{t("verifying")}</p>
        )}
        {status === "success" && (
          <>
            <p className="text-center text-sm text-green-600 dark:text-green-400" role="status">
              {t("verifySuccess")}
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => router.push("/login")}
            >
              {t("signIn")}
            </Button>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-center text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push("/login")}
            >
              {t("backToSignIn")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
