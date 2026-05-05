import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
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
          <h1>{t("signInDescription")}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LoginForm />
        {settings.publicSignupEnabled ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("needAccount")}{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              {t("createAccount")}
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
