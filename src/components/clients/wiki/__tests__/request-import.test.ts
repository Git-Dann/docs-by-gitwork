/**
 * Spreadsheet import — the mapping, not the modal.
 *
 * What goes wrong with an importer is never the dialog; it is which column landed where
 * and what a value was quietly turned into. Those are pure functions, so they are tested
 * directly against realistic sheets rather than through a rendered component.
 */
import { describe, expect, it } from "vitest";
import { parseDelimited } from "@/lib/delimited";
import { matchHeader } from "@/lib/delimited";
import {
  IMPORT_FIELDS,
  IMPORT_TEMPLATE,
  buildRows,
  mapCategory,
  mapPriority,
  rowsToPayload,
} from "@/components/clients/wiki/request-import-modal";
import { DEFAULT_INTAKE_CATEGORIES } from "@/lib/wiki-intake-categories";

const CATS = DEFAULT_INTAKE_CATEGORIES;

/** A paste straight out of Google Sheets: tabs, a quoted cell with a comma in it. */
const SHEET = [
  "Request\tDetail\tPriority\tCategory\tRequested by\tTheir ref",
  'Search returns nothing for an apostrophe\t"Web app only, not iOS"\tP1\tBug\tPriya Shah\tSUP-118',
  "Add a monthly leaderboard export\tCSV is fine\tLow\tRequest\tMarcus Webb\t",
  "Tidy the account screen\t\tSomeday\tSparkle\t\t",
].join("\n");

function rowsFor(text: string, existing: string[] = []) {
  const t = parseDelimited(text);
  const mapping = [
    "title",
    "description",
    "priority",
    "category",
    "requestedBy",
    "externalRef",
  ] as const;
  // Passed RAW on purpose — `buildRows` owns the normalisation, and a test that
  // pre-normalised differently is exactly the caller bug the signature now prevents.
  return buildRows(t.headers, t.rows, [...mapping], CATS, existing);
}

describe("mapPriority", () => {
  it("accepts the shorthands a real tracker exports", () => {
    expect(mapPriority("P1").value).toBe("HIGH");
    expect(mapPriority("urgent").value).toBe("HIGH");
    expect(mapPriority("Normal").value).toBe("MEDIUM");
    expect(mapPriority("minor").value).toBe("LOW");
  });

  it("defaults an empty cell to MEDIUM WITHOUT flagging it", () => {
    // Blank is a legitimate answer — "no priority given" is not a mistake to chase.
    expect(mapPriority("")).toEqual({ value: "MEDIUM", flagged: false });
    expect(mapPriority(undefined)).toEqual({ value: "MEDIUM", flagged: false });
  });

  it("FLAGS a value it does not recognise rather than defaulting silently", () => {
    // The API path 400s on an unknown value (wiki-intake-vocab.ts). Here a person can
    // fix it, so the equivalent is a visible marker — but it must not be invisible.
    expect(mapPriority("Someday")).toEqual({ value: "MEDIUM", flagged: true });
  });
});

describe("mapCategory", () => {
  it("matches the client's own categories by label or id, case-insensitively", () => {
    expect(mapCategory("Bug", CATS).id).toBe("BUG");
    expect(mapCategory("  request ", CATS).id).toBe("TASK");
    expect(mapCategory("design", CATS).id).toBe("DESIGN");
  });

  it("flags a category the client does not have", () => {
    expect(mapCategory("Sparkle", CATS)).toEqual({ id: null, flagged: true });
  });

  it("treats a blank cell as no category, unflagged", () => {
    expect(mapCategory("", CATS)).toEqual({ id: null, flagged: false });
  });

  it("only ever returns an id the client actually has", () => {
    // The server derives `type` from `categoryId`, so an invented id would either be
    // rejected or resolve to the wrong type. Never pass through what was typed.
    const ids = new Set(CATS.map((c) => c.id));
    for (const raw of ["Bug", "Sparkle", "", "TASK", "nonsense"]) {
      const { id } = mapCategory(raw, CATS);
      if (id !== null) expect(ids.has(id)).toBe(true);
    }
  });
});

