/**
 * Tidy a person's display name as it arrives from Google at first sign-in.
 *
 * Only a name typed ENTIRELY in lower case is changed ("ali asghar" → "Ali Asghar"), because
 * that is the one case where the casing is clearly not a choice. Anything with a capital in
 * it is left exactly as written: "Mustaqeem bin Ahmed", "McDonald" and "van der Berg" are
 * deliberate, and a rule that "fixed" them would be wrong.
 */
export function tidyPersonName(name: string | null | undefined): string | null {
  const trimmed = name?.trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed) return null;
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  // Capitalise each word and each part after a hyphen or apostrophe: "anne-marie o'neil".
  return trimmed.replace(/(^|[\s'’-])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
