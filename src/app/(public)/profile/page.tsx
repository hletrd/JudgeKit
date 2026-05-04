import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { languageConfigs, roles } from "@/lib/db/schema";
import { getJudgeLanguageDefinition } from "@/lib/judge/languages";
import { getRoleLevel } from "@/lib/capabilities/cache";
import ProfileForm from "./profile-form";
import { EditorThemePicker } from "./editor-theme-picker";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("profile");
  const tCommon = await getTranslations("common");
  const [langs, actorRoleLevel, roleRecord] = await Promise.all([
    db.select({ language: languageConfigs.language, displayName: languageConfigs.displayName, standard: languageConfigs.standard, isEnabled: languageConfigs.isEnabled }).from(languageConfigs).where(eq(languageConfigs.isEnabled, true)),
    getRoleLevel(session.user.role),
    db.query.roles.findFirst({
      where: eq(roles.name, session.user.role),
      columns: { displayName: true },
    }),
  ]);
  const enabledLanguages = langs.flatMap((lang) => {
    const def = getJudgeLanguageDefinition(lang.language);
    if (!def) return [];
    return [{ value: lang.language, label: `${def.displayName}${def.standard ? ` (${def.standard})` : ""}` }];
  });

  const roleLabels: Record<string, string> = {
    student: tCommon("roles.student"),
    assistant: tCommon("roles.assistant"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };
  const roleLabel = roleLabels[session.user.role] ?? roleRecord?.displayName ?? session.user.role;
  const canEditClassName = actorRoleLevel > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>{t("userProfile")}</CardTitle>
          <CardDescription>{t("userProfileDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="id">{t("userId")}</Label>
            <Input id="id" value={session.user.id} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">{t("username")}</Label>
            <Input id="username" value={session.user.username} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" value={session.user.email || tCommon("notSet")} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="className">{t("className")}</Label>
            <Input id="className" value={session.user.className || tCommon("notSet")} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("role")}</Label>
            <div>
              <Badge variant="default" className="text-sm capitalize">
                {roleLabel}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("editProfile")}</CardTitle>
          <CardDescription>{t("editProfileDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={session.user.name || ""}
            initialClassName={session.user.className || ""}
            initialPreferredLanguage={session.user.preferredLanguage || ""}
            initialPreferredTheme={session.user.preferredTheme || "system"}
            initialShareAcceptedSolutions={session.user.shareAcceptedSolutions ?? true}
            initialAcceptedSolutionsAnonymous={session.user.acceptedSolutionsAnonymous ?? false}
            initialEditorFontSize={session.user.editorFontSize || "14"}
            initialEditorFontFamily={session.user.editorFontFamily || "system"}
            languages={enabledLanguages}
            canEditClassName={canEditClassName}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("editorTheme")}</CardTitle>
          <CardDescription>{t("editorThemeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EditorThemePicker initialTheme={session.user.editorTheme || ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("changePassword")}</CardTitle>
          <CardDescription>{t("changePasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/change-password">
            <Button variant="outline">{t("changePasswordBtn")}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
