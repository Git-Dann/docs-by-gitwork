import { describe, expect, it } from "vitest";
import {
  planSectionWrites,
  sectionUnchanged,
  type ExistingSection,
  type IncomingSection,
} from "@/server/documents/section-writes";

/**
 * The property under test is ID STABILITY, not "does the diff work".
 *
 * The save path used to delete and recreate every section row on each 900ms autosave, so every
 * section's cuid changed while someone typed. `Asset.sectionId` is a real FK with
 * `onDelete: SetNull` and `DocumentComment.sectionId` is a loose reference to the same ids, so
 * both were being cut loose on a timer. There is no database in this suite, so the anchoring
 * check is expressed where it actually lives: a save that changes nothing must produce NO
 * writes, and a save that changes one block must leave every other row's id untouched.
 */

function existing(overrides: Partial<ExistingSection> & { id: string }): ExistingSection {
  return {
    key: "prose",
    title: "Section",
    description: null,
    sortOrder: 0,
    isVisible: true,
    speakerNotes: null,
    fontSize: null,
    data: { content: "hello" },
    ...overrides,
  };
}

function incoming(overrides: Partial<IncomingSection> = {}): IncomingSection {
  return {
    key: "prose",
    title: "Section",
    sortOrder: 0,
    isVisible: true,
    data: { content: "hello" },
    ...overrides,
  };
}

/** A realistic document: a cover, three prose blocks and a costing block. */
function document() {
  const rows: ExistingSection[] = [
    existing({ id: "sec_cover", key: "cover", title: "Cover", sortOrder: 0, data: {} }),
    existing({ id: "sec_a", title: "One", sortOrder: 1, data: { content: "a" } }),
    existing({ id: "sec_b", title: "Two", sortOrder: 2, data: { content: "b" } }),
    existing({ id: "sec_c", title: "Three", sortOrder: 3, data: { content: "c" } }),
    existing({ id: "sec_cost", key: "costing", title: "Costing", sortOrder: 4, data: { total: 100 } }),
  ];
  const payload: IncomingSection[] = rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    isVisible: row.isVisible,
    speakerNotes: row.speakerNotes,
    fontSize: row.fontSize,
    data: row.data,
  }));
  return { rows, payload };
}