describe("buildRows", () => {
  it("reads a tab-separated paste with a quoted cell containing a comma", () => {
    const rows = rowsFor(SHEET);
    expect(rows).toHaveLength(3);
    expect(rows[0].values.title).toBe("Search returns nothing for an apostrophe");
    expect(rows[0].values.description).toBe("Web app only, not iOS");
    expect(rows[0].values.externalRef).toBe("SUP-118");
  });

  it("flags the row whose priority and category could not be read", () => {
    const rows = rowsFor(SHEET);
    expect(rows[2].flags.sort()).toEqual(["category", "priority"]);
    // …and the first two rows are clean, or the flag means nothing.
    expect(rows[0].flags).toEqual([]);
    expect(rows[1].flags).toEqual([]);
  });

  it("marks a row whose title is already open as a duplicate, and skips it", () => {
    // Re-pasting an edited sheet is the NORMAL way to use an import. A second copy of
    // every row is the failure this prevents.
    const rows = rowsFor(SHEET, ["search returns nothing for an apostrophe"]);
    expect(rows[0].duplicate).toBe(true);
    expect(rows[0].skip).toBe(true);
    expect(rows[1].skip).toBe(false);
  });

  it("matches a duplicate title case- and whitespace-insensitively", () => {
    const rows = rowsFor(SHEET, ["  Search   Returns Nothing For An Apostrophe "]);
    expect(rows[0].duplicate).toBe(true);
  });

  it("skips a row with no title rather than importing a blank request", () => {
    const rows = rowsFor("Request\tPriority\n\tHigh\nReal one\tLow");
    expect(rows[0].skip).toBe(true);
    expect(rows[1].skip).toBe(false);
  });

  it("ignores a column mapped to null", () => {
    const t = parseDelimited(SHEET);
    const rows = buildRows(t.headers, t.rows, ["title", null, null, null, null, null], CATS, []);
    expect(rows[0].values.description).toBeUndefined();
    // …and an unmapped priority column is not flagged: nothing was asked of it.
    expect(rows[2].flags).toEqual([]);
  });
});

describe("rowsToPayload", () => {
  it("sends only the importable rows", () => {
    const payload = rowsToPayload(rowsFor(SHEET, ["Add a monthly leaderboard export"]), CATS);
    expect(payload.map((p) => p.title)).toEqual([
      "Search returns nothing for an apostrophe",
      "Tidy the account screen",
    ]);
  });

  it("coerces the vocabulary, so the server receives enum values not sheet text", () => {
    const payload = rowsToPayload(rowsFor(SHEET), CATS);
    expect(payload[0].priority).toBe("HIGH");
    expect(payload[0].categoryId).toBe("BUG");
  });

  it("drops a link that is not http(s) rather than losing the whole row", () => {
    // The server's link guard rejects anything else, and refusing a request because its
    // URL column held a stray value would be the wrong trade — the request is the point.
    const t = parseDelimited("Request\tLink\nFix login\tjavascript:alert(1)\nAdd search\thttps://ok.example/1");
    const rows = buildRows(t.headers, t.rows, ["title", "externalUrl"], CATS, []);
    const payload = rowsToPayload(rows, CATS);
    expect(payload[0].externalUrl).toBeNull();
    expect(payload[0].title).toBe("Fix login");
    expect(payload[1].externalUrl).toBe("https://ok.example/1");
  });

  it("never emits a title that is only whitespace", () => {
    const t = parseDelimited("Request\n   \nReal");
    const rows = buildRows(t.headers, t.rows, ["title"], CATS, []);
    expect(rowsToPayload(rows, CATS).map((p) => p.title)).toEqual(["Real"]);
  });
});


describe("the built-in example sheet", () => {
  it("maps EVERY one of its own columns", () => {
    // A canary, and it earned its place immediately: the example's "Detail" column
    // silently failed to map, which was only visible by opening the modal and looking.
    // If our own sheet does not auto-map, nobody else's will either.
    const t = parseDelimited(IMPORT_TEMPLATE);
    const mapped = t.headers.map((h) => matchHeader(h, IMPORT_FIELDS));
    expect(t.headers.length).toBeGreaterThan(3);
    expect(mapped.filter((m) => m === null)).toEqual([]);
  });

  it("maps each column to a DIFFERENT field", () => {
    // Two columns feeding one field means the last one silently wins — data loss that
    // looks like a mapping choice.
    const t = parseDelimited(IMPORT_TEMPLATE);
    const mapped = t.headers.map((h) => matchHeader(h, IMPORT_FIELDS));
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("parses as tab-separated, which is what a spreadsheet paste is", () => {
    expect(parseDelimited(IMPORT_TEMPLATE).delimiter).toBe("\t");
  });
});
