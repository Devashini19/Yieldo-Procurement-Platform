/**
 * Utility to sanitize AI chatbot responses into clean plain text.
 * Strips markdown artifacts (asterisks for bold/italic, header hashes,
 * bullet dashes/asterisks/bullets, backticks, links, blockquotes, etc.)
 * so that text displays cleanly without raw syntax symbols and reads
 * naturally via voice assistants.
 */
export function sanitizePlainText(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;

  // 1. Remove code blocks and inline code backticks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\n?/gi, "").replace(/```/g, ""));
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // 2. Remove markdown links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 3. Remove markdown bold and italics while preserving the inner text
  cleaned = cleaned.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/___([^_]+)___/g, "$1");
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1");

  // Remove any remaining stray asterisks or underscores used as formatting
  cleaned = cleaned.replace(/\*+/g, "");

  // 4. Remove markdown header hashes (# Heading -> Heading)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");

  // 5. Remove leading bullet symbols (-, +, *, •, ⁃) at the start of lines
  cleaned = cleaned.replace(/^[\s]*[-+•⁃]\s+/gm, "");

  // 6. Remove leading numbered list markers like "1. ", "2. " at start of lines
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, "");

  // 7. Remove blockquotes '> text'
  cleaned = cleaned.replace(/^>\s+/gm, "");

  // 8. Clean up trailing/excessive whitespace and empty lines
  cleaned = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join("\n")
    .trim();

  return cleaned;
}

