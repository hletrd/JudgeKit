import dynamic from "next/dynamic";
import { CodeEditorSkeleton } from "./code-editor-skeleton";
import { RAW_TEXTAREA_LANGUAGES } from "@/lib/code/language-map";
import { cn } from "@/lib/utils";
import { CopyCodeButton } from "./copy-code-button";

const CodeSurface = dynamic(
  () => import("./code-surface").then((m) => ({ default: m.CodeSurface })),
  { ssr: false, loading: () => <CodeEditorSkeleton minHeight={180} /> }
);

type CodeViewerProps = {
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  id?: string;
  language?: string | null;
  minHeight?: number;
  tone?: "default" | "danger";
  value: string;
};

export function CodeViewer(props: CodeViewerProps) {
  const height = props.minHeight ?? 180;

  if (props.language && RAW_TEXTAREA_LANGUAGES.has(props.language)) {
    return (
      <div className="relative">
        <CopyCodeButton value={props.value} />
        <textarea
          id={props.id}
          aria-label={props.ariaLabel}
          aria-labelledby={props.ariaLabelledby}
          className={cn(
            "code-viewer code-surface w-full overflow-auto rounded-xl border bg-[var(--code-surface-background)] p-4 font-mono text-sm text-[var(--code-surface-foreground)] leading-relaxed shadow-sm transition-colors",
            props.tone === "danger" ? "code-surface-danger" : "code-surface-default",
            props.className,
          )}
          style={{ minHeight: height, tabSize: 4, whiteSpace: "pre", resize: "none" }}
          value={props.value}
          readOnly
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <CopyCodeButton value={props.value} />
      <CodeSurface
        {...props}
        className={cn("code-viewer", props.className)}
        minHeight={height}
        readOnly
      />
    </div>
  );
}
