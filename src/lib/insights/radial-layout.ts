/**
 * Two-level radial layout for a node diagram — a core entity with branches around it and
 * leaves off each branch.
 *
 * The case this exists for, in Dan's words: "show them the caravan as a core then loads of
 * connected entities". Pure, DOM-free and deterministic, so the part that actually breaks
 * — the geometry — is tested rather than eyeballed.
 *
 * ## Why no stored coordinates
 *
 * A freeform canvas with saved x/y cannot reflow to a phone, and a board could be saved in
 * a state that renders wrong. Computing the layout means a diagram is correct by
 * construction at every width, and the author's job is to list entities rather than to
 * arrange them.
 *
 * ## Why only two levels
 *
 * Three levels is a tree, and a tree wants a tree layout. The radial form is legible
 * exactly while "core → thing → detail" holds; past that it becomes a hairball that a
 * bulleted list beats. `MAX_BRANCHES_RADIAL` draws the same line at the other end.
 */

export interface RadialLeaf {
  id: string;
  label: string;
}

export interface RadialBranch {
  id: string;
  label: string;
  /** Resolved hex — the caller has already been through the palette. */
  color: string;
  leaves: RadialLeaf[];
}

export interface RadialInput {
  core: string;
  branches: RadialBranch[];
}

export interface PlacedNode {
  id: string;
  kind: "core" | "branch" | "leaf";
  x: number;
  y: number;
  r: number;
  color: string;
  /** Wrapped label lines — at most two, the second ellipsed if it had to be cut. */
  lines: string[];
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
  /** The full label, for a `title` — a wrapped/ellipsed label must stay recoverable. */
  title: string;
}

export interface RadialEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface RadialLayout {
  nodes: PlacedNode[];
  edges: RadialEdge[];
  viewBox: string;
  width: number;
  height: number;
  /**
   * True when the board is past what a radial diagram can say clearly. The component
   * renders the list instead — which for 20 branches is not a degraded mode, it is the
   * better artefact.
   */
  overflow: boolean;
}

const CORE_R = 46;
const BRANCH_R_BASE = 26;
const BRANCH_R_TIGHT = 18;
const LEAF_R = 7;
const LABEL_GAP = 10;
/** Minimum arc between two leaf centres before the ring is staggered. */
const MIN_LEAF_ARC = 22;
const STAGGER_STEP = 54;
export const MAX_BRANCHES_RADIAL = 10;

const MAX_LABEL_PX = { core: 84, branch: 120, leaf: 130 } as const;
const FONT_PX = { core: 13, branch: 12, leaf: 11 } as const;
/**
 * Conservative average glyph width as a fraction of font size. Real Inter runs ~0.52;
 * over-estimating is the safe direction — it wraps a little early rather than letting a
 * label run outside the computed viewBox.
 */
const CHAR_W = 0.58;

function estWidth(text: string, px: number): number {
  return text.length * px * CHAR_W;
}

/**
 * Greedy word wrap to at most two lines, hard-slicing a single unbroken token.
 *
 * Two lines, not more: the height of a node is what everything else is spaced against, so
 * an unbounded label makes the whole figure unbounded.
 */
export function wrapLabel(text: string, maxPx: number, fontPx: number): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [""];
  if (estWidth(clean, fontPx) <= maxPx) return [clean];

  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estWidth(candidate, fontPx) <= maxPx || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    }
  }
  if (lines.length < 2 && line) lines.push(line);

  // A single unbroken token longer than the box — slice it rather than let it overflow.
  const capped = lines.slice(0, 2).map((l) => {
    if (estWidth(l, fontPx) <= maxPx) return l;
    const max = Math.max(1, Math.floor(maxPx / (fontPx * CHAR_W)) - 1);
    return `${l.slice(0, max)}…`;
  });

  // Anything that did not fit in two lines is signalled, not silently dropped.
  const used = capped.join(" ").replace(/…$/, "");
  if (!clean.startsWith(used) || used.length < clean.length) {
    const last = capped[capped.length - 1];
    if (!last.endsWith("…")) {
      const max = Math.max(1, Math.floor(maxPx / (fontPx * CHAR_W)) - 1);
      capped[capped.length - 1] = `${last.slice(0, max)}…`;
    }
  }
  return capped;
}

