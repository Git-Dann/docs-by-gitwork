import type { DesignTokens } from "@/types/design-tokens";
import { zipSync, strToU8 } from "fflate";

// ── helpers ───────────────────────────────────────────────────────────────────

function collectFamilies(tokens: DesignTokens): string[] {
  const seen = new Set<string>();
  const push = (f: string | undefined) => { if (f?.trim()) seen.add(f.trim()); };
  push(tokens.typography.displayFont);
  push(tokens.typography.bodyFont);
  push(tokens.typography.monoFont);
  for (const t of tokens.typography.scale) push(t.fontFamily);
  return [...seen];
}

function weightsForFamily(tokens: DesignTokens, family: string): number[] {
  const seen = new Set<number>();
  for (const t of tokens.typography.scale) {
    if (t.fontFamily === family) seen.add(t.fontWeight);
  }
  if (seen.size === 0) seen.add(400);
  return [...seen].sort((a, b) => a - b);
}

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
    const hasItalic = /serif|display|script|italic/i.test(family);
    if (hasItalic) {
      const axisStr = weights.map((w) => `0,${w};1,${w}`).join(";");
      return `family=${encoded}:ital,wght@${axisStr}`;
    }
    return `family=${encoded}:wght@${weights.join(";")}`;
  });

  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}

// ── font file fetching ────────────────────────────────────────────────────────

interface FontFace {
  family: string;
  weight: number;
  style: string;
  unicodeRange: string;
  url: string;
  index: number; // position within family+weight+style group
}

/** Fetch the Google Fonts CSS and parse every @font-face block. */
async function parseFontFaces(gfUrl: string): Promise<FontFace[]> {
  const css = await fetch(gfUrl).then((r) => r.text());

  const blockRe = /@font-face\s*\{([^}]+)\}/g;
  const urlRe = /src:[^;]*url\(([^)]+)\)[^;]*format\(['"]woff2['"]\)/;
  const familyRe = /font-family:\s*['"]([^'"]+)['"]/;
  const weightRe = /font-weight:\s*(\d+)/;
  const styleRe = /font-style:\s*(\w+)/;
  const unicodeRe = /unicode-range:\s*([^;]+)/;

  const faces: FontFace[] = [];
  const groupCount: Record<string, number> = {};

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    const block = m[1];
    const urlMatch = urlRe.exec(block);
    const familyMatch = familyRe.exec(block);
    if (!urlMatch || !familyMatch) continue;

    const family = familyMatch[1];
    const weight = parseInt(weightRe.exec(block)?.[1] ?? "400");
    const style = styleRe.exec(block)?.[1] ?? "normal";
    const unicodeRange = unicodeRe.exec(block)?.[1]?.trim() ?? "";
    const key = `${family}-${weight}-${style}`;
    const index = groupCount[key] ?? 0;
    groupCount[key] = index + 1;

    faces.push({ family, weight, style, unicodeRange, url: urlMatch[1], index });
  }

  return faces;
}

function fontFilename(face: FontFace): string {
  const familySlug = face.family.toLowerCase().replace(/\s+/g, "-");
  const styleSuffix = face.style !== "normal" ? `-${face.style}` : "";
  return `fonts/${familySlug}-${face.weight}${styleSuffix}-${face.index}.woff2`;
}

// ── font pack ─────────────────────────────────────────────────────────────────

/** Fetches and bundles actual woff2 font files from Google Fonts. */
export async function buildFontPack(tokens: DesignTokens): Promise<Uint8Array> {
  const gfUrl = googleFontsUrl(tokens);
  const families = collectFamilies(tokens);

  const files: Record<string, Uint8Array> = {};
  const fontFaceDeclarations: string[] = [];

  if (gfUrl) {
    const faces = await parseFontFaces(gfUrl);

    await Promise.all(
      faces.map(async (face) => {
        try {
          const buf = await fetch(face.url).then((r) => r.arrayBuffer());
          const filename = fontFilename(face);
          files[filename] = new Uint8Array(buf);

          const lines = [
            "@font-face {",
            `  font-family: '${face.family}';`,
            `  font-style: ${face.style};`,
            `  font-weight: ${face.weight};`,
            `  font-display: swap;`,
            `  src: url('./${filename}') format('woff2');`,
          ];
          if (face.unicodeRange) lines.push(`  unicode-range: ${face.unicodeRange};`);
          lines.push("}");
          fontFaceDeclarations.push(lines.join("\n"));
        } catch {
          // Skip unreachable font file silently
        }
      }),
    );
  }

  const cssRoot = [
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

  const fontsCss = [
    fontFaceDeclarations.join("\n\n"),
    "",
    cssRoot,
  ]
    .filter(Boolean)
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
    tokens.typography.monoFont
      ? `  mono: ['${tokens.typography.monoFont}', 'monospace'],`
      : null,
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
    "## Type scale",
    "| Role               | Family                 | Weight | Size    | LH   |",
    "|:-------------------|:-----------------------|:-------|:--------|:-----|",
    scaleRows,
    "",
    "## Files",
    "- `fonts/` — self-hosted woff2 files (one per unicode range per weight)",
    "- `fonts.css` — `@font-face` declarations + `:root` CSS custom properties",
    "- `tailwind.js` — `fontFamily` snippet for `tailwind.config.js`",
    "- `README.md` — this file",
    "",
    "## Usage",
    "1. Copy the `fonts/` directory and `fonts.css` into your project.",
    "2. Add `@import './fonts.css';` at the top of your global stylesheet.",
    "3. Use the CSS variables (`var(--font-body)` etc.) or the Tailwind snippet.",
  ].join("\n");

  files["fonts.css"] = strToU8(fontsCss);
  files["tailwind.js"] = strToU8(tailwindLines);
  files["README.md"] = strToU8(readme);

  return zipSync(files);
}

