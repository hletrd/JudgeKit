import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{t("welcome")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("welcomeDescription")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
