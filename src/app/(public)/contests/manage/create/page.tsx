import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { db } from "@/lib/db";
import { groups, problems } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { QuickCreateContestForm } from "@/components/contest/quick-create-contest-form";

export default async function CreateContestPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [t, tCommon] = await Promise.all([
    getTranslations("contests"),
    getTranslations("common"),
  ]);

  const caps = await resolveCapabilities(session.user.role);

  if (!caps.has("contests.create")) {
    redirect("/contests/manage");
  }

  // Get all problems for the problem selector
  const allProblems = await db
    .select({ id: problems.id, title: problems.title })
    .from(problems)
    .orderBy(asc(problems.title));

  // Get groups for group-based creation
  let userGroups;
  if (caps.has("groups.view_all")) {
    userGroups = await db.query.groups.findMany({
      columns: { id: true, name: true, description: true },
      where: eq(groups.isArchived, false),
    });
  } else {
    userGroups = await db.query.groups.findMany({
      columns: { id: true, name: true, description: true },
      where: (g, { and, eq: eqOp }) =>
        and(eqOp(g.instructorId, session.user.id), eqOp(g.isArchived, false)),
    });
  }

  return (
    <div className="space-y-6">
      <Link
        href="/contests/manage"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Link>

      <div>
        <h2 className="text-3xl font-bold">{t("createContest")}</h2>
        <p className="text-muted-foreground">{t("createContestDescription")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <QuickCreateContestForm problems={allProblems} />

        <Card>
          <CardHeader>
            <CardTitle>{t("createFromGroup")}</CardTitle>
            <CardDescription>{t("createFromGroupDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {userGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGroupsForContest")}</p>
            ) : (
              userGroups.map((group) => (
                <Link key={group.id} href={`/groups/${group.id}`}>
                  <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer mb-2">
                    <CardContent className="flex items-center gap-3 py-3 px-4">
                      <Users className="size-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{group.name}</p>
                        {group.description && (
                          <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
