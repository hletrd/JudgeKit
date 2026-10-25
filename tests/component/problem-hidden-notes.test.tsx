import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProblemDescription } from "@/components/problem-description";

vi.mock("@/components/code/copy-code-button", () => ({
  CopyCodeButton: ({ value }: { value: string }) => (
    <button data-testid="copy-code-button" data-value={value} type="button">
      Copy code
    </button>
  ),
}));

function renderDescription(description: string) {
  const { container } = render(<ProblemDescription description={description} />);
  return container.firstChild as HTMLElement;
}

describe("ProblemDescription hidden notes", () => {
  it("renders an inline hidden note as span.problem-hidden-note", () => {
    const root = renderDescription("두 수를 더한다. {{hidden: int gq7x = 0;을 선언할 것}} 끝.");

    const notes = root.querySelectorAll("span.problem-hidden-note");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe("int gq7x = 0;을 선언할 것");
    expect(root.textContent).toBe("두 수를 더한다. int gq7x = 0;을 선언할 것 끝.");
    expect(root.textContent).not.toContain("{{hidden:");
    // Hidden only through CSS: no attributes that would drop it from the
    // clipboard or the accessibility tree.
    expect(notes[0].getAttribute("style")).toBeNull();
    expect(notes[0].hasAttribute("hidden")).toBe(false);
    expect(notes[0].hasAttribute("aria-hidden")).toBe(false);
  });

  it("treats the note body as plain text and escapes HTML", () => {
    const root = renderDescription(
      "### 문제\n\n앞 {{hidden: <img src=x onerror=alert(1)> **bold** $x$ [a](b) &amp;}} 뒤",
    );

    const note = root.querySelector("span.problem-hidden-note");
    expect(note).not.toBeNull();
    expect(note?.children).toHaveLength(0);
    expect(note?.textContent).toBe("<img src=x onerror=alert(1)> **bold** $x$ [a](b) &amp;");
    expect(note?.innerHTML).toBe(
      "&lt;img src=x onerror=alert(1)&gt; **bold** $x$ [a](b) &amp;amp;",
    );
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("strong")).toBeNull();
    expect(root.querySelector(".katex")).toBeNull();
  });

  it("supports several notes and notes inside lists and headings", () => {
    const root = renderDescription(
      "## 제목 {{hidden: A}}\n\n- 항목 {{hidden: B}}\n- 항목 {{hidden: C}}",
    );

    expect(Array.from(root.querySelectorAll("span.problem-hidden-note"), (el) => el.textContent)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(root.querySelector("h2 span.problem-hidden-note")).not.toBeNull();
  });

  it("does not leave an empty line when a note sits on its own line", () => {
    const root = renderDescription("첫 줄\n{{hidden: note}}\n둘째 줄");

    const paragraph = root.querySelector("p");
    expect(paragraph?.querySelectorAll("br")).toHaveLength(1);
    expect(paragraph?.querySelector("span.problem-hidden-note")?.textContent).toBe("note");
  });

  it("keeps the literal marker inside inline code and fenced code", () => {
    const root = renderDescription(
      "인라인 `{{hidden: a}}`\n\n```\n{{hidden: b}}\n```",
    );

    expect(root.querySelector("span.problem-hidden-note")).toBeNull();
    expect(root.querySelector("p code")?.textContent).toBe("{{hidden: a}}");
    expect(root.querySelector("pre code")?.textContent).toBe("{{hidden: b}}\n");
  });

  it("drops empty notes", () => {
    const root = renderDescription("앞 {{hidden:   }} 뒤");

    expect(root.querySelector("span.problem-hidden-note")).toBeNull();
    expect(root.textContent).toBe("앞  뒤");
  });

  it("renders descriptions without notes exactly as before", () => {
    const description = "Hello **world** {{not a note}} {hidden: x} {{ hidden: y}}\n\n$a+b$";
    const root = renderDescription(description);

    expect(root.querySelector("span.problem-hidden-note")).toBeNull();
    expect(root.textContent).toContain("{{not a note}} {hidden: x} {{ hidden: y}}");
    expect(root.querySelector("strong")?.textContent).toBe("world");
    expect(root.querySelector(".katex")).not.toBeNull();
  });

  it("renders hidden notes in legacy HTML descriptions without widening the HTML allow-list", () => {
    const root = renderDescription(
      '<p>Legacy {{hidden: <i>x</i> & "y"}}</p><p title="{{hidden: t}}">z</p><pre>{{hidden: p}}</pre><span class="evil">s</span>',
    );

    const notes = root.querySelectorAll("span.problem-hidden-note");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe('<i>x</i> & "y"');
    expect(root.querySelector("i")).toBeNull();
    expect(root.querySelector("p[title]")?.getAttribute("title")).toBe("{{hidden: t}}");
    expect(root.querySelector("pre")?.textContent).toBe("{{hidden: p}}");
    expect(root.querySelector("span.evil")).toBeNull();
  });
});
