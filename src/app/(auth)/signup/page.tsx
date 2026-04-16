import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getHcaptchaSiteKey, isHcaptchaConfigured } from "@/lib/security/hcaptcha";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("auth"),
    getTranslations("common"),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  if (!settings.publicSignupEnabled) {
    notFound();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{settings.siteTitle}</CardTitle>
        <CardDescription>{t("signUpDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm
          hcaptchaEnabled={settings.signupHcaptchaEnabled && await isHcaptchaConfigured()}
          hcaptchaSiteKey={await getHcaptchaSiteKey()}
        />
      </CardContent>
    </Card>
  );
}
