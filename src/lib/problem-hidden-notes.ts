import type { Element, ElementContent, Properties, Root, RootContent, Text } from "hast";

/**
 * Hidden notes in problem descriptions.
 *
 * Syntax (single line, inside the markdown body):
 *
 *     {{hidden: text}}
 *
 * The rendered statement turns each note into
 * `<span class="problem-hidden-note">text</span>`, which is styled so it is not
 * visible on screen but still ends up in copy/paste, the page source, and the
 * problem API response. The inner text is always plain text: no markdown, math,
 * or HTML is interpreted inside a note. Text surfaces that are not the rendered
 * statement (meta descriptions, OG images, search matching, AI prompts) must
 * call `stripHiddenNotes()` so the raw marker never leaks.
 *
 * See docs/api.md → "Hidden notes in problem descriptions".
 */

export const HIDDEN_NOTE_CLASS = "problem-hidden-note";

/** `{{hidden:` + any text on one line that does not contain `}}` + `}}`. */
const HIDDEN_NOTE_SOURCE = String.raw`\{\{hidden:((?:(?!\}\})[^\r\n])*)\}\}`;

/**
 * PostgreSQL ARE equivalent of the pattern above (shortest match up to the
 * first `}}` on the same line), for use with `regexp_replace(..., 'g')`.
 */
export const HIDDEN_NOTE_SQL_PATTERN = String.raw`\{\{hidden:[^\r\n]*?\}\}`;

const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";
const PLACEHOLDER_CHARS_PATTERN = /[\uE000\uE001]/g;
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE001/g;
/** The placeholder after URL encoding (markdown link/image destinations). */
const ENCODED_PLACEHOLDER_PATTERN = /%EE%80%80(\d+)%EE%80%81/gi;

function hiddenNotePattern() {
  return new RegExp(HIDDEN_NOTE_SOURCE, "g");
}

export function hasHiddenNotes(text: string | null | undefined): boolean {
  return typeof text === "string" && text.includes("{{hidden:") && hiddenNotePattern().test(text);
}

/** Remove every hidden note marker (and its text) from `text`. */
export function stripHiddenNotes(text: string): string;
export function stripHiddenNotes(text: string | null | undefined): string | null | undefined;
export function stripHiddenNotes(text: string | null | undefined) {
  if (typeof text !== "string" || !text.includes("{{hidden:")) {
    return text;
  }
  return text.replace(hiddenNotePattern(), "");
}

export type HiddenNote = {
  /** The marker exactly as written, e.g. `{{hidden: int gq7x = 0;}}`. */
  raw: string;
  /** Trimmed inner text. */
  text: string;
};

export type ExtractedHiddenNotes = {
  /** Source with each marker replaced by an opaque placeholder token. */
  source: string;
  notes: HiddenNote[];
};

/**
 * Replace each marker with a placeholder token that markdown/HTML parsers keep
 * as ordinary text, so the note body is never parsed as markdown, math, or
 * HTML. `rehypeHiddenNotes` and `sanitizeHtmlWithHiddenNotes` turn the tokens
 * back into hidden spans after parsing.
 */
export function extractHiddenNotes(source: string): ExtractedHiddenNotes {
  if (!hasHiddenNotes(source)) {
    return { source, notes: [] };
  }

  const notes: HiddenNote[] = [];
  const replaced = source
    .replace(PLACEHOLDER_CHARS_PATTERN, "")
    .replace(hiddenNotePattern(), (raw: string, inner: string) => {
      const index = notes.push({ raw, text: inner.trim() }) - 1;
      return `${PLACEHOLDER_START}${index}${PLACEHOLDER_END}`;
    });

  return { source: replaced, notes };
}

/** Put the original marker text back in place of every placeholder. */
export function restoreHiddenNotePlaceholders(value: string, notes: readonly HiddenNote[]): string {
  const restore = (match: string, index: string) => notes[Number(index)]?.raw ?? match;
  let restored = value;
  if (restored.includes(PLACEHOLDER_START)) {
    restored = restored.replace(PLACEHOLDER_PATTERN, restore);
  }
  if (/%EE%80%80/i.test(restored)) {
    restored = restored.replace(ENCODED_PLACEHOLDER_PATTERN, restore);
  }
  return restored;
}

/**
 * Split `value` into plain-text pieces and hidden notes. Used by both the
 * markdown (hast) and legacy HTML (DOM) renderers.
 */
