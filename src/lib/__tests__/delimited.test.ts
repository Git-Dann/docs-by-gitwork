import { describe, expect, it } from "vitest";
import { detectDelimiter, matchHeader, parseDelimited } from "@/lib/delimited";

describe("detectDelimiter", () => {
  it("reads a paste out of a spreadsheet as tab-separated", () => {
    // This is the case the whole feature exists for — "generate a sheet in Claude" and
    // copy it across. Clipboard data from Sheets/Excel is tabs, not commas.
    expect(detectDelimiter("Title\tPriority\tNotes\nFix login\tHigh\t")).toBe("\t");
  });

  it("reads a downloaded export as comma-separated", () => {
    expect(detectDelimiter("Title,Priority,Notes\nFix login,High,")).toBe(",");
  });

  it("ignores delimiters INSIDE quoted headers", () => {
    // `"Title, short"` has two commas inside quotes and one tab between fields. Counting
    // naively picks comma and collapses the file into one column.
    expect(detectDelimiter('"Title, short"\t"Owner, primary"\tStage')).toBe("\t");
  });

  it("handles a European export using semicolons", () => {
    expect(detectDelimiter("Title;Priority;Notes")).toBe(";");
  });

  it("falls back to comma on a single column, rather than guessing", () => {
    expect(detectDelimiter("Title\nFix login")).toBe(",");
  });

  it("skips leading blank lines when sampling", () => {
    expect(detectDelimiter("\n\nTitle\tPriority\nFix\tHigh")).toBe("\t");
  });
});

describe("parseDelimited", () => {
  it("splits a header row from its data rows", () => {
    const t = parseDelimited("Title,Priority\nFix login,High\nAdd search,Low");
    expect(t.headers).toEqual(["Title", "Priority"]);
    expect(t.rows).toEqual([
      ["Fix login", "High"],
      ["Add search", "Low"],
    ]);
  });

  it("keeps a delimiter that sits inside a quoted field", () => {
    const t = parseDelimited('Title,Notes\n"Fix login, then logout",Urgent');
    expect(t.rows[0]).toEqual(["Fix login, then logout", "Urgent"]);
  });

  it("unescapes a doubled quote", () => {
    const t = parseDelimited('Title\n"She said ""no"""');
    expect(t.rows[0][0]).toBe('She said "no"');
  });

  it("keeps a newline that sits inside a quoted field", () => {
    // A pasted description routinely spans lines. Splitting on it would turn one request
    // into two, the second of them nonsense.
    const t = parseDelimited('Title,Notes\n"Fix login","Step 1\nStep 2"');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0][1]).toBe("Step 1\nStep 2");
  });

  it("strips the BOM Excel writes", () => {
    const t = parseDelimited("﻿Title,Priority\nFix,High");
    // Without this the first header is "﻿Title" and never matches an alias, so the
    // title column silently fails to auto-map on every file Excel produces.
    expect(t.headers[0]).toBe("Title");
  });

  it("normalises CRLF", () => {
    const t = parseDelimited("Title,Priority\r\nFix,High\r\n");
    expect(t.rows).toEqual([["Fix", "High"]]);
  });

  it("drops entirely blank lines, including a trailing newline", () => {
    const t = parseDelimited("Title\nFix\n\n\nAdd\n");
    expect(t.rows).toEqual([["Fix"], ["Add"]]);
  });

  it("returns an empty table for empty input rather than throwing", () => {
    expect(parseDelimited("")).toEqual({ headers: [], rows: [], delimiter: "," });
    expect(parseDelimited("   \n  ").rows).toEqual([]);
  });

  it("honours a forced delimiter over detection", () => {
    // The UI lets a person override when a file is genuinely ambiguous.
    const t = parseDelimited("a,b\tc,d", "\t");
    expect(t.rows).toEqual([]);
    expect(t.headers).toEqual(["a,b", "c,d"]);
  });
});

describe("matchHeader", () => {
  const FIELDS = [
    { key: "title", aliases: ["title", "name", "task", "summary", "subject"] },
    { key: "description", aliases: ["description", "notes", "details", "body"] },
    { key: "priority", aliases: ["priority", "urgency"] },
  ] as const;

  it("matches exactly, ignoring case, spacing and punctuation", () => {
    expect(matchHeader("Title", FIELDS)).toBe("title");
    expect(matchHeader("Task", FIELDS)).toBe("title");
    // Underscores and extra spacing normalise away, so `TASK_NAME` reaches the contains
    // pass and lands on title — which is what a ClickUp/Linear export actually writes.
    expect(matchHeader("  TASK_NAME ", FIELDS)).toBe("title");
  });

  it("falls back to a contains match, so real export headers land", () => {
    expect(matchHeader("Issue Title", FIELDS)).toBe("title");
    expect(matchHeader("Summary (short)", FIELDS)).toBe("title");
    expect(matchHeader("Priority level", FIELDS)).toBe("priority");
  });

  it("prefers an EXACT match on a later field over a contains match on an earlier one", () => {
    // "Notes" contains nothing of "title", but the ordering matters the other way round:
    // a header that exactly names one field must not be stolen by another field whose
    // alias merely appears inside it.
    expect(matchHeader("Notes", FIELDS)).toBe("description");
  });

  it("matches a header that is a shorter form of an alias", () => {
    // The bug that found this: the import modal's own example sheet writes "Detail",
    // and `"detail".includes("details")` is false, so the column silently went unmapped.
    expect(matchHeader("Detail", FIELDS)).toBe("description");
    expect(matchHeader("Note", FIELDS)).toBe("description");
  });

  it("will not match a fragment shorter than four characters", () => {
    // Without the floor, a two-letter header reaches inside every alias that contains it.
    expect(matchHeader("ti", FIELDS)).toBeNull();
    expect(matchHeader("ur", FIELDS)).toBeNull();
  });

  it("returns null for a header it cannot place, rather than a plausible guess", () => {
    // A wrong auto-mapping is worse than none: the person sees a filled dropdown and
    // trusts it. Unmatched columns stay unmapped and visible.
    expect(matchHeader("Sprint", FIELDS)).toBeNull();
    expect(matchHeader("", FIELDS)).toBeNull();
  });
});
