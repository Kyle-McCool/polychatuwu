/**
 * Strip the "AI tell" dashes everywhere text is shown. Em dash (—), en dash (–),
 * and word-joining hyphens become plain spaces; numeric ranges keep their meaning
 * ("5–10" → "5 to 10"); minus signs and in-number hyphens ("-5%", "57-500") are
 * left alone. Applied at every dynamic-text boundary (chat, news, titles, market
 * labels) so nothing on screen uses fancy punctuation.
 */
export function deDash(input: string): string {
  if (!input) return input;
  return input
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2") // numeric ranges with en/em dash → "to"
    .replace(/[—–―‒]/g, " ") // em / en / horizontal-bar / figure dash → space
    .replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, " ") // word-joining hyphen → space (lo-fi → lo fi)
    .replace(/ +- +/g, " ") // spaced separator hyphen → space
    .replace(/[ \t]{2,}/g, " ") // collapse runs of spaces
    .replace(/\s+([,.;:!?])/g, "$1") // no space before punctuation
    .trim();
}
