/**
 * Accessibility facts read from a page's own markup and inline CSS: whether the page's CSS
 * styles or removes the keyboard focus indicator, the contrast of colour pairs set inline
 * on an element, and the document language. Linked stylesheets are not read here, so each
 * verdict says when they could change the answer. Pure, no I/O.
 */

type Verdict = { status: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE"; detail: string; evidence?: string };

/** Inline <style> blocks plus style attributes, capped so a huge page cannot stall a regex. */
function inlineCss(html: string): string {
  const blocks = (html.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi) ?? []).map((b) => b.replace(/^<style\b[^>]*>|<\/style\s*>$/gi, ""));
  return blocks.join("\n").slice(0, 2_000_000);
}

const hasExternalCss = (html: string) =>
  /<link\b[^>]*\srel=["']?[^"'>]*\bstylesheet\b/i.test(html) || /<link\b[^>]*\sas=["']?style\b/i.test(html) || /@import\s+(?:url\(|["'])/i.test(html);

/** Declarations that draw something a sighted keyboard user can see. */
function drawsIndicator(decls: string): boolean {
  const outline = /(?:^|;|\s)outline\s*:\s*([^;}]+)/i.exec(decls)?.[1]?.trim().toLowerCase();
  if (outline && !/^(?:none|0(?:px)?|0\s+none)\b/.test(outline) && !/^(?:none|0)(?:\s*!important)?$/.test(outline)) return true;
  const outlineStyle = /outline-style\s*:\s*([\w-]+)/i.exec(decls)?.[1]?.toLowerCase();
  if (outlineStyle && outlineStyle !== "none") return true;
  const shadow = /box-shadow\s*:\s*([^;}]+)/i.exec(decls)?.[1]?.trim().toLowerCase();
  if (shadow && !/^none\b/.test(shadow)) return true;
  if (/(?:^|;|\s)border(?:-(?:top|right|bottom|left))?(?:-color)?\s*:\s*(?!none|0\b)[^;}]+/i.test(decls)) return true;
  return /text-decoration\s*:\s*underline/i.test(decls);
}

/** Declarations that take the browser's default focus outline away. */
const removesOutline = (decls: string) => /(?:^|;|\s)outline\s*:\s*(?:none|0(?:px)?)\b/i.test(decls) || /outline-style\s*:\s*none/i.test(decls) || /outline-width\s*:\s*0/i.test(decls);

/**
 * WCAG 2.4.7 from the page's own CSS. `:focus { outline: none }` removes the indicator
 * and must never count as having one (the old check passed it because it contained
 * "outline"). `:focus:not(:focus-visible)` is the recommended way to hide the ring for
 * mouse users only, so suppression there is not a finding.
 */
export function focusIndicatorVerdict(html: string): Verdict {
  const css = inlineCss(html);
  const rules = [...css.matchAll(/([^{}]{1,600})\{([^{}]{0,2000})\}/g)].map((m) => ({ sel: m[1].trim(), decls: m[2] }));
  const focusRules = rules.filter((r) => /:focus(?:-visible)?\b(?!-within)/i.test(r.sel));
  const styled = focusRules.find((r) => drawsIndicator(r.decls));
  // Utility classes in the markup (Tailwind and similar) style focus without inline CSS.
  const utility = /class=["'][^"']*\bfocus(?:-visible)?:(?:ring|outline-(?!none\b)[\w-]+|shadow|border)\b[^"']*["']/i.exec(html);
  if (styled) return { status: "PASS", detail: `The page's CSS draws a focus indicator (\`${styled.sel.slice(0, 60)}\`).`, evidence: styled.sel.slice(0, 80) };
  if (utility) return { status: "PASS", detail: "Elements on the page carry focus-indicator utility classes (for example focus-visible:ring).", evidence: utility[0].slice(0, 80) };

  const suppressing = rules.find((r) => removesOutline(r.decls) && (/:focus\b(?!-visible|-within)/i.test(r.sel) || /(?:^|,)\s*(?:\*|a|button|input|:root\s*\*)\s*(?:,|$)/i.test(r.sel))
    && !/:not\(\s*:focus-visible\s*\)/i.test(r.sel));
  const external = hasExternalCss(html);
  if (suppressing) {
    return external
      ? { status: "INCONCLUSIVE", detail: `The page's own CSS removes the focus outline (\`${suppressing.sel.slice(0, 60)}\`) and draws no replacement. Linked stylesheets were not read and may restore one, so whether keyboard users can see focus could not be established (WCAG 2.4.7).`, evidence: suppressing.sel.slice(0, 80) }
      : { status: "WARN", detail: `The page's CSS removes the focus outline (\`${suppressing.sel.slice(0, 60)}\`) and draws no replacement, and the page loads no other stylesheet. Keyboard users cannot see which element has focus (WCAG 2.4.7).`, evidence: suppressing.sel.slice(0, 80) };
  }
  return external
    ? { status: "INCONCLUSIVE", detail: "The page's own CSS neither styles nor removes the focus indicator. Linked stylesheets were not read, so whether they keep it could not be established (WCAG 2.4.7)." }
    : { status: "PASS", detail: "Nothing in the page's CSS removes the browser's default focus outline, and the page loads no other stylesheet, so the default indicator stays visible (WCAG 2.4.7)." };
}

/** #rgb / #rrggbb / rgb() / rgba() with full alpha, as 0-255 channels; anything else is null. */
function parseColour(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1|1\.0+|100%))?\s*\)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  if (v === "white") return [255, 255, 255];
  if (v === "black") return [0, 0, 0];
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Elements whose style attribute sets BOTH a text colour and a solid background colour,
 * so the pair is fully known without layout. The old check never computed a ratio.
 */
