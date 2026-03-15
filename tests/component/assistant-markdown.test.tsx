import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantMarkdown } from "@/components/assistant-markdown";

describe("AssistantMarkdown", () => {
  it("renders markdown formatting and hard line breaks", () => {
    const { container } = render(
      <AssistantMarkdown content={"**Bold text**\nnext line"} />
    );

    expect(screen.getByText("Bold text", { selector: "strong" })).toBeInTheDocument();
    expect(container.querySelector("br")).not.toBeNull();
    expect(screen.getByText("next line")).toBeInTheDocument();
  });

  it("skips raw html instead of rendering or escaping it", () => {
    const { container } = render(
      <AssistantMarkdown content={'Before <img src="x" alt="raw-html" /> after'} />
    );

    expect(screen.queryByAltText("raw-html")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("<img");
    expect(container).toHaveTextContent("Before after");
  });
});
