import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getJudgeSystemSnapshot } from "@/lib/judge/dashboard-data";
import { buildLocalePath } from "@/lib/seo";
import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, tShell, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: tShell("languages.title"),
    description: tShell("languages.description"),
    path: "/languages",
    siteTitle: settings.siteTitle,
    locale,
  });
}

export default async function PublicLanguagesPage() {
  const [snapshot, locale, t] = await Promise.all([
    getJudgeSystemSnapshot(),
    getLocale(),
    getTranslations("publicShell"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{t("languages.title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("languages.description")}
          </p>
        </div>
        <Link href={buildLocalePath("/", locale)}>
          <Button variant="outline">{t("languages.backToHome")}</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("languages.gradingEnvironment")}</CardTitle>
          <CardDescription>{t("languages.gradingEnvironmentDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.gradingCpu ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("languages.gradingCpu")}</p>
                <p className="mt-1 text-sm font-medium">{snapshot.gradingCpu}</p>
              </div>
            ) : null}
            {snapshot.gradingOs ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("languages.gradingOs")}</p>
                <p className="mt-1 text-sm font-medium">{snapshot.gradingOs}</p>
              </div>
            ) : null}
            {snapshot.gradingArchitecture ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("languages.gradingArchitecture")}</p>
                <p className="mt-1 text-sm font-medium">{snapshot.gradingArchitecture}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("languages.defaultTimeLimit")}</p>
              <p className="mt-1 text-sm font-medium">{(snapshot.defaultTimeLimitMs / 1000).toFixed(1)}s</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("languages.defaultMemoryLimit")}</p>
              <p className="mt-1 text-sm font-medium">{snapshot.defaultMemoryLimitMb} MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {snapshot.featuredEnvironments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("languages.featuredTitle")}</CardTitle>
            <CardDescription>{t("languages.featuredDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.featuredEnvironments.map((env) => (
                <div key={env.key} className="rounded-xl border p-4">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold tracking-tight">{env.title}</p>
                    <p className="text-sm text-muted-foreground">{env.runtime}</p>
                  </div>
                  {env.compiler ? (
                    <p className="mt-3 text-sm font-medium">{env.compiler}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {env.variants.map((variant) => (
                      <Badge key={variant} variant="secondary">{variant}</Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("languages.variantCount", { count: env.languageCount })}
                  </p>
                </div>
              ))}
            </div>
            {snapshot.additionalLanguageCount > 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("languages.additionalLanguages", { count: snapshot.additionalLanguageCount })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("languages.allLanguages")}</CardTitle>
          <CardDescription>{t("languages.allLanguagesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {snapshot.allLanguages.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("languages.language")}</TableHead>
                    <TableHead>{t("languages.extension")}</TableHead>
                    <TableHead>{t("languages.runtime")}</TableHead>
                    <TableHead>{t("languages.compiler")}</TableHead>
                    <TableHead>{t("languages.compileCommand")}</TableHead>
                    <TableHead>{t("languages.runCommand")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.allLanguages.map((lang) => (
                    <TableRow key={lang.id}>
                      <TableCell>
                        <Badge variant="secondary">{lang.label}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{lang.extension}</TableCell>
                      <TableCell className="max-w-[200px] text-sm text-muted-foreground">{lang.runtime}</TableCell>
                      <TableCell className="text-sm">{lang.compiler ?? "-"}</TableCell>
                      <TableCell className="max-w-[260px] font-mono text-xs">
                        {lang.compileCommand ?? "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] font-mono text-xs">
                        {lang.runCommand ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {t("languages.noLanguages")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
