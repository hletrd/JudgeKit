import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { findSessionUserWithPassword } from "@/lib/auth/find-session-user";
import { ChangePasswordForm } from "./change-password-form";
import { InvalidChangePasswordSession } from "./invalid-change-password-session";

export default async function ChangePasswordPage() {
  const t = await getTranslations("changePassword");
  const session = await auth();
  const currentUser = await findSessionUserWithPassword(session);
  const shouldResetSession = !currentUser || !currentUser.passwordHash;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {shouldResetSession ? (
            <InvalidChangePasswordSession />
          ) : (
            <ChangePasswordForm username={currentUser.username} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
