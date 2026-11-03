/**
 * The Insights DTO is a DISCRIMINATED UNION, and these tests exist to keep it one.
 *
 * The database stores one board table with five nullable config columns. The pressure to
 * let that shape leak onto the wire — one flat record with `value: number | null` and a
 * `parentId` that means nothing for three of the four types — is exactly what produces
 * "why is this nullable?" three months later, and a renderer full of branches that can
 * never fire. So the serializer is tested from fixtures, with no database, against two
 * properties: no `Date` survives, and a board of one kind carries no field belonging to
 * another.
 */
import { describe, expect, it } from "vitest";
import { safeInsightLink, serializeInsightBoard } from "@/server/wiki-insights";

const T = new Date("2026-09-01T10:00:00.000Z");

type Row = Parameters<typeof serializeInsightBoard>[0];

function row(over: Partial<Row> = {}): Row {
  return {
    id: "b1",
    type: "BAR",
    title: "Where the time went",
    caption: null,
    valueUnit: null,
    setALabel: null,
    setBLabel: null,
    setCLabel: null,
    coreLabel: null,
    createdAt: T,
    updatedAt: T,
    seriesPoints: [],
    vennItems: [],
    nodes: [],
    ...over,
  };
}

const point = (id: string, label: string, value: number, color: string | null = null) => ({
  id,
  label,
  value,
  color,
  note: null,
});

describe("serializeInsightBoard — the wire format", () => {
  it("returns no Date anywhere", () => {
    const dto = serializeInsightBoard(row());
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
    expect(dto.createdAt).toBe(T.toISOString());
  });

  it("gives a bar board no venn or node fields", () => {
    // The union's whole purpose. If this ever fails, someone has flattened the DTO and
    // every renderer now has to handle fields that cannot apply to it.
    const dto = serializeInsightBoard(row({ seriesPoints: [point("p1", "Playback", 34)] }));
    expect(dto.kind).toBe("bar");
    expect(dto).not.toHaveProperty("sets");
    expect(dto).not.toHaveProperty("items");
    expect(dto).not.toHaveProperty("branches");
    expect(dto).not.toHaveProperty("core");
  });

  it("gives a node board no points and no unit", () => {
    const dto = serializeInsightBoard(
      row({ type: "NODE", coreLabel: "Coachman caravan", nodes: [] }),
    );
    expect(dto.kind).toBe("node");
    expect(dto).not.toHaveProperty("points");
    expect(dto).not.toHaveProperty("unit");
  });

  it("distinguishes a pie from a bar, on the same stored shape", () => {
    expect(serializeInsightBoard(row({ type: "PIE" })).kind).toBe("pie");
    expect(serializeInsightBoard(row({ type: "BAR" })).kind).toBe("bar");
  });
});

describe("colours are resolved, never trusted", () => {
  it("assigns a colour by POSITION when a point has none", () => {
    // Falling back to one default would draw six identical slices, which is not a pie.
    const dto = serializeInsightBoard(
      row({ seriesPoints: [point("a", "A", 1), point("b", "B", 1), point("c", "C", 1)] }),
    );
    const colors = dto.kind === "bar" ? dto.points.map((p) => p.color) : [];
    expect(new Set(colors).size).toBe(3);
  });

  it("replaces a colour that is not in the palette", () => {
    // A stored hex outlives the palette it came from. Anything not a known key is
    // re-derived rather than passed through.
    const dto = serializeInsightBoard(
      row({ seriesPoints: [point("a", "A", 1, "#ff00ff"), point("b", "B", 1, "emerald")] }),
    );
    if (dto.kind !== "bar") throw new Error("expected a bar board");
    expect(dto.points[0].color).not.toBe("#ff00ff");
    expect(dto.points[1].color).toBe("emerald");
  });
});