export function inlineContrastVerdict(html: string): Verdict {
  const pairs: Array<{ fg: string; bg: string; ratio: number }> = [];
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]{0,600})"|\sstyle\s*=\s*'([^']{0,600})'/gi)) {
    const style = m[1] ?? m[2] ?? "";
    const fg = /(?:^|;)\s*color\s*:\s*([^;!]+)/i.exec(style)?.[1];
    const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;!]+)/i.exec(style)?.[1];
    if (!fg || !bg) continue;
    const f = parseColour(fg); const b = parseColour(bg);
    if (!f || !b) continue;
    pairs.push({ fg: fg.trim(), bg: bg.trim(), ratio: contrastRatio(f, b) });
    if (pairs.length >= 200) break;
  }
  if (pairs.length === 0) {
    return { status: "INCONCLUSIVE", detail: "No element on the page sets both its text colour and a solid background inline, and colours set in stylesheets need a rendered page to pair up, so contrast could not be measured here. Use Lighthouse or axe on the rendered page (WCAG 1.4.3)." };
  }
  const low = pairs.filter((p) => p.ratio < 4.5).sort((x, y) => x.ratio - y.ratio);
  if (low.length > 0) {
    const w = low[0];
    return { status: "WARN", detail: `${low.length} of ${pairs.length} inline colour pair${pairs.length > 1 ? "s" : ""} fall below 4.5:1; the lowest is ${w.fg} on ${w.bg} at ${w.ratio.toFixed(2)}:1. Normal-size text needs 4.5:1 and large text 3:1 (WCAG 1.4.3).`, evidence: `${w.fg} on ${w.bg} = ${w.ratio.toFixed(2)}:1` };
  }
  return { status: "PASS", detail: `All ${pairs.length} colour pair${pairs.length > 1 ? "s" : ""} set inline on the page reach at least 4.5:1. Colours set in stylesheets were not measured.` };
}

/** The lang attribute on the <html> element, quoted or not (`lang=en` is valid HTML). */
export function htmlLangVerdict(html: string): Verdict {
  const openTag = /<html\b[^>]*>/i.exec(html)?.[0];
  if (!openTag) return { status: "INCONCLUSIVE", detail: "The response has no <html> element to read a language from." };
  const m = /\s(?:xml:)?lang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(openTag);
  const value = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
  if (!m) return { status: "FAIL", detail: "The <html> element has no lang attribute. WCAG 3.1.1 requires the page language so screen readers pronounce the content correctly." };
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return { status: "FAIL", detail: `The <html> lang attribute is "${value}", which is not a language tag (for example "en" or "en-GB"). WCAG 3.1.1 requires a valid page language.`, evidence: openTag.slice(0, 120) };
  return { status: "PASS", detail: `The <html> element declares lang="${value}", so screen readers can choose the right pronunciation.`, evidence: `lang=${value}` };
}
