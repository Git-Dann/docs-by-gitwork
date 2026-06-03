---
name: design-system
description: Extract a client's brand into a Foundry DesignTokens JSON (+ CSS variables and an optional standalone HTML preview) from their brand guidelines. Use when the user says "generate design system", "extract brand tokens", "build design system from <files>", or "create design system for <client>". Output imports straight into Foundry → Portal → a client's Design System tab.
---

# Design System — brand token extractor

You turn a client's **brand guidelines** (PDF, images, a hosted style guide, or a text
description) into a single **`design-tokens.json`** that Foundry's Portal renders as a live,
fully-branded design system. Foundry is render-only — **this skill does the extraction**; the JSON
is the canonical source everything else derives from.

## When to use

Trigger phrases: "generate design system", "extract brand tokens", "build design system from …",
"create design system for [client]".

## Input

Whatever the user provides: a brand-guidelines PDF, screenshots/exports of a style guide, a link,
or a prose description. Read everything supplied. If a value isn't stated, infer it from the visuals
and **flag your confidence** (see below) rather than omitting it.

## Output

1. **`design-tokens.json`** — matches the `DesignTokens` schema below exactly. This is the file the
   user imports in Foundry (Portal → a client → **Design system →** → Import JSON).
2. The **`cssVariables`** string inside that JSON — a complete, paste-ready `:root { … }` block.
3. **Optional**: a standalone `*-design-system.html` preview (self-contained, inline CSS, no CDN
   font calls) when the user wants something to eyeball outside Foundry.

Always present a short **confidence summary** after the JSON and call out every LOW item for the
human to confirm.

## How to extract (be exact)

- **Colours** — exact hex; include `rgb` and `pantone` when stated. Sort into `primary` (brand +
  accent), `secondary`, `neutrals`. Give each a one-line `usage`.
- **Typography** — name the `displayFont`, `bodyFont`, optional `monoFont`, and a `systemFallback`
  stack. Build the `scale` (role, fontFamily, fontWeight as a **number**, fontSize as a **string**
  with units, lineHeight as a **number**, plus `letterSpacing`/`textTransform` when used).
- **Gradients / shadows** — capture the **full CSS value** (angles, stops, layered shadows) + usage.
- **Spacing / radius** — the named scales (`spacing.base` is the grid unit, e.g. 4 or 8).
- **Buttons** — every variant: `background`, `textColour`, optional `border`/`hoverBackground`, and
  crucially which `surfaces` it's used on: `["light","dark","gradient"]`.
- **Inputs / badges / alerts / emptyState / logoRules** — optional groups; include them whenever the
  guidelines show them (e.g. focus rings, status/grade badges, dashed empty-state, logo min-sizes and
  colour-on-surface rules). Omit a group entirely if the brand genuinely doesn't define it.
- **cssVariables** — emit the full `:root {}` block. If you can't, leave it `""` and Foundry will
  synthesise a fallback.

## Confidence notes (required)

Tag each token group HIGH / MEDIUM / LOW in the optional `confidence` map **and** in your summary:
- **HIGH** — directly stated in the guidelines.
- **MEDIUM** — inferred from a visual / measured off a screenshot.
- **LOW** — assumed or estimated. **Flag every LOW item explicitly** so the human can correct it
  before saving (fonts you couldn't identify, guessed hexes, etc.).

## Schema (`DesignTokens`)

Match Foundry's type at `src/types/design-tokens.ts`. Required core:

```jsonc
{
  "clientName": "string",
  "version": "1.0",
  "generatedAt": "ISO-8601 string",
  "brandVoice": "one-line positioning (optional)",
  "colours": {
    "primary":   [{ "name", "hex", "rgb?", "pantone?", "role", "usage" }],
    "secondary": [ /* … */ ],
    "neutrals":  [ /* … */ ]
  },
  "gradients": [{ "name", "css", "usage" }],
  "typography": {
    "displayFont": "string", "bodyFont": "string",
    "monoFont": "string (optional)", "systemFallback": "string",
    "scale": [{ "role", "fontFamily", "fontWeight": 0, "fontSize": "16px", "lineHeight": 1.5,
                "letterSpacing?", "textTransform?", "usage?", "sample?" }]
  },
  "spacing": { "base": 8, "scale": { "1": "4px", "2": "8px" } },
  "radius":  { "sm": "4px", "lg": "8px" },
  "shadows": [{ "name", "css", "usage" }],
  "buttons": [{ "name", "background", "textColour", "border?", "hoverBackground?",
                "surfaces": ["light","dark","gradient"], "usage?" }],

  // Optional groups — include when the brand documents them:
  "emptyState": { "background", "stroke", "strokeWidth", "strokeStyle" },
  "inputs":  [{ "state", "border?", "ring?", "background?", "textColour?", "note?" }],
  "badges":  [{ "label", "background", "textColour", "border?", "group?" }],
  "alerts":  [{ "name", "background", "textColour", "border?", "usage?" }],
  "logoRules": { "minSizes?": {}, "clearSpace?", "colourRules?": [{ "surface", "logoVersion" }], "notes?" },

  "cssVariables": ":root { … }",
  "confidence": { "colours": "HIGH", "typography": "MEDIUM" }
}
```

## Worked examples

Two complete, validated token sets live beside this file — study them before producing your own:

- [`examples/ace.json`](examples/ace.json) — Ace Grading: dark/gold, serif display (GT Ultra Fine),
  Pantone codes, a gold "glow" shadow, radial gradient, dashed empty-state, deep logo rules, grade
  badges.
- [`examples/afterdesk.json`](examples/afterdesk.json) — AfterDesk: light navy SaaS, single sans
  (Plus Jakarta Sans), pill badges, no Pantone, **no** empty-state (a group can be omitted).

They sit at opposite ends of the spectrum on purpose — match that level of completeness and the
exact field shapes.

## Handoff

The user takes the JSON to **Foundry → Portal → [client] → Design system → Import JSON**. Saving
renders it live; they can then publish a public, read-only `/brand/[token]` link for the client and
Copy-CSS for developers.
