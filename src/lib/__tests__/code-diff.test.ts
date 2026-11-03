/**
 * Code Handover compare: the rules behind the compare view, the "since vX" line on each
 * version and the downloadable patch. The patch strings below were checked against
 * `git diff` and `git apply` on the same inputs.
 */
import { describe, expect, it } from "vitest";
import {
  changedSpan,
  compareVersions,
  worthEmphasising,
  diffTexts,
  pairChangedLines,
  previousVersionOf,
  splitLines,
  summariseComparison,
  toHunks,
  unifiedPatch,
} from "../code-diff";

const lines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";

describe("splitLines", () => {
  it("normalises Windows line endings and remembers the final newline", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual({ lines: ["a", "b"], eol: true, crlf: true });
    expect(splitLines("a\nb")).toEqual({ lines: ["a", "b"], eol: false, crlf: false });
    expect(splitLines("")).toEqual({ lines: [], eol: true, crlf: false });
  });
});

describe("diffTexts", () => {
  it("finds the one changed line in a file and numbers both sides", () => {
    const { ops } = diffTexts("a\nb\nc\n", "a\nB\nc\n");
    expect(ops).toEqual([
      { kind: "same", text: "a", oldNo: 1, newNo: 1 },
      { kind: "del", text: "b", oldNo: 2, newNo: null },
      { kind: "add", text: "B", oldNo: null, newNo: 2 },
      { kind: "same", text: "c", oldNo: 3, newNo: 3 },
    ]);
  });

  it("is minimal: an inserted block doesn't show as a rewrite of what follows", () => {
    const { ops } = diffTexts("a\nb\nc\nd\n", "a\nx\ny\nb\nc\nd\n");
    expect(ops!.filter((o) => o.kind !== "same").map((o) => `${o.kind}:${o.text}`)).toEqual(["add:x", "add:y"]);
  });

  it("shows adding the final newline as a change to the last line", () => {
    const { ops } = diffTexts("a\nb", "a\nb\n");
    expect(ops!.filter((o) => o.kind !== "same")).toEqual([
      { kind: "del", text: "b", oldNo: 2, newNo: null, noEol: true },
      { kind: "add", text: "b", oldNo: null, newNo: 2 },
    ]);
  });

  it("can ignore whitespace", () => {
    const { ops } = diffTexts("if (x) {\n  y();\n}\n", "if (x)  {\n\ty();\n}\n", { ignoreWhitespace: true });
    expect(ops!.every((o) => o.kind === "same")).toBe(true);
  });

  it("gives up rather than guessing when a file changed beyond the limit", () => {
    expect(diffTexts(lines(50, "a"), lines(50, "b"), { maxEdits: 20 }).ops).toBeNull();
    expect(diffTexts(lines(50, "a"), lines(50, "b"), { maxEdits: 100 }).ops).not.toBeNull();
  });
});

describe("toHunks", () => {
  it("keeps three lines of context and merges changes that are close together", () => {
    const before = lines(30);
    const after = before.replace("line 5\n", "LINE 5\n").replace("line 9\n", "LINE 9\n").replace("line 25\n", "LINE 25\n");
    const hunks = toHunks(diffTexts(before, after).ops!);
    // 5 and 9 are within 2×3 lines of each other, so one hunk; 25 is its own.
    expect(hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [2, 11, 2, 11],
      [22, 7, 22, 7],
    ]);
  });

  it("merges hunks whose context lines just touch, and splits them one line further apart (as git does)", () => {
    const base = lines(30);
    const touching = base.replace("line 5\n", "LINE 5\n").replace("line 12\n", "LINE 12\n");
    const apart = base.replace("line 5\n", "LINE 5\n").replace("line 13\n", "LINE 13\n");
    const ranges = (after: string) => toHunks(diffTexts(base, after).ops!).map((h) => [h.oldStart, h.oldLines]);
    expect(ranges(touching)).toEqual([[2, 14]]);
    expect(ranges(apart)).toEqual([[2, 7], [10, 7]]);
  });

  it("returns nothing for identical text", () => {
    expect(toHunks(diffTexts("a\n", "a\n").ops!)).toEqual([]);
  });
});

describe("compareVersions", () => {
  const v1 = [
    { filename: "main.cpp", content: "void setup() {}\nvoid loop() {}\n" },
    { filename: "radio.h", content: "class Radio {};\n" },
    { filename: "old.h", content: "#define X 1\n" },
    { filename: "util.h", content: "int f();\n" },
  ];
  const v2 = [
    { filename: "main.cpp", content: "void setup() { begin(); }\nvoid loop() {}\n" },
    { filename: "radio.h", content: "class Radio {};\n" },
    { filename: "config.h", content: "#define CHANNEL 7\n" },
    { filename: "helpers.h", content: "int f();\n" },
  ];

  it("reports what happened to every file, changed ones first", () => {
    const c = compareVersions(v1, v2);
    expect(c.files.map((f) => [f.status, f.filename, f.oldFilename, f.added, f.removed])).toEqual([
      ["modified", "main.cpp", null, 1, 1],
      ["renamed", "helpers.h", "util.h", 0, 0],
      ["added", "config.h", null, 1, 0],
      ["removed", "old.h", null, 0, 1],
      ["unchanged", "radio.h", null, 0, 0],
    ]);
    expect([c.changedFiles, c.added, c.removed]).toEqual([4, 2, 2]);
    expect(summariseComparison(c)).toBe("4 files · +2 −2");
  });

  it("says when only the line endings changed, instead of showing nothing", () => {
    const c = compareVersions([{ filename: "a.c", content: "x\ny\n" }], [{ filename: "a.c", content: "x\r\ny\r\n" }]);
    expect(c.files[0].status).toBe("unchanged");
    expect(c.files[0].note).toMatch(/line endings/);
  });

  it("marks a file too different to diff, with tallied counts", () => {
    const c = compareVersions([{ filename: "big.c", content: lines(3000, "a") }], [{ filename: "big.c", content: lines(3000, "b") }]);
    expect(c.files[0]).toMatchObject({ status: "modified", tooLarge: true, added: 3000, removed: 3000, ops: null });
  });

  it("says no changes for identical versions", () => {
    expect(summariseComparison(compareVersions(v1, v1))).toBe("No changes");
  });
});

