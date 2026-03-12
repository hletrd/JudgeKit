import { useRef } from "react";
import { Compartment } from "@codemirror/state";

export function useEditorCompartments() {
  const language = useRef(new Compartment());
  const highlight = useRef(new Compartment());
  const minHeight = useRef(new Compartment());
  const editability = useRef(new Compartment());
  const placeholderComp = useRef(new Compartment());
  const contentAttributes = useRef(new Compartment());

  return { language, highlight, minHeight, editability, placeholderComp, contentAttributes };
}
