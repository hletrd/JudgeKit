import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type PublicContestListProps = {
  title: string;
  description: string;
  noContestsLabel: string;
  contests: Array<{
    id: string;
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
    startsAtLabel: string;
    deadlineLabel: string;
  }>;
};

function getStatusBorderClass(status: PublicContestListProps["contests"][number]["statusKey"]) {
  switch (status) {
    case "upcoming":
      return "border-l-4 border-l-blue-500";
    case "open":
    case "in_progress":
      return "border-l-4 border-l-green-500";
    case "expired":
    case "closed":
      return "border-l-4 border-l-gray-400";
  }
}

export function PublicContestList({
  title,
  description,
  noContestsLabel,
  contests,
}: PublicContestListProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {contests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{noContestsLabel}</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contests.map((contest) => (
            <Link key={contest.id} href={`/contests/${contest.id}`} className="block">
              <Card className={getStatusBorderClass(contest.statusKey)}>
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
                      <Badge className={`text-xs ${contest.modeKey === "windowed" ? "bg-purple-500 text-white" : "bg-blue-500 text-white"}`}>
                        {contest.modeLabel}
                      </Badge>
                      <Badge className={`text-xs ${contest.scoringKey === "icpc" ? "bg-orange-500 text-white" : "bg-teal-500 text-white"}`}>
                        {contest.scoringLabel}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
