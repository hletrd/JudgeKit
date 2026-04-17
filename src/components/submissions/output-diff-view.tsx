"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeDiff, toSideBySide, type DiffLine, type SideBySidePair } from "@/lib/diff";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type OutputDiffViewProps = {
  expectedOutput: string;
  actualOutput: string;
};

export function OutputDiffView({ expectedOutput, actualOutput }: OutputDiffViewProps) {
  const t = useTranslations("submissions");
  const diffLines = useMemo(() => computeDiff(expectedOutput, actualOutput), [expectedOutput, actualOutput]);
  const sideBySidePairs = useMemo(() => toSideBySide(diffLines), [diffLines]);

  return (
    <Tabs defaultValue="diff">
      <TabsList className="mb-2">
        <TabsTrigger value="diff">{t("diffView")}</TabsTrigger>
        <TabsTrigger value="sideBySide">{t("sideBySideView")}</TabsTrigger>
      </TabsList>

      <TabsContent value="diff">
        <UnifiedDiffView lines={diffLines} />
      </TabsContent>

      <TabsContent value="sideBySide">
        <SideBySideDiffView pairs={sideBySidePairs} />
      </TabsContent>
    </Tabs>
  );
}

function UnifiedDiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="overflow-auto rounded border bg-[var(--code-surface-background)] text-xs font-mono leading-relaxed" style={{ maxHeight: 320 }}>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr
              key={i}
              className={
                line.kind === "add"
                  ? "bg-green-50 dark:bg-green-950/30"
                  : line.kind === "remove"
                    ? "bg-red-50 dark:bg-red-950/30"
                    : ""
              }
            >
              <td className="w-1 select-none whitespace-nowrap border-r px-2 py-0.5 text-right text-muted-foreground">
                {line.oldNo ?? ""}
              </td>
              <td className="w-1 select-none whitespace-nowrap border-r px-2 py-0.5 text-right text-muted-foreground">
                {line.newNo ?? ""}
              </td>
              <td className="w-1 select-none whitespace-nowrap px-1 py-0.5 text-muted-foreground">
                {line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}
              </td>
              <td className="whitespace-pre-wrap break-all px-2 py-0.5">{line.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SideBySideDiffView({ pairs }: { pairs: SideBySidePair[] }) {
  const t = useTranslations("submissions");

  return (
    <div className="overflow-auto rounded border" style={{ maxHeight: 320 }}>
      <div className="grid grid-cols-2 divide-x">
        <div className="bg-[var(--code-surface-background)] p-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("expectedOutput")}</p>
          <table className="w-full border-collapse text-xs font-mono leading-relaxed">
            <tbody>
              {pairs.map((pair, i) => {
                const left = pair.left;
                return (
                  <tr
                    key={i}
                    className={
                      left?.kind === "remove"
                        ? "bg-red-50 dark:bg-red-950/30"
                        : left?.kind === "add"
                          ? "bg-green-50 dark:bg-green-950/30"
                          : ""
                    }
                  >
                    <td className="w-1 select-none whitespace-nowrap px-1 py-0.5 text-right text-muted-foreground">
                      {left?.lineNo ?? ""}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-2 py-0.5">{left?.content ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-[var(--code-surface-background)] p-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("actualOutput")}</p>
          <table className="w-full border-collapse text-xs font-mono leading-relaxed">
            <tbody>
              {pairs.map((pair, i) => {
                const right = pair.right;
                return (
                  <tr
                    key={i}
                    className={
                      right?.kind === "add"
                        ? "bg-green-50 dark:bg-green-950/30"
                        : right?.kind === "remove"
                          ? "bg-red-50 dark:bg-red-950/30"
                          : ""
                    }
                  >
                    <td className="w-1 select-none whitespace-nowrap px-1 py-0.5 text-right text-muted-foreground">
                      {right?.lineNo ?? ""}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-2 py-0.5">{right?.content ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
