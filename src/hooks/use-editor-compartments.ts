import { useRef } from "react";
import { Compartment } from "@codemirror/state";

function useLazyRef<T>(init: () => T) {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = init();
  }
  return ref as React.RefObject<T>;
}

export function useEditorCompartments() {
  const language = useLazyRef(() => new Compartment());
  const highlight = useLazyRef(() => new Compartment());
  const minHeight = useLazyRef(() => new Compartment());
  const editability = useLazyRef(() => new Compartment());
  const placeholderComp = useLazyRef(() => new Compartment());
  const contentAttributes = useLazyRef(() => new Compartment());

  return { language, highlight, minHeight, editability, placeholderComp, contentAttributes };
}