export function splitHiddenNotePlaceholders(
  value: string,
  notes: readonly HiddenNote[],
): Array<{ type: "text"; value: string } | { type: "note"; text: string }> {
  const parts: Array<{ type: "text"; value: string } | { type: "note"; text: string }> = [];
  let lastIndex = 0;

  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, start) });
    }
    const note = notes[Number(match[1])];
    if (note?.text) {
      parts.push({ type: "note", text: note.text });
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts;
}

const VERBATIM_TAGS = new Set(["code", "pre", "script", "style", "textarea"]);

function isHiddenNoteElement(node: RootContent | ElementContent): node is Element {
  if (node.type !== "element" || node.tagName !== "span") return false;
  const className = node.properties?.className;
  return Array.isArray(className) && className.includes(HIDDEN_NOTE_CLASS);
}

function isIgnorableWhitespace(node: RootContent | ElementContent) {
  return node.type === "text" && node.value.trim() === "";
}

function isLineBreak(node: RootContent | ElementContent | undefined) {
  return node?.type === "element" && node.tagName === "br";
}

/**
 * When a note sits on its own line inside a paragraph (remark-breaks turns
 * the surrounding newlines into `<br>`), drop one of the two line breaks so
 * the invisible note does not leave an empty visual line behind.
 */
function collapseHiddenNoteLines(children: Array<RootContent | ElementContent>) {
  let i = 0;
  while (i < children.length) {
    if (!isHiddenNoteElement(children[i])) {
      i += 1;
      continue;
    }

    let groupEnd = i;
    for (let j = i + 1; j < children.length; j += 1) {
      if (isHiddenNoteElement(children[j])) groupEnd = j;
      else if (!isIgnorableWhitespace(children[j])) break;
    }

    let prev = i - 1;
    while (prev >= 0 && isIgnorableWhitespace(children[prev])) prev -= 1;
    let next = groupEnd + 1;
    while (next < children.length && isIgnorableWhitespace(children[next])) next += 1;

    const prevIsBoundary = prev < 0 || isLineBreak(children[prev]);
    const nextIsBoundary = next >= children.length || isLineBreak(children[next]);

    if (prevIsBoundary && nextIsBoundary) {
      if (next < children.length) {
        children.splice(next, 1);
      } else if (prev >= 0) {
        children.splice(prev, 1);
        groupEnd -= 1;
      }
    }

    i = groupEnd + 1;
  }
}

function restoreProperties(properties: Properties | undefined, notes: readonly HiddenNote[]) {
  if (!properties) return;
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string") {
      properties[key] = restoreHiddenNotePlaceholders(value, notes);
    } else if (Array.isArray(value)) {
      properties[key] = value.map((item) =>
        typeof item === "string" ? restoreHiddenNotePlaceholders(item, notes) : item,
      );
    }
  }
}

function createHiddenNoteElement(text: string): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [HIDDEN_NOTE_CLASS] },
    children: [{ type: "text", value: text }],
  };
}

function transformChildren(
  parent: Root | Element,
  notes: readonly HiddenNote[],
  verbatim: boolean,
) {
  const children = parent.children as Array<RootContent | ElementContent>;
  const next: Array<RootContent | ElementContent> = [];
  let changed = false;

  for (const child of children) {
    if (child.type === "text") {
      if (!child.value.includes(PLACEHOLDER_START)) {
        next.push(child);
        continue;
      }
      changed = true;
      if (verbatim) {
        next.push({ ...child, value: restoreHiddenNotePlaceholders(child.value, notes) } as Text);
        continue;
      }
      for (const part of splitHiddenNotePlaceholders(child.value, notes)) {
        next.push(part.type === "text" ? { type: "text", value: part.value } : createHiddenNoteElement(part.text));
      }
      continue;
    }

    if (child.type === "element") {
      restoreProperties(child.properties, notes);
      transformChildren(child, notes, verbatim || VERBATIM_TAGS.has(child.tagName));
    }
    next.push(child);
  }

  if (changed) {
    collapseHiddenNoteLines(next);
    parent.children = next as typeof parent.children;
  }
}

/**
 * rehype plugin: turn the placeholders left by `extractHiddenNotes()` into
 * hidden spans. Inside `code`/`pre` (including math, which remark-math emits as
 * `code.language-math`) the marker is restored verbatim instead.
 */
export function rehypeHiddenNotes(options: { notes: readonly HiddenNote[] }) {
  const notes = options?.notes ?? [];
  return (tree: Root) => {
    if (notes.length === 0) return;
    transformChildren(tree, notes, false);
  };
}
