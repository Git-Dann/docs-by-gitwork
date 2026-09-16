import { describe, expect, it } from "vitest";
import {
  MAX_BRANCHES_RADIAL,
  anchorFor,
  layoutRadial,
  wrapLabel,
  type RadialBranch,
} from "@/lib/insights/radial-layout";

const branch = (id: string, leaves: number, label = id): RadialBranch => ({
  id,
  label,
  color: "#2563eb",
  leaves: Array.from({ length: leaves }, (_, i) => ({ id: `${id}-l${i}`, label: `${id} leaf ${i}` })),
});

const coachman = {
  core: "Coachman caravan",
  branches: [
    branch("chassis", 4, "Chassis & running gear"),
    branch("habitation", 9, "Habitation"),
    branch("electrics", 6, "Electrics"),
    branch("warranty", 0, "Warranty"),
    branch("dealers", 12, "Dealer network"),
  ],
};

const finite = (n: number) => Number.isFinite(n);

describe("layoutRadial", () => {
  it("is deterministic — the same input twice gives byte-identical output", () => {
    // The single most valuable assertion here: a layout that moves between renders makes
    // every other test flap and makes a diagram feel broken to a person watching it.
    expect(JSON.stringify(layoutRadial(coachman))).toBe(JSON.stringify(layoutRadial(coachman)));
  });

  it("never emits a NaN, at any shape", () => {
    // The divide-by-zero cases are real: one branch (n-1 = 0), zero leaves, zero branches.
    const shapes = [
      { core: "X", branches: [] },
      { core: "X", branches: [branch("a", 0)] },
      { core: "X", branches: [branch("a", 1)] },
      { core: "X", branches: [branch("a", 0), branch("b", 0), branch("c", 0)] },
      coachman,
    ];
    for (const shape of shapes) {
      const out = layoutRadial(shape);
      for (const n of out.nodes) {
        expect([n.x, n.y, n.r, n.labelX, n.labelY].every(finite), `node ${n.id}`).toBe(true);
      }
      for (const e of out.edges) {
        expect([e.x1, e.y1, e.x2, e.y2].every(finite), `edge ${e.id}`).toBe(true);
      }
      expect(out.viewBox).not.toContain("NaN");
    }
  });

  it("gives a branch with more leaves a proportionally bigger wedge", () => {
    // Even spacing looks broken the moment the tree is lopsided — a branch with nine
    // leaves needs more arc than one with none.
    const out = layoutRadial({
      core: "X",
      branches: [branch("big", 9), branch("small", 1)],
    });
    // ⚠️ Measured relative to the branch's OWN centre and normalised to (-π, π].
    // Subtracting two raw atan2 values is wrong whenever the wedge crosses ±π, which a
    // 5-radian wedge always does — an earlier version of this test read 1.78 for a
    // spread of 4.5 and looked like a layout bug.
    const spreadAround = (branchId: string, leafIds: string[]) => {
      const b = out.nodes.find((x) => x.id === branchId)!;
      const centre = Math.atan2(b.y, b.x);
      const rel = leafIds.map((id) => {
        const n = out.nodes.find((x) => x.id === id)!;
        let d = Math.atan2(n.y, n.x) - centre;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      });
      return Math.max(...rel) - Math.min(...rel);
    };
    // weights 10 vs 2 → the big branch owns 10/12 of the circle, so its leaves span
    // 0.86 × 2π × 10/12 ≈ 4.5 radians.
    expect(spreadAround("big", ["big-l0", "big-l4", "big-l8"])).toBeGreaterThan(4);
    // …and the small branch's single leaf sits on its own spoke, spanning nothing.
    expect(spreadAround("small", ["small-l0"])).toBeCloseTo(0, 5);
  });

  it("puts the first branch at twelve o'clock", () => {
    const out = layoutRadial({ core: "X", branches: [branch("a", 2), branch("b", 2)] });
    const a = out.nodes.find((n) => n.id === "a")!;
    expect(Math.atan2(a.y, a.x)).toBeCloseTo(-Math.PI / 2, 5);
  });

  it("keeps leaves apart even on a single 40-leaf branch", () => {
    // The assertion that proves the radius growth and the stagger actually work. It fails
    // loudly if either constant is retuned badly, which is the point of having them.
    const out = layoutRadial({ core: "Coachman", branches: [branch("all", 40)] });
    const leaves = out.nodes.filter((n) => n.kind === "leaf");
    let min = Infinity;
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const d = Math.hypot(leaves[i].x - leaves[j].x, leaves[i].y - leaves[j].y);
        min = Math.min(min, d);
      }
    }
    expect(min).toBeGreaterThan(2 * 7 + 6);
  });

  it("contains every circle and every label inside the emitted viewBox", () => {
    const out = layoutRadial(coachman);
    const [vx, vy, vw, vh] = out.viewBox.split(" ").map(Number);
    for (const n of out.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(vx - 0.5);
      expect(n.x + n.r).toBeLessThanOrEqual(vx + vw + 0.5);
      expect(n.y - n.r).toBeGreaterThanOrEqual(vy - 0.5);
      expect(n.y + n.r).toBeLessThanOrEqual(vy + vh + 0.5);
      expect(n.labelY).toBeLessThanOrEqual(vy + vh + 0.5);
    }
  });

  it("keeps the aspect ratio in a range a phone can render", () => {
    // Asserted at the MATHS level, where it can actually be tested — a very wide or very
    // tall viewBox scaled into a 350px column is illegible whatever the CSS says.
    for (let b = 1; b <= MAX_BRANCHES_RADIAL; b++) {
      const out = layoutRadial({
        core: "Core",
        branches: Array.from({ length: b }, (_, i) => branch(`b${i}`, i % 5)),
      });
      const ratio = out.width / out.height;
      expect(ratio, `${b} branches`).toBeGreaterThan(0.55);
      expect(ratio, `${b} branches`).toBeLessThan(1.9);
    }
  });

  it("gives a branch with no leaves a real wedge and a spoke", () => {
    const out = layoutRadial({ core: "X", branches: [branch("empty", 0), branch("full", 6)] });
    expect(out.nodes.find((n) => n.id === "empty")).toBeTruthy();
    expect(out.edges.some((e) => e.id === "e-empty")).toBe(true);
  });

  it("flags overflow past the cap instead of drawing a hairball", () => {
    const many = Array.from({ length: MAX_BRANCHES_RADIAL + 1 }, (_, i) => branch(`b${i}`, 2));
    const out = layoutRadial({ core: "X", branches: many });
    expect(out.overflow).toBe(true);
    // …and it does not half-draw it: the caller renders the list instead.
    expect(out.nodes).toHaveLength(1);
    expect(layoutRadial({ core: "X", branches: many.slice(0, MAX_BRANCHES_RADIAL) }).overflow).toBe(false);
  });

  it("closes a single branch's leaves into a ring rather than overlapping first and last", () => {
    const out = layoutRadial({ core: "X", branches: [branch("only", 8)] });
    const first = out.nodes.find((n) => n.id === "only-l0")!;
    const last = out.nodes.find((n) => n.id === "only-l7")!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(20);
  });

  it("keeps the full label available as a title even when it wraps", () => {
    const long = "Habitation, damp ingress and the associated warranty programme";
    const out = layoutRadial({ core: "X", branches: [{ ...branch("b", 0), label: long }] });
    expect(out.nodes.find((n) => n.id === "b")!.title).toBe(long);
  });
});

