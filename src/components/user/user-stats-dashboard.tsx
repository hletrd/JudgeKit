import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge } from "@/components/tier-badge";
import type { Tier } from "@/lib/ratings";

type TierStat = {
  label: string;
  tier: Tier;
  count: number;
};

type NamedStat = {
  label: string;
  count: number;
};

type ActivityDay = {
  date: string;
  count: number;
};

type UserStatsDashboardProps = {
  title: string;
  difficultyTitle: string;
  categoryTitle: string;
  languageTitle: string;
  activityTitle: string;
  emptyLabel: string;
  locale?: string;
  tierStats: TierStat[];
  categoryStats: NamedStat[];
  languageStats: NamedStat[];
  activityDays: ActivityDay[];
};

function activityLevel(count: number) {
  if (count <= 0) return "bg-muted";
  if (count === 1) return "bg-emerald-200 dark:bg-emerald-900";
  if (count <= 3) return "bg-emerald-400 dark:bg-emerald-700";
  if (count <= 6) return "bg-emerald-500 dark:bg-emerald-600";
  return "bg-emerald-600 dark:bg-emerald-500";
}

export function UserStatsDashboard({
  title,
  difficultyTitle,
  categoryTitle,
  languageTitle,
  activityTitle,
  emptyLabel,
  locale,
  tierStats,
  categoryStats,
  languageStats,
  activityDays,
}: UserStatsDashboardProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold${locale && locale !== "ko" ? " tracking-tight" : ""}`}>{title}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{difficultyTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {tierStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              tierStats.map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <TierBadge tier={stat.tier} label={stat.label} />
                  <span className="text-sm font-medium">{stat.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{categoryTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {categoryStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              categoryStats.map((stat) => (
                <Badge key={stat.label} variant="outline" className="gap-2 px-3 py-1.5">
                  <span>{stat.label}</span>
                  <span className="font-semibold">{stat.count}</span>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{languageTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {languageStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              languageStats.map((stat) => (
                <Badge key={stat.label} variant="secondary" className="gap-2 px-3 py-1.5">
                  <span>{stat.label}</span>
                  <span className="font-semibold">{stat.count}</span>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{activityTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <div className="grid grid-cols-13 gap-1">
              {activityDays.map((day) => (
                <div
                  key={day.date}
                  className={`aspect-square rounded-sm ${activityLevel(day.count)}`}
                  title={`${day.date}: ${day.count}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
