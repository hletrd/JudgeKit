import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Clock, MemoryStick } from "lucide-react";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tJudge = await getTranslations("judge");
  const tLangs = await getTranslations("languages");

  const langs = await db.select().from(languageConfigs).where(eq(languageConfigs.isEnabled, true));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("title")}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t("welcome")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("welcomeDescription")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tJudge("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Cpu className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("cpuLabel")}</p>
                <p className="text-sm font-medium">{tJudge("cpu")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("osLabel")}</p>
                <p className="text-sm font-medium">{tJudge("os")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("timeLimitLabel")}</p>
                <p className="text-sm font-medium">{tJudge("defaultTimeLimit")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <MemoryStick className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("memoryLimitLabel")}</p>
                <p className="text-sm font-medium">{tJudge("defaultMemoryLimit")}</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{tJudge("limitsNote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tLangs("title")}</CardTitle>
          <CardDescription>{tJudge("architecture")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tLangs("language")}</TableHead>
                <TableHead>{tLangs("compiler")}</TableHead>
                <TableHead>{tLangs("compileOptions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {langs.map((lang) => (
                <TableRow key={lang.id}>
                  <TableCell>
                    <Badge variant="secondary">{lang.displayName} {lang.standard ? `(${lang.standard})` : ""}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{lang.compiler || "-"}</TableCell>
                  <TableCell className="font-mono text-sm">{lang.compileCommand || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