describe("wrapLabel", () => {
  it("leaves a short label alone", () => {
    expect(wrapLabel("Chassis", 130, 11)).toEqual(["Chassis"]);
  });

  it("wraps to at most two lines and ellipses the second", () => {
    const lines = wrapLabel(
      "A label so long that it could not possibly fit inside the box allotted to it",
      130,
      11,
    );
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines[lines.length - 1].endsWith("…")).toBe(true);
  });

  it("hard-slices a single unbroken token rather than overflowing", () => {
    const lines = wrapLabel("Supercalifragilisticexpialidocious0123456789", 60, 11);
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith("…")).toBe(true);
    expect(lines[0].length).toBeLessThan(20);
  });

  it("returns one empty line rather than nothing for empty input", () => {
    // A node with no label still has to be drawn; returning [] would render no <tspan>.
    expect(wrapLabel("   ", 130, 11)).toEqual([""]);
  });
});

describe("anchorFor", () => {
  it("anchors right of a node on the right, left of one on the left", () => {
    expect(anchorFor(1)).toBe("start");
    expect(anchorFor(-1)).toBe("end");
  });

  it("uses a dead band at the top and bottom", () => {
    // Without it, 89.9° and 90.1° put the label on opposite sides — output that looks
    // unstable for a reason nobody can see.
    expect(anchorFor(0.01)).toBe("middle");
    expect(anchorFor(-0.01)).toBe("middle");
    expect(anchorFor(0)).toBe("middle");
  });
});
