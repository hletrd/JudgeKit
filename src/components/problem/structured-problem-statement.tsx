import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProblemDescription } from "@/components/problem-description";
import { parseProblemStatementBlocks } from "@/lib/problem-statement";
import { cn } from "@/lib/utils";

type StructuredProblemStatementProps = {
  className?: string;
  description: string;
  editorTheme?: string | null;
};

export function StructuredProblemStatement({
  className,
  description,
  editorTheme,
}: StructuredProblemStatementProps) {
  const blocks = parseProblemStatementBlocks(description);

  return (
    <div className={cn("space-y-4", className)}>
      {blocks.map((block) => {
        if (block.type === "markdown") {
          return (
            <ProblemDescription
              key={`markdown-${block.content.length}-${block.content.slice(0, 40)}`}
              description={block.content}
              editorTheme={editorTheme}
            />
          );
        }

        return (
          <Card key={`structured-${block.kind}-${block.title}-${block.content.length}-${block.content.slice(0, 40)}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{block.title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ProblemDescription
                description={block.content}
                editorTheme={editorTheme}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