describe("section ids survive a save", () => {
  it("writes nothing at all when the document is unchanged", () => {
    const { rows, payload } = document();
    const plan = planSectionWrites(rows, payload);

    expect(plan.updates).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("stays a no-op across repeated autosaves — the timer case that orphaned assets", () => {
    const { rows, payload } = document();

    for (let save = 0; save < 3; save += 1) {
      const plan = planSectionWrites(rows, payload);
      expect(plan.deleteIds, `save ${save + 1} deleted rows`).toEqual([]);
      expect(plan.creates, `save ${save + 1} recreated rows`).toEqual([]);
    }
  });

  it("touches only the edited block and keeps every other id", () => {
    const { rows, payload } = document();
    const edited = payload.map((section) =>
      section.id === "sec_b" ? { ...section, data: { content: "b edited" } } : section,
    );

    const plan = planSectionWrites(rows, edited);

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe("sec_b");
    expect(plan.updates[0].fields.data).toEqual({ content: "b edited" });
    expect(plan.creates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("keeps ids when blocks are reordered", () => {
    const { rows, payload } = document();
    // Swap the two middle blocks, re-indexing sortOrder the way the editor does.
    const reordered = [payload[0], payload[2], payload[1], payload[3], payload[4]].map(
      (section, index) => ({ ...section, sortOrder: index }),
    );

    const plan = planSectionWrites(rows, reordered);

    expect(plan.creates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates.map((u) => u.id).sort()).toEqual(["sec_a", "sec_b"]);
    // Reordering must move sortOrder and nothing else.
    expect(plan.updates.every((u) => u.fields.data)).toBe(true);
  });
});

describe("what counts as a new section", () => {
  it("treats a client-minted draft id as a create, not an update", () => {
    const { rows, payload } = document();
    const withNew = [
      ...payload,
      incoming({ id: "draft-section-9f2c-4a11", title: "Fresh", sortOrder: 5 }),
    ];

    const plan = planSectionWrites(rows, withNew);

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].title).toBe("Fresh");
    expect(plan.updates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("treats a section with no id at all as a create", () => {
    const { rows, payload } = document();
    const plan = planSectionWrites(rows, [...payload, incoming({ title: "Untitled", sortOrder: 5 })]);

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].title).toBe("Untitled");
  });

  it("cannot be made to address a row from another document", () => {
    const { rows, payload } = document();
    // An id that is well-formed but not one of ours. It must become a new row here, and must
    // not update or delete anything — membership is checked, not the id's shape.
    const foreign = [...payload, incoming({ id: "sec_from_another_doc", title: "Foreign", sortOrder: 5 })];

    const plan = planSectionWrites(rows, foreign);

    expect(plan.updates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].title).toBe("Foreign");
  });
});

describe("removals", () => {
  it("deletes exactly the sections that are gone", () => {
    const { rows, payload } = document();
    const plan = planSectionWrites(
      rows,
      payload.filter((section) => section.id !== "sec_b"),
    );

    expect(plan.deleteIds).toEqual(["sec_b"]);
    expect(plan.creates).toEqual([]);
    // The blocks after the removed one keep their ids; only their sortOrder shifts, and the
    // editor re-indexes before sending, so those are updates rather than delete/recreate.
    expect(plan.updates.map((u) => u.id)).not.toContain("sec_b");
  });

  it("deletes everything when the payload is empty", () => {
    const { rows } = document();
    const plan = planSectionWrites(rows, []);

    expect(plan.deleteIds.sort()).toEqual(["sec_a", "sec_b", "sec_c", "sec_cost", "sec_cover"]);
    expect(plan.creates).toEqual([]);
  });
});

describe("change detection", () => {
  it("ignores jsonb key reordering", () => {
    // Postgres jsonb does not preserve key insertion order, so the stored row and the payload
    // routinely disagree on ordering while being equal as values. A plain JSON.stringify
    // comparison would mark every section dirty on every save and the skip would never fire.
    const row = existing({ id: "sec_a", data: { beta: 2, alpha: 1 } });
    const sent = incoming({ id: "sec_a", data: { alpha: 1, beta: 2 } });

    expect(planSectionWrites([row], [sent]).updates).toEqual([]);
  });

  it("still notices a real change nested inside the payload", () => {
    const row = existing({ id: "sec_a", data: { items: [{ label: "one" }] } });
    const sent = incoming({ id: "sec_a", data: { items: [{ label: "two" }] } });

    expect(planSectionWrites([row], [sent]).updates).toHaveLength(1);
  });

  it("treats an omitted optional field as equal to a stored null", () => {
    // The editor omits `description`/`speakerNotes`/`fontSize` rather than sending null. Without
    // normalising both sides, every section would look dirty forever.
    const row = existing({ id: "sec_a" });
    const sent: IncomingSection = {
      id: "sec_a",
      key: "prose",
      title: "Section",
      sortOrder: 0,
      isVisible: true,
      data: { content: "hello" },
    };

    expect(planSectionWrites([row], [sent]).updates).toEqual([]);
  });

  it("notices each scalar field on its own", () => {
    const base = existing({ id: "sec_a" });
    const changes: Array<Partial<IncomingSection>> = [
      { title: "Renamed" },
      { key: "callout" },
      { sortOrder: 7 },
      { isVisible: false },
      { description: "A caption" },
      { speakerNotes: "Say this" },
      { fontSize: "lg" },
    ];

    for (const change of changes) {
      const sent = incoming({ id: "sec_a", ...change });
      expect(
        planSectionWrites([base], [sent]).updates,
        `change ${JSON.stringify(change)} was not detected`,
      ).toHaveLength(1);
    }
  });
});

describe("costing is protected from an editor who cannot see costs", () => {
  it("pins the stored costing payload and leaves other blocks alone", () => {
    const { rows, payload } = document();
    // A no-viewCosts editor round-trips a blanked costing block plus a real prose edit.
    const blanked = payload.map((section) =>
      section.key === "costing"
        ? { ...section, data: {} }
        : section.id === "sec_a"
          ? { ...section, data: { content: "a edited" } }
          : section,
    );

    const plan = planSectionWrites(rows, blanked, { preserveCostingData: { total: 100 } });

    // Costing is unchanged from what we hold, so it does not even need a write.
    expect(plan.updates.map((u) => u.id)).toEqual(["sec_a"]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("accepts the incoming costing data when no override is supplied", () => {
    const { rows, payload } = document();
    const edited = payload.map((section) =>
      section.key === "costing" ? { ...section, data: { total: 250 } } : section,
    );

    const plan = planSectionWrites(rows, edited);

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].fields.data).toEqual({ total: 250 });
  });
});

describe("sectionUnchanged", () => {
  it("is exported so the comparison can be checked directly", () => {
    const a = existing({ id: "x" });
    expect(sectionUnchanged(a, { ...a })).toBe(true);
    expect(sectionUnchanged(a, { ...a, title: "Different" })).toBe(false);
  });
});