// ── logo pack ─────────────────────────────────────────────────────────────────

function extFromUrl(url: string): string {
  if (url.startsWith("data:")) {
    // data:image/jpeg;base64,... → "jpeg"
    const mime = /^data:([^;,]+)/.exec(url)?.[1] ?? "image/png";
    return mime.split("/")[1] ?? "png";
  }
  try {
    const path = new URL(url).pathname;
    return path.split(".").pop()?.split("?")[0] ?? "png";
  } catch {
    return "png";
  }
}

/** Fetch any URL — handles both regular http(s) URLs and data URIs. */
async function fetchAsBytes(url: string): Promise<Uint8Array | null> {
  if (url.startsWith("data:")) {
    try {
      const commaIdx = url.indexOf(",");
      if (commaIdx === -1) return null;
      const meta = url.slice(5, commaIdx);
      const payload = url.slice(commaIdx + 1);
      if (meta.includes("base64")) {
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      return strToU8(decodeURIComponent(payload));
    } catch {
      return null;
    }
  }
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Fetches the client's uploaded logo and any logoRules assets with a downloadUrl,
 * then bundles them into a ZIP with usage rules in README.md.
 */
export async function buildLogoPack(
  tokens: DesignTokens,
  clientLogoUrl?: string | null,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  // Client's uploaded logo
  if (clientLogoUrl) {
    const bytes = await fetchAsBytes(clientLogoUrl);
    if (bytes) {
      const ext = extFromUrl(clientLogoUrl);
      files[`logos/logo.${ext}`] = bytes;
    }
  }

  // Skill-generated lockups with explicit downloadUrl
  const assets = tokens.logoRules?.assets ?? [];
  await Promise.all(
    assets
      .filter((a) => a.downloadUrl)
      .map(async (asset) => {
        const bytes = await fetchAsBytes(asset.downloadUrl!);
        if (bytes) {
          const ext = extFromUrl(asset.downloadUrl!);
          const safeName = asset.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          files[`logos/${safeName}.${ext}`] = bytes;
        }
      }),
  );

  const lr = tokens.logoRules;
  const readmeParts = [`# ${tokens.clientName} — Logo Pack`, ""];

  if (lr?.brandStrapline) readmeParts.push(`> ${lr.brandStrapline}`, "");

  readmeParts.push("## Files");
  if (clientLogoUrl) readmeParts.push("- `logos/logo.*` — uploaded client logo");
  assets
    .filter((a) => a.downloadUrl)
    .forEach((a) => readmeParts.push(`- **${a.label}**`));
  readmeParts.push("");

  if (lr?.colourRules?.length) {
    readmeParts.push("## Colour on surface");
    lr.colourRules.forEach((r) => readmeParts.push(`- ${r.surface}: use the ${r.logoVersion}`));
    readmeParts.push("");
  }

  if (lr?.minSizes && Object.keys(lr.minSizes).length) {
    readmeParts.push("## Minimum sizes");
    Object.entries(lr.minSizes).forEach(([k, v]) => readmeParts.push(`- ${k}: ${v}`));
    readmeParts.push("");
  }

  if (lr?.clearSpace) readmeParts.push(`**Clear space:** ${lr.clearSpace}`, "");

  if (lr?.rules?.length) {
    readmeParts.push("## Usage rules");
    lr.rules.forEach((r) => readmeParts.push(`- ${r}`));
    readmeParts.push("");
  }

  if (lr?.notes) readmeParts.push(`## Notes\n${lr.notes}`, "");

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