describe("unifiedPatch", () => {
  it("writes git's format, so it can be applied with git apply", () => {
    const from = [
      { filename: "main.cpp", content: "a\nb\nc\n" },
      { filename: "old.h", content: "gone\n" },
      { filename: "util.h", content: "int f();\n" },
    ];
    const to = [
      { filename: "main.cpp", content: "a\nB\nc" },
      { filename: "new.h", content: "fresh\n" },
      { filename: "helpers.h", content: "int f();\n" },
    ];
    expect(unifiedPatch(from, to)).toBe(
      [
        "diff --git a/main.cpp b/main.cpp",
        "--- a/main.cpp",
        "+++ b/main.cpp",
        "@@ -1,3 +1,3 @@",
        " a",
        "-b",
        "-c",
        "+B",
        "+c",
        "\\ No newline at end of file",
        "diff --git a/util.h b/helpers.h",
        "similarity index 100%",
        "rename from util.h",
        "rename to helpers.h",
        "diff --git a/new.h b/new.h",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new.h",
        "@@ -0,0 +1 @@",
        "+fresh",
        "diff --git a/old.h b/old.h",
        "deleted file mode 100644",
        "--- a/old.h",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-gone",
        "",
      ].join("\n"),
    );
  });

  it("never ignores whitespace, whatever the view is set to", () => {
    expect(unifiedPatch([{ filename: "a", content: "x\n" }], [{ filename: "a", content: " x\n" }])).toContain("+ x");
  });

  it("replaces the whole file when it is too different to diff", () => {
    const patch = unifiedPatch([{ filename: "big.c", content: lines(3000, "a") }], [{ filename: "big.c", content: lines(3000, "b") }]);
    expect(patch).toContain("@@ -1,3000 +1,3000 @@");
  });

  it("is empty when nothing changed", () => {
    expect(unifiedPatch([{ filename: "a", content: "x\n" }], [{ filename: "a", content: "x\n" }])).toBe("");
  });
});

describe("in-line emphasis", () => {
  it("finds the part of a line that changed", () => {
    expect(changedSpan("#define SLEEP_MS 500", "#define SLEEP_MS 750")).toEqual({ prefix: 17, suffix: 0 });
    // Whole words: the full number, not the digits that happen to differ.
    const { prefix, suffix } = changedSpan("Serial.begin(9600);", "Serial.begin(115200);");
    expect("Serial.begin(115200);".slice(prefix, "Serial.begin(115200);".length - suffix)).toBe("115200");
    const span = changedSpan("wait(SLEEP_MS);", "wait(SLEEP_US);");
    expect("wait(SLEEP_US);".slice(span.prefix, "wait(SLEEP_US);".length - span.suffix)).toBe("SLEEP_US");
  });

  it("emphasises an edited value but not a rewritten line that only shares its indentation", () => {
    expect(worthEmphasising("  Serial.begin(9600);", "  Serial.begin(115200);")).toBe(true);
    expect(worthEmphasising("  delay(500);", "  // Sleep between polls.")).toBe(false);
    expect(worthEmphasising("a", "b")).toBe(false);
  });

  it("pairs removed and added lines in the same block", () => {
    const { ops } = diffTexts("a\nb\nc\nd\n", "a\nB\nC\nX\nd\n");
    const pairs = pairChangedLines(ops!);
    const text = (i: number) => ops![i].text;
    const paired = [...pairs].filter(([i]) => ops![i].kind === "del").map(([i, j]) => `${text(i)}→${text(j)}`);
    expect(paired).toEqual(["b→B", "c→C"]);
  });
});

describe("previousVersionOf", () => {
  const versions = [
    { id: "v3", createdAt: "2026-07-21T00:00:00Z" },
    { id: "v1", createdAt: "2026-06-01T00:00:00Z" },
    { id: "v2", createdAt: "2026-07-14T00:00:00Z" },
  ];
  it("is the version created just before, whatever order they're listed in", () => {
    expect(previousVersionOf(versions, "v3")?.id).toBe("v2");
    expect(previousVersionOf(versions, "v2")?.id).toBe("v1");
    expect(previousVersionOf(versions, "v1")).toBeNull();
  });
});
