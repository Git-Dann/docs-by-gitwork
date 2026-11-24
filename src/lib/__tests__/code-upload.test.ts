/**
 * Code Handover uploads: files, folders and .zips go through one set of rules, and
 * everything left out is said, never dropped quietly.
 */
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  MAX_CODE_FILE_CHARS,
  MAX_CODE_VERSION_CHARS,
  MAX_FILES_PER_VERSION,
  decodeTextFile,
  describeUpload,
  isJunkPath,
  languageFor,
  mergeDraftFiles,
  normalisePath,
  prepareUpload,
  stripCommonRoot,
  versionFilesProblem,
  zipEntries,
} from "../code-upload";

const entry = (path: string, text: string) => ({ path, bytes: strToU8(text) });

describe("paths", () => {
  it("normalises separators and refuses a path that climbs out", () => {
    expect(normalisePath("receiver\\src\\radio.h")).toBe("receiver/src/radio.h");
    expect(normalisePath("./src//main.cpp")).toBe("src/main.cpp");
    expect(normalisePath("/main.cpp")).toBe("main.cpp");
    expect(normalisePath("../secrets.h")).toBeNull();
    expect(normalisePath("")).toBeNull();
  });

  it("treats tooling, dependency and build folders, and OS files, as junk", () => {
    for (const p of ["__MACOSX/main.cpp", "proj/.git/config", "node_modules/x/index.js", ".pio/build/firmware.elf", "app/build/out.c", ".DS_Store", "src/._main.cpp", "Thumbs.db"]) {
      expect(isJunkPath(p), p).toBe(true);
    }
    for (const p of ["main.cpp", "src/radio.h", "builder.h", "src/build.h"]) {
      expect(isJunkPath(p), p).toBe(false);
    }
  });

  it("drops one folder every path shares, and nothing else", () => {
    expect(stripCommonRoot(["receiver/main.cpp", "receiver/src/radio.h"])).toEqual(["main.cpp", "src/radio.h"]);
    expect(stripCommonRoot(["main.cpp", "src/radio.h"])).toEqual(["main.cpp", "src/radio.h"]);
    expect(stripCommonRoot(["a/main.cpp", "b/main.cpp"])).toEqual(["a/main.cpp", "b/main.cpp"]);
  });

  it("guesses a language from the extension", () => {
    expect(languageFor("src/radio.h")).toBe("cpp");
    expect(languageFor("sender.ino")).toBe("cpp");
    expect(languageFor("Makefile")).toBe("");
  });
});

describe("decodeTextFile", () => {
  it("refuses binary and over-long files with a reason", () => {
    expect(decodeTextFile(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 1]))).toEqual({ ok: false, reason: "not a text file" });
    expect(decodeTextFile(strToU8("x".repeat(MAX_CODE_FILE_CHARS + 1)))).toEqual({ ok: false, reason: "over 2,000,000 characters" });
    // A sketch the size of PollenIQ's sensor.ino (~535,000 characters) is accepted.
    expect(decodeTextFile(strToU8("x".repeat(535_000))).ok).toBe(true);
    expect(decodeTextFile(strToU8("void loop() {}\n"))).toEqual({ ok: true, content: "void loop() {}\n" });
  });
});

describe("zips", () => {
  it("reads the files in a .zip, skipping folder entries", () => {
    const zip = zipSync({ "fw/": new Uint8Array(), "fw/main.cpp": strToU8("a\n"), "fw/src/radio.h": strToU8("b\n") });
    expect(zipEntries(zip).map((e) => e.path).sort()).toEqual(["fw/main.cpp", "fw/src/radio.h"]);
  });

  it("throws on something that isn't a zip, so the popup can say so", () => {
    expect(() => zipEntries(strToU8("not a zip"))).toThrow();
  });
});

describe("prepareUpload", () => {
  it("keeps paths, strips the shared folder, ignores junk and reports what it refused", () => {
    const out = prepareUpload([
      entry("receiver/main.cpp", "setup();\n"),
      entry("receiver/src/radio.h", "class Radio {};\n"),
      entry("receiver/.pio/build/firmware.bin", "x"),
      entry("__MACOSX/receiver/._main.cpp", "x"),
      { path: "receiver/logo.bmp", bytes: new Uint8Array([66, 77, 0, 0]) },
    ]);
    expect(out.files.map((f) => [f.filename, f.language])).toEqual([
      ["main.cpp", "cpp"],
      ["src/radio.h", "cpp"],
      // logo.bmp is refused below, not here.
    ]);
    expect(out.skipped).toEqual([{ path: "logo.bmp", reason: "not a text file" }]);
    expect(out.ignored).toBe(2);
  });

  it("refuses a path the server would reject for length", () => {
    const long = `${"d/".repeat(110)}x.c`;
    expect(prepareUpload([entry(long, "x")]).skipped[0].reason).toMatch(/200 characters/);
  });
});

describe("mergeDraftFiles", () => {
  it("never holds more files than the server takes, and says which were left out", () => {
    const many = Array.from({ length: MAX_FILES_PER_VERSION + 3 }, (_, i) => ({ filename: `f${i}.c`, language: "c", content: "x" }));
    const out = mergeDraftFiles([], many);
    expect(out.files).toHaveLength(MAX_FILES_PER_VERSION);
    expect(out.overLimit).toEqual(["f50.c", "f51.c", "f52.c"]);
  });
});

describe("describeUpload", () => {
  it("says what was added, skipped, left out and ignored, in plain words", () => {
    expect(describeUpload(2, [{ path: "logo.bmp", reason: "not a text file" }], 3, ["f50.c"])).toBe(
      "Added 2 files. A file with the same name was replaced. Skipped logo.bmp (not a text file). " +
        "Left out 1 file over the 50-file limit for a version. Ignored 3 system or build files.",
    );
    expect(describeUpload(0, [], 0, [])).toBeNull();
  });
});

describe("versionFilesProblem", () => {
  const f = (filename: string, n: number) => ({ filename, content: "x".repeat(n) });
  it("accepts a big sketch under the per-file limit", () => {
    expect(versionFilesProblem([f("sensor.ino", 535_000)])).toBeNull();
  });
  it("names the file that is too big, and the limit", () => {
    expect(versionFilesProblem([f("a.h", 10), f("sensor.ino", MAX_CODE_FILE_CHARS + 1)])).toBe(
      "sensor.ino is 2,000,001 characters. A file can hold up to 2,000,000.",
    );
  });
  it("refuses a version whose files together are too big", () => {
    const each = MAX_CODE_FILE_CHARS;
    const count = Math.floor(MAX_CODE_VERSION_CHARS / each) + 1;
    const files = Array.from({ length: count }, (_, i) => f(`f${i}.c`, each));
    expect(versionFilesProblem(files)).toMatch(/^These files come to .* A version can hold up to 10,000,000\.$/);
  });
  it("refuses too many files", () => {
    const files = Array.from({ length: MAX_FILES_PER_VERSION + 1 }, (_, i) => f(`f${i}.c`, 1));
    expect(versionFilesProblem(files)).toBe(`A version can hold up to ${MAX_FILES_PER_VERSION} files.`);
  });
});
