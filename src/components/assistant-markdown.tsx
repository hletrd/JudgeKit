import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CopyCodeButton } from "@/components/code/copy-code-button";
import { cn } from "@/lib/utils";
import "katex/dist/katex.min.css";

type AssistantMarkdownProps = {
  className?: string;
  content: string;
};

const ASSISTANT_CODE_COPY_BUTTON_CLEARANCE = "3rem";

function getCodeBlockText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getCodeBlockText(child.props.children);
      }

      return "";
    })
    .join("");
}

export function AssistantMarkdown({ className, content }: AssistantMarkdownProps) {
  return (
    <div className={cn("problem-description", className)}>
      <ReactMarkdown
        rehypePlugins={[
          rehypeHighlight,
          // Same hardening as ProblemDescription — strict mode + capped macro
          // expansion so an LLM-emitted nested \hbox cannot DoS the render.
          [rehypeKatex, { strict: true, maxExpand: 100 }],
        ]}
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        skipHtml
        components={{
          pre: ({ children, node, ...props }) => {
            void node;
            const copyValue = getCodeBlockText(children).replace(/\n$/, "");

            return (
              <div className="problem-code-block">
                {copyValue ? <CopyCodeButton value={copyValue} /> : null}
                <pre
                  {...props}
                  style={{
                    ...props.style,
                    paddingRight: copyValue ? ASSISTANT_CODE_COPY_BUTTON_CLEARANCE : props.style?.paddingRight,
                  }}
                >
                  {children}
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
