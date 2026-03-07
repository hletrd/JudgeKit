"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function InvalidChangePasswordSession() {
  const router = useRouter();
  const t = useTranslations("changePassword");

  useEffect(() => {
    void signOut({ redirect: false }).finally(() => {
      router.replace("/login");
      router.refresh();
    });
  }, [router]);

  return (
    <p className="text-sm text-muted-foreground">
      {t("sessionExpired")}
    </p>
  );
}
