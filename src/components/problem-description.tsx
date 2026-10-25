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
import { extractHiddenNotes, rehypeHiddenNotes, stripHiddenNotes } from "@/lib/problem-hidden-notes";
import { sanitizeHtmlWithHiddenNotes } from "@/lib/security/sanitize-html";
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
  // Detect the format on the description without hidden notes so a note's
  // plain-text body cannot flip the renderer mode.
  const formatProbe = stripHiddenNotes(description);
  const hasHtmlTags = /<(p|h[1-6]|pre|ul|ol|li|table|blockquote|img|div|br|hr)\b/i.test(formatProbe);
  // Markdown markers: ATX headings, setext headings, fenced code, bold/italic
  // pairs, dollar-delimited math, list bullets at line start. Their presence
  // means the document is markdown (possibly with embedded HTML), so we must
  // keep the markdown renderer to process LaTeX/markdown syntax. Switching to
  // raw HTML mode just because a `<br>` or `<div>` exists strips all the
  // markdown/TeX rendering and leaves users seeing literal `$N$`, `### Title`,
  // etc. (cycle 8).
  const hasMarkdownStructure =
    /^#{1,6}\s+\S/m.test(formatProbe)
    || /^[-*+]\s+\S/m.test(formatProbe)
    || /^[ \t]{0,3}>\s+\S/m.test(formatProbe)
    || /^[ \t]*```/m.test(formatProbe)
    || /\*\*[^*\n]+\*\*/.test(formatProbe)
    || /(?<![\\$])\$[^$\n]+\$/.test(formatProbe)
    || /\$\$[\s\S]+?\$\$/.test(formatProbe);
  const looksLikeLegacyHtml = hasHtmlTags && !hasMarkdownStructure;

  if (looksLikeLegacyHtml) {
    return (
      <div
        className={cn("problem-description", className)}
        style={themeStyle}
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlWithHiddenNotes(description) }}
      />
    );
  }

  // `{{hidden: ...}}` notes are swapped for placeholder tokens before markdown
  // parsing (so their body is never parsed as markdown/math/HTML) and turned
  // into invisible `span.problem-hidden-note` elements by rehypeHiddenNotes.
  const { source: markdownSource, notes: hiddenNotes } = extractHiddenNotes(description);

  return (
    <div className={cn("problem-description", className)} style={themeStyle}>
      <ReactMarkdown
        rehypePlugins={[
          [rehypeHiddenNotes, { notes: hiddenNotes }],
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
        {markdownSource}
      </ReactMarkdown>
    </div>
  );
}
