import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProblemDescription } from "@/components/problem-description";

// Mock react-markdown to render children as plain text in a div
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="react-markdown">{children}</div>
  ),
}));

// Mock rehype/remark plugins as identity functions (they're just passed as props)
vi.mock("rehype-highlight", () => ({ default: () => {} }));
vi.mock("remark-breaks", () => ({ default: () => {} }));
vi.mock("remark-gfm", () => ({ default: () => {} }));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const mockSanitizeHtml = vi.fn((html: string) => `sanitized:${html}`);
vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeHtml: (html: string) => mockSanitizeHtml(html),
}));

describe("ProblemDescription", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-establish the mock after restoreAllMocks
    mockSanitizeHtml.mockImplementation((html: string) => `sanitized:${html}`);
  });

  it("renders markdown description text via ReactMarkdown", () => {
    render(<ProblemDescription description="Hello **world**" />);
    expect(screen.getByTestId("react-markdown")).toBeInTheDocument();
    expect(screen.getByTestId("react-markdown")).toHaveTextContent("Hello **world**");
  });

  it("applies className to the container element", () => {
    const { container } = render(
      <ProblemDescription description="Some text" className="my-custom-class" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("my-custom-class");
    expect(wrapper.className).toContain("problem-description");
  });

  it("uses sanitized HTML path when legacyHtmlDescription matches trimmed description", () => {
    const html = "<p>Hello world</p>";
    const { container } = render(
      <ProblemDescription
        description={html}
        legacyHtmlDescription={html}
      />
    );
    // Should NOT render ReactMarkdown
    expect(screen.queryByTestId("react-markdown")).not.toBeInTheDocument();
    // Should render via dangerouslySetInnerHTML with sanitized output
    expect(container.firstChild).toHaveAttribute("class", expect.stringContaining("problem-description"));
  });

  it("calls sanitizeHtml for legacy HTML content", () => {
    const html = "<p>Legacy content</p>";
    render(
      <ProblemDescription
        description={html}
        legacyHtmlDescription={html}
      />
    );
    expect(mockSanitizeHtml).toHaveBeenCalledWith(html);
  });

  it("uses ReactMarkdown when legacyHtmlDescription does not match description", () => {
    render(
      <ProblemDescription
        description="# Markdown Title"
        legacyHtmlDescription="<h1>HTML Title</h1>"
      />
    );
    expect(screen.getByTestId("react-markdown")).toBeInTheDocument();
  });

  it("uses ReactMarkdown when legacyHtmlDescription is null", () => {
    render(
      <ProblemDescription
        description="Some markdown"
        legacyHtmlDescription={null}
      />
    );
    expect(screen.getByTestId("react-markdown")).toBeInTheDocument();
  });

  it("uses ReactMarkdown when legacyHtmlDescription is undefined", () => {
    render(<ProblemDescription description="Some markdown" />);
    expect(screen.getByTestId("react-markdown")).toBeInTheDocument();
  });

  it("applies className to container in legacy HTML mode", () => {
    const html = "<p>Legacy</p>";
    const { container } = render(
      <ProblemDescription
        description={html}
        legacyHtmlDescription={html}
        className="extra-class"
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("extra-class");
  });
});
