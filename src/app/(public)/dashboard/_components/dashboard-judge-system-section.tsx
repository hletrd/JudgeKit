import { getLocale, getTranslations } from "next-intl/server";
import { DashboardJudgeSystemTabs } from "@/app/(public)/dashboard/_components/dashboard-judge-system-tabs";
import { getJudgeSystemSnapshot } from "@/lib/judge/dashboard-data";
import { formatNumber } from "@/lib/formatting";

export async function DashboardJudgeSystemSection() {
  const [snapshot, locale, tDashboard, tJudge] = await Promise.all([
    getJudgeSystemSnapshot(),
    getLocale(),
    getTranslations("dashboard"),
    getTranslations("judge"),
  ]);

  const statusCards = [
    {
      label: tDashboard("onlineWorkers"),
      value: formatNumber(snapshot.onlineWorkerCount, locale),
      description: snapshot.architectureSummary
        ? tDashboard("availableArchitecturesValue", { architectures: snapshot.architectureSummary })
        : undefined,
    },
    {
      label: tDashboard("workerCapacity"),
      value: formatNumber(snapshot.totalWorkerCapacity, locale),
      description: tDashboard("workerCapacityDescription"),
    },
    {
      label: tDashboard("activeJudgeTasks"),
      value: formatNumber(snapshot.activeJudgeTasks, locale),
      description: tDashboard("activeJudgeTasksDescription"),
    },
    {
      label: tDashboard("defaultJudgeLimits"),
      value: `${formatNumber(snapshot.defaultTimeLimitMs, locale)} ms · ${formatNumber(snapshot.defaultMemoryLimitMb, locale)} MB`,
      description: tJudge("limitsNote"),
    },
  ];

  const featuredEnvironments = snapshot.featuredEnvironments.map((environment) => ({
    ...environment,
    variantCountLabel: tDashboard("activeVariantCount", { count: environment.languageCount }),
  }));

  return (
    <DashboardJudgeSystemTabs
      sectionTitle={tDashboard("judgeSystemSectionTitle")}
      sectionDescription={tDashboard("judgeSystemSectionDescription")}
      overviewTabLabel={tDashboard("opsOverviewTitle")}
      languagesTabLabel={tDashboard("supportedLanguages")}
      statusCards={statusCards}
      featuredEnvironmentsTitle={tDashboard("featuredLanguageEnvironments")}
      featuredEnvironmentsDescription={tDashboard("featuredLanguageEnvironmentsDescription")}
      featuredEnvironments={featuredEnvironments}
      additionalLanguagesMessage={
        snapshot.additionalLanguageCount > 0
          ? tDashboard("additionalLanguagesMessage", { count: snapshot.additionalLanguageCount })
          : null
      }
      noFeaturedLanguagesMessage={tDashboard("noEnabledLanguages")}
      viewAllLanguagesHref="/languages"
      viewAllLanguagesLabel={tDashboard("viewAllLanguages")}
    />
  );
}
