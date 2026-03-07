import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import CreateProblemForm from "./create-problem-form";

export default async function CreateProblemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  
  if (session.user.role === "student") {
    redirect("/dashboard/problems");
  }

  const t = await getTranslations("problems");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{t("createTitle", { fallback: "Create New Problem" })}</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>{t("createDescription", { fallback: "Define the problem statement and resource limits." })}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateProblemForm />
        </CardContent>
      </Card>
    </div>
  );
}
