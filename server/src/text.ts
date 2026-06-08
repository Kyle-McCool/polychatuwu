/**
 * Strip "AI tell" dashes from text before it's broadcast (chat, newswire). Em/en
 * dashes and word-joining hyphens become spaces; numeric ranges keep meaning;
 * minus signs / in-number hyphens are preserved. Mirror of web/src/lib/text.ts.
 */
export function deDash(input: string): string {
  if (!input) return input;
  return input
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/[—–―‒]/g, " ")
    .replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, " ")
    .replace(/ +- +/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}
