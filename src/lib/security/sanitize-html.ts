import DOMPurify from "isomorphic-dompurify";
import {
  extractHiddenNotes,
  HIDDEN_NOTE_CLASS,
  restoreHiddenNotePlaceholders,
  splitHiddenNotePlaceholders,
} from "@/lib/problem-hidden-notes";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }

  if (node.tagName === "IMG") {
    const src = node.getAttribute("src")?.trim() ?? "";
    const isRootRelative = src.startsWith("/") && !src.startsWith("//");
    if (!isRootRelative) {
      node.removeAttribute("src");
    }
  }
});

// Legacy HTML descriptions are kept on a narrow, formatting-focused subset.
// Prefer markdown for new content. The allowed set intentionally excludes
// generic layout wrappers such as div/span and class-based styling hooks.
const LEGACY_HTML_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const LEGACY_HTML_ALLOWED_ATTR = [
  "alt",
  "colspan",
  "href",
  "rel",
  "rowspan",
  "src",
  "target",
  "title",
];

/**
 * Sanitize legacy HTML content for safe rendering.
 *
 * Image src attributes are restricted to root-relative paths (starting with /
 * but not //). External image URLs (https://, http://) are stripped for
 * security — they could be used for external resource loading or tracking.
 */
const LEGACY_HTML_CONFIG = {
  ALLOWED_ATTR: LEGACY_HTML_ALLOWED_ATTR,
  ALLOWED_TAGS: LEGACY_HTML_ALLOWED_TAGS,
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/))/i,
  ADD_ATTR: ["rel"],
};

export function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, LEGACY_HTML_CONFIG);
}

const VERBATIM_HTML_TAGS = new Set(["CODE", "PRE"]);

/**
 * Sanitize a legacy HTML problem description and render its hidden notes.
 *
 * Markers are swapped for placeholder tokens before sanitizing, so the note
 * body is never parsed as HTML. After DOMPurify has produced a safe DOM, each
 * placeholder in a text node becomes a `<span class="problem-hidden-note">`
 * whose content is set with `textContent` (plain text only). Placeholders in
 * attributes or inside `code`/`pre` are restored to the literal marker.
 */
export function sanitizeHtmlWithHiddenNotes(html: string) {
  const { source, notes } = extractHiddenNotes(html);
  if (notes.length === 0) {
    return sanitizeHtml(html);
  }

  const fragment = DOMPurify.sanitize(source, {
    ...LEGACY_HTML_CONFIG,
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;
  const doc = fragment.ownerDocument;

  const elements = fragment.querySelectorAll("*");
  for (const element of Array.from(elements)) {
    for (const attr of Array.from(element.attributes)) {
      const restored = restoreHiddenNotePlaceholders(attr.value, notes);
      if (restored !== attr.value) element.setAttribute(attr.name, restored);
    }
  }

  const walker = doc.createTreeWalker(fragment, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? "";
    if (!value.includes("\uE000")) continue;

    let verbatim = false;
    for (let el = textNode.parentElement; el; el = el.parentElement) {
      if (VERBATIM_HTML_TAGS.has(el.tagName)) {
        verbatim = true;
        break;
      }
    }

    if (verbatim) {
      textNode.nodeValue = restoreHiddenNotePlaceholders(value, notes);
      continue;
    }

    const replacement = doc.createDocumentFragment();
    for (const part of splitHiddenNotePlaceholders(value, notes)) {
      if (part.type === "text") {
        replacement.appendChild(doc.createTextNode(part.value));
      } else {
        const span = doc.createElement("span");
        span.className = HIDDEN_NOTE_CLASS;
        span.textContent = part.text;
        replacement.appendChild(span);
      }
    }
    textNode.parentNode?.replaceChild(replacement, textNode);
  }

  const container = doc.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

/**
 * Sanitize markdown content for problem descriptions.
 *
 * Unlike sanitizeHtml(), this does NOT escape `<`/`>` because descriptions
 * are rendered by react-markdown with `skipHtml` (inherently XSS-safe).
 * DOMPurify treats input as HTML and would escape angle brackets inside
 * markdown code blocks, breaking the rendered output.
 */
export function sanitizeMarkdown(text: string): string {
  // Strip null bytes and other control characters (except newline, tab, carriage return)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
