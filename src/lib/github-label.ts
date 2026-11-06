/**
 * How a developer's GitHub handle reads in a list. The API sends "" for a developer who
 * has none yet (a new hire whose record was made from their account), and a bare "@"
 * looks like a broken card rather than a gap someone can fill.
 */
export function githubLabel(handle: string | null | undefined): string {
  const h = handle?.trim();
  return h ? `@${h}` : "No GitHub yet";
}
