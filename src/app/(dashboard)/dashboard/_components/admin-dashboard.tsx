import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Cpu, HardDrive, Clock, MemoryStick } from "lucide-react";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getJudgeLanguageDefinition,
  getDockerImageRuntimeInfo,
  serializeJudgeCommand,
} from "@/lib/judge/languages";
import { getRuntimeSystemInfo } from "@/lib/system-info";
import { getTranslations } from "next-intl/server";

export async function AdminDashboard() {
  const t = await getTranslations("dashboard");
  const tJudge = await getTranslations("judge");
  const tLangs = await getTranslations("languages");

  const [langs, runtimeSystemInfo] = await Promise.all([
    db.select().from(languageConfigs).where(eq(languageConfigs.isEnabled, true)),
    getRuntimeSystemInfo(),
  ]);

  const enabledLanguages = langs.flatMap((language) => {
    const definition = getJudgeLanguageDefinition(language.language);
    if (!definition) return [];
    return [{ id: language.id, definition }];
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("opsOverviewTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Cpu className="size-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("cpuLabel")}</p>
                <p className="text-sm font-medium mb-[3px]">{runtimeSystemInfo.cpu}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <HardDrive className="size-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("osLabel")}</p>
                <p className="text-sm font-medium mb-[3px]">{runtimeSystemInfo.os}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Clock className="size-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("timeLimitLabel")}</p>
                <p className="text-sm font-medium mb-[3px]">{tJudge("defaultTimeLimit")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <MemoryStick className="size-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{tJudge("memoryLimitLabel")}</p>
                <p className="text-sm font-medium mb-[3px]">{tJudge("defaultMemoryLimit")}</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{tJudge("limitsNote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tLangs("title")}</CardTitle>
          <CardDescription>{runtimeSystemInfo.architecture}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead>{tLangs("language")}</TableHead>
                <TableHead>{tLangs("compiler")}</TableHead>
                <TableHead>{tLangs("runtime")}</TableHead>
                <TableHead>{tLangs("compileOptions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enabledLanguages.map(({ id, definition }) => (
                <TableRow key={id}>
                  <TableCell>
                    <Badge variant="secondary">
                      {definition.displayName} {definition.standard ? `(${definition.standard})` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{definition.compiler || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {getDockerImageRuntimeInfo(definition.dockerImage)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {serializeJudgeCommand(definition.compileCommand) || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
