import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getContestStatusBorderClass } from "./contest-status-styles";

type PublicContestListProps = {
  title: string;
  description: string;
  noContestsLabel: string;
  archiveTitle: string;
  locale: string;
  contests: Array<{
    id: string;
    href: string;
    title: string;
    description: string | null;
    groupName: string;
    statusLabel: string;
    statusKey: "upcoming" | "open" | "in_progress" | "expired" | "closed";
    problemCountLabel: string;
    publicProblemCountLabel: string;
    modeLabel: string;
    modeKey: "scheduled" | "windowed";
    scoringLabel: string;
    scoringKey: "ioi" | "icpc";
    archiveGroupLabel: string;
    startsAtLabel: string;
    deadlineLabel: string;
  }>;
};

export function PublicContestList({
  title,
  description,
  noContestsLabel,
  archiveTitle,
  locale,
  contests,
}: PublicContestListProps) {
  // Per CLAUDE.md: Korean text must use default letter-spacing.
  const headingTracking = locale !== "ko" ? " tracking-tight" : "";
  const labelTracking = locale !== "ko" ? " tracking-wide" : "";
  const activeContests = contests.filter((c) => c.statusKey !== "expired" && c.statusKey !== "closed");
  const archivedContests = contests.filter((c) => c.statusKey === "expired" || c.statusKey === "closed");
  const archivedContestGroups = Array.from(
    archivedContests.reduce((groups, contest) => {
      const existing = groups.get(contest.archiveGroupLabel) ?? [];
      existing.push(contest);
      groups.set(contest.archiveGroupLabel, existing);
      return groups;
    }, new Map<string, typeof archivedContests>()),
  ).sort(([left], [right]) => right.localeCompare(left, undefined, { numeric: true }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-semibold${headingTracking}`}>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {contests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{noContestsLabel}</CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {activeContests.map((contest) => (
              <Link key={contest.id} href={contest.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Card className={getContestStatusBorderClass(contest.statusKey)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="truncate font-medium">{contest.title}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                          <span>{contest.groupName}</span>
                          <span>·</span>
                          <span>{contest.problemCountLabel}</span>
                          <span>·</span>
                          <span>{contest.publicProblemCountLabel}</span>
                          <span>·</span>
                          <span>{contest.startsAtLabel}</span>
                          <span>·</span>
                          <span>{contest.deadlineLabel}</span>
                        </div>
                        {contest.description ? (
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{contest.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{contest.statusLabel}</Badge>
                        <Badge className={`text-xs ${contest.modeKey === "windowed" ? "bg-purple-600 text-white dark:bg-purple-500" : "bg-blue-600 text-white dark:bg-blue-500"}`}>
                          {contest.modeLabel}
                        </Badge>
                        <Badge className={`text-xs ${contest.scoringKey === "icpc" ? "bg-orange-600 text-white dark:bg-orange-500" : "bg-teal-600 text-white dark:bg-teal-500"}`}>
                          {contest.scoringLabel}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {archivedContests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-muted-foreground">{archiveTitle}</h2>
              {archivedContestGroups.map(([groupLabel, groupedContests]) => (
                <div key={groupLabel} className="space-y-2">
                  <h3 className={`text-sm font-semibold uppercase${labelTracking} text-muted-foreground`}>{groupLabel}</h3>
                  <div className="space-y-2">
                    {groupedContests.map((contest) => (
                      <Link key={contest.id} href={contest.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Card className={getContestStatusBorderClass(contest.statusKey)}>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="truncate font-medium">{contest.title}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                                  <span>{contest.groupName}</span>
                                  <span>·</span>
                                  <span>{contest.problemCountLabel}</span>
                                  <span>·</span>
                                  <span>{contest.publicProblemCountLabel}</span>
                                  <span>·</span>
                                  <span>{contest.startsAtLabel}</span>
                                  <span>·</span>
                                  <span>{contest.deadlineLabel}</span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge variant="outline">{contest.statusLabel}</Badge>
                                <Badge className={`text-xs ${contest.modeKey === "windowed" ? "bg-purple-600 text-white dark:bg-purple-500" : "bg-blue-600 text-white dark:bg-blue-500"}`}>
                                  {contest.modeLabel}
                                </Badge>
                                <Badge className={`text-xs ${contest.scoringKey === "icpc" ? "bg-orange-600 text-white dark:bg-orange-500" : "bg-teal-600 text-white dark:bg-teal-500"}`}>
                                  {contest.scoringLabel}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
