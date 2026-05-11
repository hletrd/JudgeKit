import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  const tCommon = await getTranslations("common");
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return (
    <Card className="w-full max-w-xl">
      <CardHeader className="text-center">
        <p className="text-2xl font-medium">{settings.siteTitle}</p>
        <CardTitle className="text-2xl">
          <h1>{t("resetPasswordTitle")}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
