import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProblemDetailPage() {
  const t = await getTranslations("problems");
  const tCommon = await getTranslations("common");

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{t("detail")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{tCommon("comingSoon")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{tCommon("underConstruction")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
