import DOMPurify from "isomorphic-dompurify";

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

export function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: LEGACY_HTML_ALLOWED_ATTR,
    ALLOWED_TAGS: LEGACY_HTML_ALLOWED_TAGS,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/))/i,
    ADD_ATTR: ["rel"],
  });
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
