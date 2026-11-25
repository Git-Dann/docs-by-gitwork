/**
 * Dispatch reading a client's Figma designs. Pure: no fetch, no DB.
 *
 * The only files are the ones linked as the pinned client's designs (`ClientDesign.url`). A
 * Figma link pasted into the question that isn't one of those is refused.
 */

export interface DesignChoice {
  name: string;
  fileKey: string;
  /** The frame the link pointed at, if it had a node-id ("12:34"). */
  nodeId: string | null;
}

/** Figma's file key (and node, if any) from a design link; null if it isn't a Figma file link. */
export function parseFigmaUrl(url: string | null | undefined): { fileKey: string; nodeId: string | null } | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(?:file|design|proto|board)\/([A-Za-z0-9]{10,64})(?:\/|$)/);
  if (!m) return null;
  const raw = u.searchParams.get("node-id");
  // Links use "12-34"; the API uses "12:34".
  const nodeId = raw && /^\d+[-:]\d+$/.test(raw) ? raw.replace("-", ":") : null;
  return { fileKey: m[1], nodeId };
}

export function designChoices(designs: readonly { name: string; url: string | null }[]): DesignChoice[] {
  const out: DesignChoice[] = [];
  for (const d of designs) {
    const p = parseFigmaUrl(d.url);
    if (p) out.push({ name: d.name, ...p });
  }
  return out;
}

/** The design a tool call means, or the plain-English problem. Never a file outside the list. */
export function pickDesign(choices: readonly DesignChoice[], wanted: string | undefined): DesignChoice | string {
  if (!choices.length) return "This client has no Figma design linked in Portal (Designs).";
  const w = wanted?.trim().toLowerCase();
  if (!w) {
    if (choices.length === 1) return choices[0];
    return `This client has ${choices.length} Figma designs. Say which: ${choices.map((c) => c.name).join(", ")}.`;
  }
  const byKey = parseFigmaUrl(wanted)?.fileKey;
  const hit = choices.find((c) => c.name.toLowerCase() === w || c.fileKey === byKey || c.fileKey.toLowerCase() === w);
  return hit ?? `That isn't one of this client's designs. They are: ${choices.map((c) => c.name).join(", ")}.`;
}

/** A Figma node id the model passed ("12:34"), or null. */
export function cleanNodeId(id: string | undefined): string | null {
  const v = (id ?? "").trim().replace("-", ":");
  return /^\d+:\d+$/.test(v) ? v : null;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  visible?: boolean;
  absoluteBoundingBox?: { width: number; height: number } | null;
  children?: FigmaNode[];
}

/**
 * The words on a frame, in reading order, one line per text layer ("Layer name: text"), capped.
 * Hidden layers are left out: they aren't part of the design anyone sees.
 */
export function frameText(node: FigmaNode, cap = 6000): string {
  const out: string[] = [];
  let used = 0;
  const walk = (n: FigmaNode) => {
    if (n.visible === false || used > cap) return;
    if (n.type === "TEXT" && n.characters?.trim()) {
      const line = `${n.name.trim() === n.characters.trim() ? "" : `${n.name}: `}${n.characters.replace(/\s+/g, " ").trim()}`;
      used += line.length + 1;
      out.push(line);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out.join("\n").slice(0, cap);
}

/** The top-level frames of each page: what a person means by "a screen". */
export function listFrames(document: FigmaNode, cap = 150): { page: string; id: string; name: string; size: string }[] {
  const out: { page: string; id: string; name: string; size: string }[] = [];
  for (const page of document.children ?? []) {
    for (const f of page.children ?? []) {
      if (!["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "INSTANCE"].includes(f.type)) continue;
      const b = f.absoluteBoundingBox;
      out.push({ page: page.name, id: f.id, name: f.name, size: b ? `${Math.round(b.width)}×${Math.round(b.height)}` : "" });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/**
 * Figma renders at `scale` × the frame's size. Pick one that keeps the longest side at or under
 * `maxSide` px (images cost tokens by area), never upscaled, never below Figma's 0.01 minimum.
 */
export function imageScale(box: { width: number; height: number } | null | undefined, maxSide = 1200): number {
  if (!box || box.width <= 0 || box.height <= 0) return 1;
  const s = maxSide / Math.max(box.width, box.height);
  return Math.max(0.01, Math.min(1, Math.round(s * 100) / 100));
}
