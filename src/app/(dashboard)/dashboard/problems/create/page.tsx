import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import CreateProblemForm from "./create-problem-form";
import { getResolvedPlatformMode, getPlatformModePolicy } from "@/lib/system-settings";

export default async function CreateProblemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("problems.create")) {
    redirect("/dashboard/problems");
  }

  const t = await getTranslations("problems");
  const platformMode = await getResolvedPlatformMode();
  const forceDisableAiAssistant = getPlatformModePolicy(platformMode).restrictAiByDefault;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{t("createTitle")}</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>{t("createDescription")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateProblemForm
            canUploadFiles={caps.has("files.upload")}
            forceDisableAiAssistant={forceDisableAiAssistant}
            editorTheme={session.user.editorTheme}
          />
        </CardContent>
      </Card>
    </div>
  );
}
