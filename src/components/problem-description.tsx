import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { CopyCodeButton } from "@/components/code/copy-code-button";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { cn } from "@/lib/utils";
type ProblemDescriptionProps = {
  className?: string;
  description: string;
};

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

export function ProblemDescription({
  className,
  description,
}: ProblemDescriptionProps) {
  const looksLikeLegacyHtml = /<(p|h[1-6]|pre|ul|ol|li|table|blockquote|img|div|br|hr)\b/i.test(description);

  if (looksLikeLegacyHtml) {
    return (
      <div
        className={cn("problem-description", className)}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
      />
    );
  }

  return (
    <div className={cn("problem-description", className)}>
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              className="font-medium text-foreground underline underline-offset-4"
              rel="noreferrer noopener"
              target="_blank"
            />
          ),
          pre: ({ children, node, ...props }) => {
            void node;
            const copyValue = getCodeBlockText(children).replace(/\n$/, "");

            return (
              <div className="problem-code-block">
                {copyValue ? <CopyCodeButton value={copyValue} /> : null}
                <pre {...props}>{children}</pre>
              </div>
            );
          },
        }}
      >
        {description}
      </ReactMarkdown>
    </div>
  );
}
