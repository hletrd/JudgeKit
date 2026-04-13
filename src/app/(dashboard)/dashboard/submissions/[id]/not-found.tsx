import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("dashboardState");

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="rounded-lg border p-6 text-center max-w-md">
        <h2 className="text-lg font-semibold mb-2">{t("notFoundTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("notFoundDescription")}
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
