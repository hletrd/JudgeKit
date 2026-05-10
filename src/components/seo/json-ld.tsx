type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

/**
 * Sanitize JSON string for safe embedding in a <script> tag.
 * `JSON.stringify` escapes `<` in V8/SpiderMonkey but this is not
 * guaranteed by the ECMAScript spec. Replace `</script` sequences
 * to prevent breaking out of the script tag. Also escapes Unicode
 * line separator (U+2028) and paragraph separator (U+2029) which
 * are valid in JSON but historically invalid in JavaScript strings.
 */
const U2028_REGEX = new RegExp(String.fromCharCode(0x2028), "g");
const U2029_REGEX = new RegExp(String.fromCharCode(0x2029), "g");

function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(U2028_REGEX, "\\u2028")
    .replace(U2029_REGEX, "\\u2029");
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonForScript(data) }}
    />
  );
}
