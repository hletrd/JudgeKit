import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { CopyCodeButton } from "@/components/code/copy-code-button";
import { getProblemCodeThemeStyle } from "@/lib/code/problem-code-themes";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { cn } from "@/lib/utils";

type ProblemDescriptionProps = {
  className?: string;
  description: string;
  editorTheme?: string | null;
};

const PROBLEM_CODE_COPY_BUTTON_CLEARANCE = "3rem";

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
  editorTheme,
}: ProblemDescriptionProps) {
  const themeStyle = getProblemCodeThemeStyle(editorTheme);
  const looksLikeLegacyHtml = /<(p|h[1-6]|pre|ul|ol|li|table|blockquote|img|div|br|hr)\b/i.test(description);

  if (looksLikeLegacyHtml) {
    return (
      <div
        className={cn("problem-description", className)}
        style={themeStyle}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
      />
    );
  }

  return (
    <div className={cn("problem-description", className)} style={themeStyle}>
      <ReactMarkdown
        rehypePlugins={[
          rehypeHighlight,
          // strict: throw on unrecognised macros / commands so a malicious
          // problem statement cannot smuggle nested constructs that DoS the
          // server-side render. maxExpand caps macro expansion to keep
          // worst-case render time bounded.
          [rehypeKatex, { strict: true, maxExpand: 100 }],
        ]}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
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
                <pre
                  {...props}
                  style={{
                    ...props.style,
                    paddingRight: copyValue ? PROBLEM_CODE_COPY_BUTTON_CLEARANCE : props.style?.paddingRight,
                  }}
                >
                  {children}
                </pre>
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
