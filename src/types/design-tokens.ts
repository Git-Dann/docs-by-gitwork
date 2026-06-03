// Per-client brand design tokens.
//
// The Cowork `design-system` skill extracts a `DesignTokens` JSON from a client's
// brand guidelines; Foundry's Portal stores it (ClientDesignSystem) and renders it
// (src/components/clients/design-system) + publishes the public /brand/[token] page.
// The viewer is token-driven by design — it hardcodes no client brand values.
//
// The required core mirrors the original build spec. `inputs`/`badges`/`alerts`/
// `emptyState`/`logoRules` are OPTIONAL refinements so richer brands (e.g. Ace
// Grading) are captured losslessly; the viewer falls back to colour-derived demos
// when a group is absent (e.g. AfterDesk documents no empty-state).

export interface ColourToken {
  name: string; // e.g. "Ace Shadow"
  hex: string; // e.g. "#03162B"
  rgb?: string; // e.g. "rgb(3, 22, 43)"
  pantone?: string; // e.g. "532 C"
  role: string; // "primary" | "accent" | "secondary" | "neutral"
  usage: string; // prose description of where to use it
}

export interface TypographyToken {
  role: string; // "display" | "h1" | "body" | "label" | "caption"
  fontFamily: string;
  fontWeight: number;
  fontSize: string; // px or rem
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: string;
  usage?: string;
  /** Optional specimen string; the viewer synthesises one from the role when absent. */
  sample?: string;
}

export interface GradientToken {
  name: string;
  css: string; // full CSS value
  usage: string;
}

export interface ShadowToken {
  name: string;
  css: string;
  usage: string;
}

export interface ButtonVariant {
  name: string; // e.g. "Primary CTA"
  className?: string; // e.g. "btn-primary"
  background: string;
  textColour: string;
  border?: string;
  hoverBackground?: string;
  surfaces: string[]; // e.g. ["light", "dark", "gradient"]
  usage?: string;
}

export interface EmptyStateTokens {
  background: string; // e.g. "rgba(155,166,158,0.15)"
  stroke: string; // e.g. "rgba(155,166,158,0.35)"
  strokeWidth: string; // e.g. "1.5px"
  strokeStyle: string; // e.g. "dashed"
}

/** Optional — one entry per input state shown (default/hover/focus/error/disabled). */
export interface InputStateToken {
  state: string;
  border?: string;
  ring?: string; // focus ring / box-shadow
  background?: string;
  textColour?: string;
  note?: string;
}

/** Optional — semantic status badges and any domain badges (e.g. Ace grade badges). */
export interface BadgeToken {
  label: string;
  background: string;
  textColour: string;
  border?: string;
  group?: string; // e.g. "status" | "grade"
}

/** Optional — alert / notification banner styles. */
export interface AlertToken {
  name: string;
  background: string;
  textColour: string;
  border?: string;
  usage?: string;
}

export interface LogoAsset {
  label: string; // e.g. "Primary full logo", "White logo", "Logomark"
  src: string; // image URL (or data URI) of the lockup
  background?: "light" | "dark"; // which surface to preview it on
}

export interface LogoRules {
  minSizes?: Record<string, string>; // e.g. { horizontal: "20px" }
  clearSpace?: string;
  colourRules?: Array<{ surface: string; logoVersion: string }>;
  notes?: string;
  /** Logo lockups to render as images (primary / white / logomark …). */
  assets?: LogoAsset[];
  // ── Richer rules captured by the generator ──
  brandStrapline?: string;
  /** Named formats → description, e.g. { "logomark-only": "Favicon, compact nav" }. */
  formats?: Record<string, string>;
  /** Do/don't usage rules. */
  rules?: string[];
  fileNamingConvention?: string;
  colourCodes?: string[];
  formatCodes?: Record<string, string>;
}

export type DesignTokenConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface DesignTokens {
  clientName: string;
  version: string;
  generatedAt: string; // ISO date string
  brandVoice?: string; // one-line brand positioning

  colours: {
    primary: ColourToken[];
    secondary: ColourToken[];
    neutrals: ColourToken[];
  };
  gradients: GradientToken[];
  typography: {
    displayFont: string;
    bodyFont: string;
    systemFallback: string;
    monoFont?: string;
    scale: TypographyToken[];
  };
  spacing: {
    base: number; // base unit in px (usually 4 or 8)
    scale: Record<string, string>; // { "1": "4px", "2": "8px", ... }
  };
  radius: Record<string, string>; // { "none": "0px", "sm": "2px", ... }
  /** Full tonal ramps, e.g. { navy: { "50": "#…", … }, slate: {…} }. Optional. */
  colourRamps?: Record<string, Record<string, string>>;
  shadows: ShadowToken[];
  buttons: ButtonVariant[];

  // Optional, additive groups (see file header).
  emptyState?: EmptyStateTokens;
  inputs?: InputStateToken[];
  badges?: BadgeToken[];
  alerts?: AlertToken[];
  logoRules?: LogoRules;

  cssVariables: string; // complete :root {} block, ready to paste

  /** Optional per-group confidence notes emitted by the skill. Keyed by group name. */
  confidence?: Record<string, DesignTokenConfidence>;
}

// ── DTOs shared by the API layer, hooks, and the public page ──────────────────

export type DesignSystemStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface DesignSystemShareInfo {
  enabled: boolean;
  token: string | null;
  url: string | null;
}

export interface DesignSystemDTO {
  exists: boolean;
  /** Whether the per-client design-system page/entry is enabled (Edit client toggle). */
  enabled: boolean;
  tokens: DesignTokens | null;
  status: DesignSystemStatus;
  updatedAt: string | null;
  updatedBy: string | null;
  share: DesignSystemShareInfo;
}

export interface PublicDesignSystemDTO {
  clientName: string;
  tokens: DesignTokens;
  generatedAt: string;
  /** The client's uploaded logo (shown in the hero + logo section). */
  logoUrl: string | null;
}
