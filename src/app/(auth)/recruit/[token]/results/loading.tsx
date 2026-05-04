import { getTranslations } from "next-intl/server";

export default async function RecruitResultsLoading() {
  const t = await getTranslations("common");
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label={t("loading")}>
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