/**
 * Where a label sits relative to its node, from its angle.
 *
 * ⚠️ The dead band matters. Without it a node at 89.9° and one at 90.1° flip the label to
 * opposite sides, which makes the output look unstable near 12 and 6 o'clock for no
 * reason a reader can see.
 */
export function anchorFor(cos: number): "start" | "middle" | "end" {
  if (cos > 0.08) return "start";
  if (cos < -0.08) return "end";
  return "middle";
}

export function layoutRadial(input: RadialInput): RadialLayout {
  const branches = input.branches;
  const B = branches.length;
  const overflow = B > MAX_BRANCHES_RADIAL;

  const coreLines = wrapLabel(input.core || "Core", MAX_LABEL_PX.core, FONT_PX.core);
  const core: PlacedNode = {
    id: "__core",
    kind: "core",
    x: 0,
    y: 0,
    r: CORE_R,
    color: "",
    lines: coreLines,
    labelX: 0,
    labelY: 0,
    anchor: "middle",
    title: input.core,
  };

  if (B === 0 || overflow) {
    const pad = CORE_R + 16;
    return {
      nodes: [core],
      edges: [],
      viewBox: `${-pad} ${-pad} ${pad * 2} ${pad * 2}`,
      width: pad * 2,
      height: pad * 2,
      overflow,
    };
  }

  const L = branches.reduce((sum, b) => sum + b.leaves.length, 0);
  const maxLeaves = branches.reduce((m, b) => Math.max(m, b.leaves.length), 0);
  const branchR = B > 6 ? BRANCH_R_TIGHT : BRANCH_R_BASE;

  const BRANCH_RING = 170 + 6 * B;
  /**
   * The leaf ring grows until its circumference can hold every leaf at a readable pitch.
   * 22 viewBox-px of arc per leaf is the floor; below that they collide however they are
   * staggered. At 100 leaves this gives a ~407px ring, the viewBox grows with it, and the
   * SVG scales down — which is the "loads of connected entities" case working.
   */
  const LEAF_RING = Math.max(
    BRANCH_RING + 120 + 4 * maxLeaves,
    (L * MIN_LEAF_ARC) / (2 * Math.PI * 0.86),
  );

  // Angular slice proportional to 1 + leafCount. The `1 +` is load-bearing twice: a branch
  // with no leaves still earns a wedge, and an all-empty board does not divide by zero.
  const weights = branches.map((b) => 1 + b.leaves.length);
  const W = weights.reduce((a, b) => a + b, 0);

  const nodes: PlacedNode[] = [core];
  const edges: RadialEdge[] = [];

  let cursor = -Math.PI / 2 - (2 * Math.PI * weights[0]) / W / 2; // branch 0 centred at 12 o'clock
  branches.forEach((branch, bi) => {
    const span = (2 * Math.PI * weights[bi]) / W;
    const theta = cursor + span / 2;
    cursor += span;

    const bx = Math.cos(theta) * BRANCH_RING;
    const by = Math.sin(theta) * BRANCH_RING;
    const bAnchor = anchorFor(Math.cos(theta));
    nodes.push({
      id: branch.id,
      kind: "branch",
      x: bx,
      y: by,
      r: branchR,
      color: branch.color,
      lines: wrapLabel(branch.label, MAX_LABEL_PX.branch, FONT_PX.branch),
      labelX: bx + Math.cos(theta) * (branchR + LABEL_GAP),
      labelY:
        by +
        Math.sin(theta) * (branchR + LABEL_GAP) +
        (bAnchor === "middle" ? (Math.sin(theta) > 0 ? 12 : -6) : 4),
      anchor: bAnchor,
      title: branch.label,
    });
    edges.push({ id: `e-${branch.id}`, x1: 0, y1: 0, x2: bx, y2: by, color: branch.color });

    const n = branch.leaves.length;
    if (n === 0) return;
    const usable = span * 0.86; // a 7% gutter each side keeps neighbouring wedges apart
    const closed = span > 1.9 * Math.PI; // effectively a full circle (the one-branch case)
    const arcStep = (usable * LEAF_RING) / Math.max(1, n - 1);
    const stagger = arcStep < MIN_LEAF_ARC;

    branch.leaves.forEach((leaf, li) => {
      const t =
        n === 1
          ? theta
          : closed
            ? theta - usable / 2 + (usable * li) / n // ring: k/n, or first and last collide
            : theta - usable / 2 + (usable * li) / (n - 1); // fan: k/(n-1)
      // Staggering is per BRANCH, not global — one crowded branch must not push every
      // other branch's leaves outwards.
      const radius = LEAF_RING + (stagger ? (li % 2) * STAGGER_STEP : 0);
      const lx = Math.cos(t) * radius;
      const ly = Math.sin(t) * radius;
      const lAnchor = anchorFor(Math.cos(t));
      nodes.push({
        id: leaf.id,
        kind: "leaf",
        x: lx,
        y: ly,
        r: LEAF_R,
        color: branch.color,
        lines: wrapLabel(leaf.label, MAX_LABEL_PX.leaf, FONT_PX.leaf),
        labelX: lx + Math.cos(t) * (LEAF_R + LABEL_GAP),
        labelY:
          ly +
          Math.sin(t) * (LEAF_R + LABEL_GAP) +
          (lAnchor === "middle" ? (Math.sin(t) > 0 ? 12 : -6) : 4),
        anchor: lAnchor,
        title: leaf.label,
      });
      edges.push({ id: `e-${leaf.id}`, x1: bx, y1: by, x2: lx, y2: ly, color: branch.color });
    });
  });

  // viewBox from the union of every circle AND every label box, so the figure is cropped
  // to what it actually drew rather than to a guessed aspect.
  let minX = -CORE_R;
  let maxX = CORE_R;
  let minY = -CORE_R;
  let maxY = CORE_R;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    minY = Math.min(minY, node.y - node.r);
    maxY = Math.max(maxY, node.y + node.r);
    const fontPx = FONT_PX[node.kind];
    const w = Math.max(...node.lines.map((l) => estWidth(l, fontPx)), 0);
    const left = node.anchor === "start" ? node.labelX : node.anchor === "end" ? node.labelX - w : node.labelX - w / 2;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, left + w);
    minY = Math.min(minY, node.labelY - fontPx);
    maxY = Math.max(maxY, node.labelY + fontPx * 1.15 * node.lines.length);
  }
  const pad = 12;
  minX -= pad;
  minY -= pad;
  let width = maxX - minX + pad;
  let height = maxY - minY + pad;

  /**
   * Keep the viewBox within a sane aspect by padding the narrow axis.
   *
   * A degenerate board — one branch, no leaves — otherwise produces a tall, thin figure
   * (measured at 0.39) which, scaled into a card, renders as a sliver. Padding rather
   * than scaling keeps the geometry untouched and just gives it somewhere to sit.
   */
  const MIN_ASPECT = 0.75;
  const MAX_ASPECT = 1.8;
  if (width / height < MIN_ASPECT) {
    const target = height * MIN_ASPECT;
    const extra = (target - width) / 2;
    minX -= extra;
    width = target;
  } else if (width / height > MAX_ASPECT) {
    const target = width / MAX_ASPECT;
    const extra = (target - height) / 2;
    minY -= extra;
    height = target;
  }

  return {
    nodes,
    edges,
    viewBox: `${round(minX)} ${round(minY)} ${round(width)} ${round(height)}`,
    width: round(width),
    height: round(height),
    overflow: false,
  };
}

/** Rounding keeps the emitted viewBox stable across platforms — a float that differs in
 *  its last digit would make a snapshot test flap for no reason. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
