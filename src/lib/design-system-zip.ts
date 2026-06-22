import type { DesignTokens } from "@/types/design-tokens";
import { zipSync, strToU8 } from "fflate";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Collect distinct font-family names from the token set. */
function collectFamilies(tokens: DesignTokens): string[] {
  const seen = new Set<string>();
  const push = (f: string | undefined) => {
    if (f && f.trim()) seen.add(f.trim());
  };
  push(tokens.typography.displayFont);
  push(tokens.typography.bodyFont);
  push(tokens.typography.monoFont);
  for (const t of tokens.typography.scale) push(t.fontFamily);
  return [...seen];
}

/** Collect all weights used for a given family in the scale. */
function weightsForFamily(tokens: DesignTokens, family: string): number[] {
  const seen = new Set<number>();
  for (const t of tokens.typography.scale) {
    if (t.fontFamily === family) seen.add(t.fontWeight);
  }
  if (seen.size === 0) seen.add(400);
  return [...seen].sort((a, b) => a - b);
}

/** Build a Google Fonts v2 URL for all non-system families in the token set. */
export function googleFontsUrl(tokens: DesignTokens): string {
  const systemFamilies = new Set(
    (tokens.typography.systemFallback || "")
      .split(",")
      .map((f) => f.trim().replace(/^['"]|['"]$/g, "").toLowerCase()),
  );
  const families = collectFamilies(tokens).filter(
    (f) => !systemFamilies.has(f.toLowerCase()),
  );
  if (!families.length) return "";

  const params = families.map((family) => {
    const weights = weightsForFamily(tokens, family);
    const encoded = family.replace(/ /g, "+");
    // Include regular + italic axis if the family name hints at a serif/display
    const hasItalic = /serif|display|script|italic/i.test(family);
    if (hasItalic) {
      const axisStr = weights.map((w) => `0,${w};1,${w}`).join(";");
      return `family=${encoded}:ital,wght@${axisStr}`;
    }
    return `family=${encoded}:wght@${weights.join(";")}`;
  });

  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}

// ── font pack ─────────────────────────────────────────────────────────────────

/** Builds a ZIP containing fonts.css, tailwind.js snippet, and README.md. */
export function buildFontPack(tokens: DesignTokens): Uint8Array {
  const gfUrl = googleFontsUrl(tokens);

  const families = collectFamilies(tokens);

  const fontsCss = [
    gfUrl ? `@import url("${gfUrl}");` : "/* Add your font @import here */",
    "",
    "/* ── CSS custom properties ───────────────────────────────── */",
    ":root {",
    tokens.typography.displayFont
      ? `  --font-display: "${tokens.typography.displayFont}", ${tokens.typography.systemFallback};`
      : null,
    tokens.typography.bodyFont
      ? `  --font-body:    "${tokens.typography.bodyFont}", ${tokens.typography.systemFallback};`
      : null,
    tokens.typography.monoFont
      ? `  --font-mono:    "${tokens.typography.monoFont}", monospace;`
      : null,
    "}",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const tailwindLines = [
    "// tailwind.config.js → theme.extend.fontFamily",
    "fontFamily: {",
    tokens.typography.displayFont
      ? `  display: ['${tokens.typography.displayFont}', '${tokens.typography.systemFallback}'],`
      : null,
    tokens.typography.bodyFont
      ? `  sans: ['${tokens.typography.bodyFont}', '${tokens.typography.systemFallback}'],`
      : null,
    tokens.typography.monoFont ? `  mono: ['${tokens.typography.monoFont}', 'monospace'],` : null,
    "},",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const scaleRows = tokens.typography.scale
    .map(
      (t) =>
        `| ${t.role.padEnd(18)} | ${t.fontFamily.padEnd(22)} | ${String(t.fontWeight).padEnd(6)} | ${t.fontSize.padEnd(7)} | ${String(t.lineHeight).padEnd(4)} |`,
    )
    .join("\n");

  const readme = [
    `# ${tokens.clientName} — Font Pack`,
    "",
    "## Families",
    families.map((f) => `- ${f}`).join("\n"),
    "",
    "## Google Fonts import",
    gfUrl ? `\`\`\`\n${gfUrl}\n\`\`\`` : "_No Google Fonts URL generated — all fonts are system or custom._",
    "",
    "## Type scale",
    "| Role               | Family                 | Weight | Size    | LH   |",
    "|:-------------------|:-----------------------|:-------|:--------|:-----|",
    scaleRows,
    "",
    "## Files",
    "- `fonts.css` — `@import` + `:root` CSS custom properties",
    "- `tailwind.js` — `fontFamily` snippet for `tailwind.config.js`",
    "- `README.md` — this file",
  ].join("\n");

  return zipSync({
    "fonts.css": strToU8(fontsCss),
    "tailwind.js": strToU8(tailwindLines),
    "README.md": strToU8(readme),
  });
}

// ── logo pack ─────────────────────────────────────────────────────────────────

/** Fetches each logo asset's downloadUrl and bundles them into a ZIP with a README. */
export async function buildLogoPack(tokens: DesignTokens): Promise<Uint8Array> {
  const assets = tokens.logoRules?.assets ?? [];
  const downloadable = assets.filter((a) => a.downloadUrl);

  const files: Record<string, Uint8Array> = {};

  await Promise.all(
    downloadable.map(async (asset) => {
      try {
        const resp = await fetch(asset.downloadUrl!);
        if (!resp.ok) return;
        const buf = await resp.arrayBuffer();
        // Derive filename from URL or label
        const urlPath = new URL(asset.downloadUrl!).pathname;
        const ext = urlPath.split(".").pop() ?? "svg";
        const safeName = asset.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        files[`logos/${safeName}.${ext}`] = new Uint8Array(buf);
      } catch {
        // Skip unreachable assets silently
      }
    }),
  );

  const lr = tokens.logoRules;
  const readmeParts = [`# ${tokens.clientName} — Logo Pack`, ""];

  if (lr?.brandStrapline) readmeParts.push(`> ${lr.brandStrapline}`, "");

  if (assets.length) {
    readmeParts.push("## Assets");
    assets.forEach((a) => {
      readmeParts.push(`- **${a.label}** (${a.background ?? "light/dark"})`);
    });
    readmeParts.push("");
  }

  if (lr?.colourRules && lr.colourRules.length) {
    readmeParts.push("## Colour on surface");
    lr.colourRules.forEach((r) => {
      readmeParts.push(`- ${r.surface}: use the ${r.logoVersion}`);
    });
    readmeParts.push("");
  }

  if (lr?.minSizes && Object.keys(lr.minSizes).length) {
    readmeParts.push("## Minimum sizes");
    Object.entries(lr.minSizes).forEach(([k, v]) => {
      readmeParts.push(`- ${k}: ${v}`);
    });
    readmeParts.push("");
  }

  if (lr?.clearSpace) {
    readmeParts.push(`**Clear space:** ${lr.clearSpace}`, "");
  }

  if (lr?.rules && lr.rules.length) {
    readmeParts.push("## Usage rules");
    lr.rules.forEach((r) => readmeParts.push(`- ${r}`));
    readmeParts.push("");
  }

  if (lr?.notes) {
    readmeParts.push(`## Notes\n${lr.notes}`, "");
  }

  files["README.md"] = strToU8(readmeParts.join("\n"));

  return zipSync(files);
}

// ── download trigger ──────────────────────────────────────────────────────────

export function triggerDownload(data: Uint8Array, filename: string): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
