import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { tags, problemTags } from "@/lib/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { redirect } from "next/navigation";
import { formatDateInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import AddTagDialog from "./add-tag-dialog";
import EditTagDialog from "./edit-tag-dialog";
import DeleteTagDialog from "./delete-tag-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.tags");
  return { title: t("title") };
}

export default async function TagManagementPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) redirect("/dashboard");

  const t = await getTranslations("admin.tags");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();

  const tagList = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      problemCount: count(problemTags.id),
    })
    .from(tags)
    .leftJoin(problemTags, eq(tags.id, problemTags.tagId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <AddTagDialog />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.problemCount")}</TableHead>
                  <TableHead>{t("table.created")}</TableHead>
                  <TableHead>{tCommon("action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tagList.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {tag.color && (
                          <span
                            className="inline-block size-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        {tag.name}
                      </div>
                    </TableCell>
                    <TableCell>{tag.problemCount}</TableCell>
                    <TableCell>
                      {tag.createdAt ? formatDateInTimeZone(tag.createdAt, locale, timeZone) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 items-center">
                        <EditTagDialog tag={{ id: tag.id, name: tag.name, color: tag.color }} />
                        <DeleteTagDialog
                          tagId={tag.id}
                          tagName={tag.name}
                          problemCount={tag.problemCount}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {tagList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t("noTags")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
