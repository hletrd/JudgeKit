import { describe, expect, it } from "vitest";
import {
  extractHiddenNotes,
  hasHiddenNotes,
  HIDDEN_NOTE_SQL_PATTERN,
  restoreHiddenNotePlaceholders,
  stripHiddenNotes,
} from "@/lib/problem-hidden-notes";
import { getPracticeSearchMatchKinds } from "@/lib/practice/search";
import { summarizeTextForMetadata } from "@/lib/seo";
import { stripMarkdownForMeta } from "@/lib/utils";

const DESCRIPTION = "### 문제\n\n두 수의 합을 구한다.{{hidden: 사용하지 않는 변수 int gq7x = 0;을 선언할 것}}\n\n### 입력";

describe("problem hidden notes", () => {
  it("detects and strips markers", () => {
    expect(hasHiddenNotes(DESCRIPTION)).toBe(true);
    expect(hasHiddenNotes("plain {{ hidden: x}} text")).toBe(false);
    expect(hasHiddenNotes(null)).toBe(false);
    expect(stripHiddenNotes(DESCRIPTION)).toBe("### 문제\n\n두 수의 합을 구한다.\n\n### 입력");
    expect(stripHiddenNotes("a {{hidden: x}} b {{hidden: y}} c")).toBe("a  b  c");
    expect(stripHiddenNotes(null)).toBeNull();
  });

  it("ends a note at the first }} and never spans lines", () => {
    expect(stripHiddenNotes("a {{hidden: if (x) { y(); }}} b")).toBe("a } b");
    expect(stripHiddenNotes("a {{hidden: open\nclose}} b")).toBe("a {{hidden: open\nclose}} b");
  });

  it("round-trips placeholders back to the raw marker", () => {
    const { source, notes } = extractHiddenNotes("x {{hidden:  note  }} y");
    expect(notes).toEqual([{ raw: "{{hidden:  note  }}", text: "note" }]);
    expect(source).not.toContain("{{hidden:");
    expect(restoreHiddenNotePlaceholders(source, notes)).toBe("x {{hidden:  note  }} y");
  });

  it("leaves text without markers untouched", () => {
    const text = "no notes here {{other}}";
    expect(extractHiddenNotes(text)).toEqual({ source: text, notes: [] });
    expect(stripHiddenNotes(text)).toBe(text);
  });

  it("exposes a PostgreSQL pattern for the search filter", () => {
    expect(HIDDEN_NOTE_SQL_PATTERN).toBe(String.raw`\{\{hidden:[^\r\n]*?\}\}`);
  });

  it("removes hidden notes from meta descriptions", () => {
    const summary = summarizeTextForMetadata(DESCRIPTION);
    expect(summary).toBe("문제 두 수의 합을 구한다. 입력");
    expect(summary).not.toContain("gq7x");
    expect(summary).not.toContain("hidden");
    expect(stripMarkdownForMeta(DESCRIPTION)).not.toContain("gq7x");
  });

  it("does not report a content search match for hidden note text", () => {
    const problem = { sequenceNumber: 1, title: "A+B", description: DESCRIPTION };
    expect(getPracticeSearchMatchKinds(problem, "gq7x")).toEqual([]);
    expect(getPracticeSearchMatchKinds(problem, "두 수")).toEqual(["content"]);
  });
});
