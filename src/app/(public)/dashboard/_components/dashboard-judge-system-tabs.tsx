"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type StatusCard = {
  label: string;
  value: string;
  description?: string;
};

type FeaturedEnvironment = {
  key: string;
  title: string;
  runtime: string;
  compiler: string | null;
  variants: string[];
  variantCountLabel: string;
};

type DashboardJudgeSystemTabsProps = {
  sectionTitle: string;
  sectionDescription: string;
  overviewTabLabel: string;
  languagesTabLabel: string;
  statusCards: StatusCard[];
  statusFootnote?: string;
  featuredEnvironmentsTitle: string;
  featuredEnvironmentsDescription: string;
  featuredEnvironments: FeaturedEnvironment[];
  additionalLanguagesMessage?: string | null;
  noFeaturedLanguagesMessage: string;
  viewAllLanguagesHref: string;
  viewAllLanguagesLabel: string;
};

export function DashboardJudgeSystemTabs({
  sectionTitle,
  sectionDescription,
  overviewTabLabel,
  languagesTabLabel,
  statusCards,
  statusFootnote,
  featuredEnvironmentsTitle,
  featuredEnvironmentsDescription,
  featuredEnvironments,
  additionalLanguagesMessage,
  noFeaturedLanguagesMessage,
  viewAllLanguagesHref,
  viewAllLanguagesLabel,
}: DashboardJudgeSystemTabsProps) {
  const locale = useLocale();
  // Per CLAUDE.md: Korean text must use default letter-spacing.
  const sectionLabelTracking = locale !== "ko" ? " tracking-[0.16em]" : "";
  const headingTracking = locale !== "ko" ? " tracking-tight" : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{sectionTitle}</CardTitle>
        <CardDescription>{sectionDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start sm:w-auto">
            <TabsTrigger value="overview">{overviewTabLabel}</TabsTrigger>
            <TabsTrigger value="languages">{languagesTabLabel}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {statusCards.map((card) => (
                <div key={card.label} className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={`mt-2 text-2xl font-semibold${headingTracking}`}>{card.value}</p>
                  {card.description ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{card.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
            {statusFootnote ? (
              <p className="text-sm text-muted-foreground">{statusFootnote}</p>
            ) : null}
          </TabsContent>

          <TabsContent value="languages" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h3 className={`text-sm font-semibold uppercase${sectionLabelTracking} text-muted-foreground`}>
                  {featuredEnvironmentsTitle}
                </h3>
                <p className="text-sm text-muted-foreground">{featuredEnvironmentsDescription}</p>
              </div>
              <Link href={viewAllLanguagesHref}>
                <Button variant="outline" size="sm">{viewAllLanguagesLabel}</Button>
              </Link>
            </div>

            {featuredEnvironments.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featuredEnvironments.map((environment) => (
                  <div key={environment.key} className="rounded-xl border p-4">
                    <div className="space-y-1">
                      <p className={`text-lg font-semibold${headingTracking}`}>{environment.title}</p>
                      <p className="text-sm text-muted-foreground">{environment.runtime}</p>
                    </div>
                    {environment.compiler ? (
                      <p className="mt-3 text-sm font-medium">{environment.compiler}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {environment.variants.map((variant) => (
                        <Badge key={variant} variant="secondary">
                          {variant}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{environment.variantCountLabel}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {noFeaturedLanguagesMessage}
              </p>
            )}

            {additionalLanguagesMessage ? (
              <p className="text-sm text-muted-foreground">{additionalLanguagesMessage}</p>
            ) : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
