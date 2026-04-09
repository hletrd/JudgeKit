import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemDescription } from "@/components/problem-description";

vi.mock("@/components/code/copy-code-button", () => ({
  CopyCodeButton: ({ value }: { value: string }) => (
    <button data-testid="copy-code-button" data-value={value} type="button">
      Copy code
    </button>
  ),
}));

describe("ProblemDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders markdown content", () => {
    render(<ProblemDescription description="Hello **world**" />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("world", { selector: "strong" })).toBeInTheDocument();
  });

  it("applies className to the container element", () => {
    const { container } = render(
      <ProblemDescription description="Some text" className="my-custom-class" />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("my-custom-class");
    expect(wrapper.className).toContain("problem-description");
  });

  it("renders a copy button for markdown code blocks", () => {
    const { container } = render(
      <ProblemDescription description={"```js\nconst answer = 42;\n```"} />
    );

    expect(container.querySelector("code")?.textContent).toBe("const answer = 42;\n");
    expect(screen.getByTestId("copy-code-button")).toHaveAttribute(
      "data-value",
      "const answer = 42;"
    );
  });

  it("renders HTML content safely through ReactMarkdown", () => {
    const html = "<p>Hello world</p>";
    render(<ProblemDescription description={html} />);

    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Hello world").tagName).toBe("P");
  });

  it("renders markdown headings", () => {
    render(<ProblemDescription description="# Markdown Title" />);

    expect(screen.getByText("Markdown Title", { selector: "h1" })).toBeInTheDocument();
  });

  it("applies className to container", () => {
    const { container } = render(
      <ProblemDescription description="Some markdown" className="extra-class" />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("extra-class");
  });
});
