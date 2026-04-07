import DOMPurify from "isomorphic-dompurify";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }
});

const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "del",
  "div",
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
  "span",
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

const ALLOWED_ATTR = [
  "alt",
  "class",
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
    ALLOWED_ATTR,
    ALLOWED_TAGS,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
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
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
