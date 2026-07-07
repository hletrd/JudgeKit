import { describe, expect, it } from "vitest";
import { parseProblemStatementBlocks } from "@/lib/problem-statement";

describe("parseProblemStatementBlocks", () => {
  it("extracts input, output, and example sections while keeping introductory markdown", () => {
    const blocks = parseProblemStatementBlocks(`문제 설명입니다.

## 입력
첫 줄에 N이 주어진다.

## 출력
정답을 출력한다.

### 예제 입력 1
\`\`\`
1
\`\`\`

### 예제 출력 1
\`\`\`
2
\`\`\`
`);

    expect(blocks).toEqual([
      expect.objectContaining({ type: "markdown", content: "문제 설명입니다." }),
      expect.objectContaining({ type: "structured", kind: "input", title: "입력", content: "첫 줄에 N이 주어진다." }),
      expect.objectContaining({ type: "structured", kind: "output", title: "출력", content: "정답을 출력한다." }),
      expect.objectContaining({ type: "structured", kind: "example_input", title: "예제 입력 1" }),
      expect.objectContaining({ type: "structured", kind: "example_output", title: "예제 출력 1" }),
    ]);
  });

  it("ignores # lines inside code fences (fence-aware parsing)", () => {
    // RPF cycle-1 PR-M4: a `# Input`-looking line inside a ``` fence is code
    // (Python comment / shell prompt), not a section heading. The parser
    // previously split the statement mid-code-block.
    const blocks = parseProblemStatementBlocks(`Intro text.

\`\`\`python
# Input
x = int(input())
\`\`\`

## Input
One integer x.`);

    expect(blocks).toEqual([
      {
        type: "markdown",
        content: "Intro text.\n\n```python\n# Input\nx = int(input())\n```",
      },
      expect.objectContaining({
        type: "structured",
        kind: "input",
        title: "Input",
        content: "One integer x.",
      }),
    ]);
  });

  it("treats non-matching headings as regular markdown content", () => {
    const blocks = parseProblemStatementBlocks(`# 제목

## 접근 방법
정렬 후 탐색한다.`);

    expect(blocks).toEqual([
      {
        type: "markdown",
        content: "# 제목\n\n## 접근 방법\n정렬 후 탐색한다.",
      },
    ]);
  });
});