describe("venn boards", () => {
  const vennRow = (sets: (string | null)[], items: { region: string; label: string }[]) =>
    row({
      type: "VENN",
      setALabel: sets[0] ?? null,
      setBLabel: sets[1] ?? null,
      setCLabel: sets[2] ?? null,
      vennItems: items.map((i, n) => ({
        id: `v${n}`,
        label: i.label,
        region: i.region as never,
        note: null,
      })),
    });

  it("derives set colours by position rather than storing them", () => {
    const dto = serializeInsightBoard(vennRow(["Standard", "Premium", null], []));
    if (dto.kind !== "venn") throw new Error("expected a venn board");
    expect(dto.sets.map((s) => s.key)).toEqual(["A", "B"]);
    expect(new Set(dto.sets.map((s) => s.color)).size).toBe(2);
  });

  it("drops a set with no label rather than rendering an unnamed circle", () => {
    const dto = serializeInsightBoard(vennRow(["Standard", "Premium", "   "], []));
    if (dto.kind !== "venn") throw new Error("expected a venn board");
    expect(dto.sets).toHaveLength(2);
  });

  it("DROPS an item whose region the board's set count cannot express", () => {
    // Reachable by clearing the third set after items were placed in it. Rendering the
    // item somewhere else would silently move a fact; dropping it does not invent a home.
    const dto = serializeInsightBoard(
      vennRow(["Standard", "Premium", null], [
        { region: "AB", label: "Ad-free" },
        { region: "ABC", label: "Orphaned" },
        { region: "C", label: "Also orphaned" },
      ]),
    );
    if (dto.kind !== "venn") throw new Error("expected a venn board");
    expect(dto.items.map((i) => i.label)).toEqual(["Ad-free"]);
  });

  it("keeps every three-set region once a third set is named", () => {
    const dto = serializeInsightBoard(
      vennRow(["A", "B", "C"], [
        { region: "ABC", label: "All" },
        { region: "BC", label: "Two" },
      ]),
    );
    if (dto.kind !== "venn") throw new Error("expected a venn board");
    expect(dto.items).toHaveLength(2);
  });
});

describe("node boards are strictly two levels", () => {
  const node = (id: string, parentId: string | null, label: string) => ({
    id,
    parentId,
    label,
    color: null,
    note: null,
    link: null,
  });

  it("nests leaves under their branch", () => {
    const dto = serializeInsightBoard(
      row({
        type: "NODE",
        coreLabel: "Northwind app",
        nodes: [
          node("b1", null, "Playback"),
          node("l1", "b1", "HLS"),
          node("l2", "b1", "Downloads"),
          node("b2", null, "Billing"),
        ],
      }),
    );
    if (dto.kind !== "node") throw new Error("expected a node board");
    expect(dto.core).toBe("Northwind app");
    expect(dto.branches.map((b) => b.label)).toEqual(["Playback", "Billing"]);
    expect(dto.branches[0].leaves.map((l) => l.label)).toEqual(["HLS", "Downloads"]);
    expect(dto.branches[1].leaves).toEqual([]);
  });

  it("DROPS a depth-three row rather than inventing a position for it", () => {
    // The radial layout is two-level by construction. A grandchild has nowhere to go, so
    // rendering it would mean putting it somewhere that means something it does not.
    const dto = serializeInsightBoard(
      row({
        type: "NODE",
        nodes: [node("b1", null, "Playback"), node("l1", "b1", "HLS"), node("g1", "l1", "Too deep")],
      }),
    );
    if (dto.kind !== "node") throw new Error("expected a node board");
    expect(dto.branches[0].leaves.map((l) => l.label)).toEqual(["HLS"]);
  });

  it("DROPS an orphan whose parent is not on this board, rather than throwing", () => {
    const dto = serializeInsightBoard(
      row({ type: "NODE", nodes: [node("b1", null, "Playback"), node("x", "gone", "Orphan")] }),
    );
    if (dto.kind !== "node") throw new Error("expected a node board");
    expect(dto.branches).toHaveLength(1);
    expect(dto.branches[0].leaves).toEqual([]);
  });

  it("falls back to the board title when no core label was given", () => {
    const dto = serializeInsightBoard(row({ type: "NODE", title: "Fits together", coreLabel: null }));
    if (dto.kind !== "node") throw new Error("expected a node board");
    // A node diagram with an empty centre is unreadable, and the title always says
    // something — better than a blank circle.
    expect(dto.core).toBe("Fits together");
  });
});

describe("safeInsightLink", () => {
  it("keeps an http(s) link", () => {
    expect(safeInsightLink("https://example.com/a")).toBe("https://example.com/a");
    expect(safeInsightLink("http://example.com")).toBe("http://example.com");
  });

  it("rejects every non-http scheme", () => {
    // An ALLOW-list, not a blocklist — these are rendered as an `href`, and
    // rel="noreferrer" does nothing at all about a javascript: URL.
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeInsightLink(bad), bad).toBeNull();
    }
  });

  it("returns null for blank or unparseable input rather than throwing", () => {
    expect(safeInsightLink(null)).toBeNull();
    expect(safeInsightLink("   ")).toBeNull();
    expect(safeInsightLink("not a url")).toBeNull();
  });
});
