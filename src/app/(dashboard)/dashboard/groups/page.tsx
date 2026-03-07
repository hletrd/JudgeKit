import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function GroupsPage() {
  const t = await getTranslations("groups");
  const tCommon = await getTranslations("common");

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{tCommon("comingSoon")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("description")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
