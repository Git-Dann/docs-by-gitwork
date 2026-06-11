// Shared constants for Open Graph link-preview cards. One uniform card across the
// whole platform — differentiated only by the mono-caps eyebrow that names the
// module — so unfurls in a Slack feed read as a single coherent product.

export const SIZE = { width: 1200, height: 630 } as const;
export const CONTENT_TYPE = "image/png" as const;

// All cards render with the same chrome (cream background, mono eyebrow, DM Serif
// title, mono bottom-right label). The eyebrow string is the only thing that
// varies per module.
export type ModuleKey =
  | "FOUNDRY"
  | "PULSE"
  | "CODE"
  | "DOCS"
  | "PORTAL"
  | "CARE"
  | "STUDY"
  | "BACKSTAGE"
  | "WIKI"
  | "BRAND"
  | "API";

export function eyebrow(module: ModuleKey): string {
  return module === "FOUNDRY" ? "FOUNDRY" : `FOUNDRY // ${module}`;
}
