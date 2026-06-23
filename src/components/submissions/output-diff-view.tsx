"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { canComputeRichDiff, computeDiff, toSideBySide, type DiffLine, type SideBySidePair } from "@/lib/diff";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type OutputDiffViewProps = {
  expectedOutput: string;
  actualOutput: string;
};

export function OutputDiffView({ expectedOutput, actualOutput }: OutputDiffViewProps) {
  const t = useTranslations("submissions");
  const richDiffAvailable = useMemo(
    () => canComputeRichDiff(expectedOutput, actualOutput),
    [expectedOutput, actualOutput],
  );
  const diffLines = useMemo(
    () => richDiffAvailable ? computeDiff(expectedOutput, actualOutput) : [],
    [actualOutput, expectedOutput, richDiffAvailable],
  );
  const sideBySidePairs = useMemo(() => toSideBySide(diffLines), [diffLines]);

  if (!richDiffAvailable) {
    return <LargeOutputDiffFallback expectedOutput={expectedOutput} actualOutput={actualOutput} />;
  }

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

function LargeOutputDiffFallback({ expectedOutput, actualOutput }: OutputDiffViewProps) {
  const t = useTranslations("submissions");

  return (
    <div className="space-y-3 rounded border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-medium">{t("diffTooLargeTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("diffTooLargeDescription")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <OutputPreview title={t("expectedOutput")} value={expectedOutput} />
        <OutputPreview title={t("actualOutput")} value={actualOutput} />
      </div>
    </div>
  );
}

function OutputPreview({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-80 overflow-auto rounded border bg-[var(--code-surface-background)] p-2 text-xs leading-relaxed whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}

function UnifiedDiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="overflow-auto rounded border bg-[var(--code-surface-background)] text-xs font-mono leading-relaxed" style={{ maxHeight: 320 }}>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line) => (
            <tr
              key={`old-${line.oldNo ?? "n"}-new-${line.newNo ?? "n"}`}
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
              {pairs.map((pair) => {
                const left = pair.left;
                return (
                  <tr
                    key={`left-${left?.lineNo ?? "n"}-${left?.kind ?? "n"}-${left?.content?.slice(0, 20) ?? ""}`}
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
                    <td className="w-1 select-none whitespace-nowrap px-1 py-0.5 text-muted-foreground">
                      {left?.kind === "remove" ? "-" : left?.kind === "add" ? "+" : " "}
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
              {pairs.map((pair) => {
                const right = pair.right;
                return (
                  <tr
                    key={`right-${right?.lineNo ?? "n"}-${right?.kind ?? "n"}-${right?.content?.slice(0, 20) ?? ""}`}
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
                    <td className="w-1 select-none whitespace-nowrap px-1 py-0.5 text-muted-foreground">
                      {right?.kind === "add" ? "+" : right?.kind === "remove" ? "-" : " "}
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
