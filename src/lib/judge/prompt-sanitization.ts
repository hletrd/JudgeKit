/**
 * Sanitize user-controlled content before embedding in LLM prompts.
 *
 * Removes or defangs common prompt injection markers that could override
 * system instructions, jailbreak the model, or cause the LLM to emit
 * unintended content. Preserves the underlying code/text as much as
 * possible so legitimate educational content is not disrupted.
 */

const PROMPT_INJECTION_PATTERNS = [
  // Common jailbreak / delimiter markers
  /<<[^>]*>>/g,
  /\[\/?(?:INST|SYSTEM|USER|ASSISTANT)\]/gi,
  // Instruction override phrases
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions?/gi,
  /system\s+override/gi,
  /(?:forget|disregard)\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|prompts?)/gi,
  /you\s+are\s+now/gi,
  /new\s+instructions?/gi,
  // Role-play injection
  /(?:pretend|act\s+as|roleplay|role-play)\s+(?:you\s+are|as)/gi,
  // Code-block escapes that try to break out of the delimiter
  /```\s*(?:system|instructions?|prompt)/gi,
  // HTML/script tag injection attempts
  /<\/?(?:script|iframe|object|embed)/gi,
];

/**
 * Maximum length of prompt input after sanitization.
 * Prevents oversized inputs from inflating token costs and
 * exceeding context-window limits.
 */
const MAX_SANITIZED_LENGTH = 32_768;

/**
 * Sanitize text intended for embedding in an LLM prompt.
 *
 * Strips known prompt injection markers while preserving the
 * underlying content. Collapses excessive whitespace and caps
 * total length to prevent token explosion.
 */
export function sanitizePromptInput(text: string): string {
  if (!text) return "";

  let sanitized = text;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Collapse runs of more than two newlines to keep formatting clean
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  // Cap length to prevent token explosion
  if (sanitized.length > MAX_SANITIZED_LENGTH) {
    sanitized = sanitized.slice(0, MAX_SANITIZED_LENGTH);
  }

  return sanitized.trim();
}
