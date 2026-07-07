export type ProblemStatementBlock = {
  type: "markdown" | "structured";
  kind?: "input" | "output" | "example_input" | "example_output";
  title?: string;
  content: string;
};

function normalizeHeadingTitle(rawTitle: string) {
  return rawTitle.trim().replace(/:+$/, "").replace(/\s+/g, " ").toLowerCase();
}

function getStructuredBlockKind(rawTitle: string): ProblemStatementBlock["kind"] | null {
  const normalized = normalizeHeadingTitle(rawTitle);

  if (/^(input|입력|input format|입력 형식)$/.test(normalized)) {
    return "input";
  }

  if (/^(output|출력|output format|출력 형식)$/.test(normalized)) {
    return "output";
  }

  if (/^(example input(?:\s*\d+)?|sample input(?:\s*\d+)?|예제 입력(?:\s*\d+)?)$/.test(normalized)) {
    return "example_input";
  }

  if (/^(example output(?:\s*\d+)?|sample output(?:\s*\d+)?|예제 출력(?:\s*\d+)?)$/.test(normalized)) {
    return "example_output";
  }

  return null;
}

export function parseProblemStatementBlocks(description: string): ProblemStatementBlock[] {
  const lines = description.split("\n");
  const blocks: ProblemStatementBlock[] = [];
  let markdownLines: string[] = [];
  let structuredBlock: ProblemStatementBlock | null = null;

  const flushMarkdown = () => {
    const content = markdownLines.join("\n").trim();
    if (content) {
      blocks.push({ type: "markdown", content });
    }
    markdownLines = [];
  };

  const flushStructured = () => {
    if (!structuredBlock) return;
    blocks.push({
      ...structuredBlock,
      content: structuredBlock.content.trim(),
    });
    structuredBlock = null;
  };

  // Code-fence tracking (RPF cycle-1 PR-M4): `#`-prefixed lines inside a
  // ``` / ~~~ fence are code (e.g. Python comments, shell prompts), not
  // section headings. Without this, a fenced `# Input` line split the
  // statement mid-code-block and corrupted the rendered problem.
  let insideFence = false;

  for (const line of lines) {
    const isFenceDelimiter = /^\s{0,3}(?:`{3,}|~{3,})/.test(line);
    if (isFenceDelimiter) {
      insideFence = !insideFence;
    }

    const headingMatch =
      insideFence || isFenceDelimiter
        ? null
        : line.match(/^(#{1,6})\s+(.+?)\s*$/);
    const structuredKind = headingMatch ? getStructuredBlockKind(headingMatch[2]) : null;

    if (structuredKind && headingMatch) {
      flushMarkdown();
      flushStructured();
      structuredBlock = {
        type: "structured",
        kind: structuredKind,
        title: headingMatch[2].trim().replace(/:+$/, ""),
        content: "",
      };
      continue;
    }

    if (headingMatch && structuredBlock) {
      flushStructured();
      markdownLines.push(line);
      continue;
    }

    if (structuredBlock) {
      structuredBlock.content = structuredBlock.content
        ? `${structuredBlock.content}\n${line}`
        : line;
      continue;
    }

    markdownLines.push(line);
  }

  flushStructured();
  flushMarkdown();

  return blocks.length > 0 ? blocks : [{ type: "markdown", content: description }];
}
