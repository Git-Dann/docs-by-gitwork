import { describe, expect, it } from "vitest";
import { tokenizeCodeBlock, tokenizeLine, type Token } from "@/lib/code-highlight";

/** Concatenating every token must reproduce the input exactly — nothing lost, nothing invented. */
function roundTrip(tokens: Token[]): string {
  return tokens.map((token) => token.text).join("");
}

function kindsOf(tokens: Token[], kind: Token["kind"]): string[] {
  return tokens.filter((token) => token.kind === kind).map((token) => token.text);
}

describe("tokenizeLine", () => {
  it("is lossless for every language", () => {
    // The single most important property: a highlighter that drops or duplicates a character
    // silently corrupts what the client reads. Every other assertion is cosmetic next to this.
    const samples = [
      ['{ "customer_id": "abc-123", "year": 2019 }', "JSON"],
      ["SELECT make, model FROM vehicles WHERE year > 2015; -- recent only", "SQL"],
      ["customer_id,make,model,year", "CSV"],
      ["warranty_expiry: 2027-01-31 # ISO 8601", "YAML"],
      ["curl -X POST https://api.example.com/v1/vehicles", "Bash"],
      ["const rows = await load('vehicles.csv'); // ingest", "TypeScript"],
      ["def load(path): # read the export", "Python"],
      ["anything at all", "Plain text"],
      ["", "JSON"],
    ] as const;

    for (const [line, language] of samples) {
      expect(roundTrip(tokenizeLine(line, language)), `${language}: ${line}`).toBe(line);
    }
  });

  it("marks JSON keys as keys and values as strings", () => {
    // The keys ARE the contract in an ingestion guide, so they must be visually distinct from
    // the example values beside them.
    const tokens = tokenizeLine('{ "customer_id": "abc-123" }', "JSON");

    expect(kindsOf(tokens, "key")).toEqual(['"customer_id"']);
    expect(kindsOf(tokens, "string")).toEqual(['"abc-123"']);
  });

  it("marks unquoted YAML keys", () => {
    const tokens = tokenizeLine("registration_number: AB12 CDE", "YAML");

    expect(kindsOf(tokens, "key")).toEqual(["registration_number"]);
  });

  it("does NOT treat a quoted value as a key in a language without key syntax", () => {
    // A TypeScript object literal uses the same shape, but the distinction is JSON/YAML-scoped on
    // purpose — over-reaching here would repaint half of every code sample.
    const tokens = tokenizeLine('const x = "abc": string', "TypeScript");

    expect(kindsOf(tokens, "key")).toEqual([]);
  });

  it("recognises SQL keywords case-insensitively", () => {
    const tokens = tokenizeLine("select Make from Vehicles", "SQL");

    expect(kindsOf(tokens, "keyword").map((k) => k.toLowerCase())).toEqual(["select", "from"]);
  });

  it("treats a field name that merely resembles a keyword as plain in CSV", () => {
    // CSV has no keywords, so `order,set,key` is three column names, not three SQL keywords.
    const tokens = tokenizeLine("order,set,key", "CSV");

    expect(kindsOf(tokens, "keyword")).toEqual([]);
  });

  describe("comments", () => {
    it("finds a line comment and takes the rest of the line", () => {
      const tokens = tokenizeLine("year INTEGER -- vehicle model year", "SQL");

      expect(kindsOf(tokens, "comment")).toEqual(["-- vehicle model year"]);
    });

    it("does NOT split a URL containing `//`", () => {
      // The bug this repo has hit twice (CLAUDE.md §34.3, §34.6): naive comment stripping
      // truncates "https://…" at the scheme. Here it would visually swallow the endpoint an
      // ingestion guide exists to document.
      const line = 'const url = "https://api.example.com/v1/vehicles";';
      const tokens = tokenizeLine(line, "TypeScript");

      expect(kindsOf(tokens, "comment")).toEqual([]);
      expect(roundTrip(tokens)).toBe(line);
    });

    it("does NOT treat a `#` inside a quoted string as a comment", () => {
      const line = 'ref_id: "REF#00412"';
      const tokens = tokenizeLine(line, "YAML");

      expect(kindsOf(tokens, "comment")).toEqual([]);
    });

    it("still finds a comment that follows a string on the same line", () => {
      const tokens = tokenizeLine('name: "Ford" # make', "YAML");

      expect(kindsOf(tokens, "comment")).toEqual(["# make"]);
    });

    it("has no comment syntax in JSON or CSV", () => {
      // JSON genuinely has no comments, so a `#` in a value must never grey out the rest.
      expect(kindsOf(tokenizeLine('{ "note": "a # b" }', "JSON"), "comment")).toEqual([]);
      expect(kindsOf(tokenizeLine("a,b # not a comment", "CSV"), "comment")).toEqual([]);
    });
  });

  it("marks numbers in every language, including an unknown one", () => {
    // Numbers are language-independent, so an unrecognised language label must still produce a
    // sensible result rather than falling apart — a free-text label reaching this is realistic.
    expect(kindsOf(tokenizeLine('{ "year": 2019 }', "JSON"), "number")).toEqual(["2019"]);
    expect(kindsOf(tokenizeLine("year 2019", "Klingon"), "number")).toEqual(["2019"]);
  });

  it("does not mark a number that is part of an identifier", () => {
    // `address_line2` is one field name, not `address_line` followed by `2`.
    expect(kindsOf(tokenizeLine("address_line2: string", "YAML"), "number")).toEqual([]);
  });
});

describe("tokenizeCodeBlock", () => {
  it("splits into one token row per line", () => {
    const rows = tokenizeCodeBlock("a\nb\nc", "Plain text");

    expect(rows).toHaveLength(3);
    expect(rows.map(roundTrip)).toEqual(["a", "b", "c"]);
  });

  it("drops trailing blank lines so the block prints no empty rows", () => {
    expect(tokenizeCodeBlock("a\nb\n\n\n", "Plain text")).toHaveLength(2);
  });

  it("keeps interior blank lines, which are meaningful spacing", () => {
    expect(tokenizeCodeBlock("a\n\nb", "Plain text")).toHaveLength(3);
  });

  it("is lossless across a multi-line ingestion sample", () => {
    const code = [
      "-- Vehicles ingest",
      "CREATE TABLE vehicles (",
      "  customer_id TEXT NOT NULL,",
      "  year INTEGER,      -- 4-digit",
      "  ref_id TEXT UNIQUE",
      ");",
    ].join("\n");

    expect(tokenizeCodeBlock(code, "SQL").map(roundTrip).join("\n")).toBe(code);
  });
});
