"use client";

import { CodeSurface } from "./code-surface";

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
  return <CodeSurface {...props} minHeight={props.minHeight ?? 180} readOnly />;
}
