import { describe, expect, it } from "vitest";

import {
  gitGrep,
  handlers,
  here,
  preamble,
  readSource,
  routeFiles,
  sawFiles,
  stripComments,
  walkSource,
} from "../source";

const SLASHES = "/" + "/";
const BLOCK_OPEN = "/" + "*";
const BLOCK_CLOSE = "*" + "/";

describe("stripComments", () => {
  it("removes a whole-line comment", () => {
    const out = stripComments(`${SLASHES} gone\nconst a = 1;`);
    expect(out).not.toContain("gone");
    expect(out).toContain("const a = 1;");
  });

  it("removes a TRAILING comment, which the whole-line-only strippers left behind", () => {
    const out = stripComments(`const a = 1; ${SLASHES} never touches prisma\n`);
    expect(out).not.toContain("prisma");
    expect(out).toContain("const a = 1;");
  });

  it("removes a block comment", () => {
    const out = stripComments(`${BLOCK_OPEN} never call deleteMany ${BLOCK_CLOSE}\nconst a = 1;`);
    expect(out).not.toContain("deleteMany");
  });

  it("removes a JSX comment", () => {
    const out = stripComments(`<div>{${BLOCK_OPEN} assertCan lives here ${BLOCK_CLOSE}}</div>`);
    expect(out).not.toContain("assertCan");
    expect(out).toContain("<div>");
  });

  it("keeps a URL inside a double-quoted string", () => {
    const src = `const u = "https://api.example.com/v1";\nconst b = 2;`;
    expect(stripComments(src)).toContain("https://api.example.com/v1");
  });

  it("keeps a URL inside a single-quoted string", () => {
    expect(stripComments(`const u = 'https://example.com/x';`)).toContain("https://example.com/x");
  });

  it("keeps a URL inside a template literal", () => {
    const src = "const u = `https://example.com/${id}/edit`;";
    const out = stripComments(src);
    expect(out).toContain("https://example.com/");
    expect(out).toContain("/edit`");
  });

  // ⚠️ Escaped slashes (`\\/\\/`) are NOT the hazard — they are never adjacent, so a naive
  // stripper survives them and a fixture built from one cannot tell the bug from the fix.
  // The hazard is a slash inside a character class, which opens a block comment that then
  // eats the rest of the file.
  it("keeps a regex literal whose character class contains a slash", () => {
    const src = [`const re = /[/*]/;`, `const after = "kept";`, `const tail = 2;`].join("\n");
    const out = stripComments(src);
    expect(out).toContain(`const after = "kept";`);
    expect(out).toContain("const tail = 2;");
  });

  it("keeps a regex literal whose character class contains two slashes", () => {
    const src = [`const re = /[//]x/;`, `const after = "kept";`].join("\n");
    expect(stripComments(src)).toContain(`const after = "kept";`);
  });

  it("does not mistake division for a regex and swallow the rest of the line", () => {
    const src = `const ratio = total / count; const other = a / b; const kept = 1;`;
    const out = stripComments(src);
    expect(out).toContain("const kept = 1;");
  });

  it("keeps the line count, so a reported line number still points at the right line", () => {
    const src = [`const a = 1;`, `${SLASHES} note`, `${BLOCK_OPEN}`, `many`, `lines`, BLOCK_CLOSE, `const b = 2;`].join(
      "\n",
    );
    const out = stripComments(src);
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    expect(out.split("\n")[6]).toContain("const b = 2;");
  });

  it("keeps column offsets, so a trailing comment does not shift the code before it", () => {
    const src = `const a = 1; ${SLASHES} x`;
    expect(stripComments(src).indexOf("const a")).toBe(src.indexOf("const a"));
  });

  it("rewinds rather than swallowing code when a quote is never closed on its line", () => {
    const src = `const broken = "oops;\nconst kept = 1;`;
    expect(stripComments(src)).toContain("const kept = 1;");
  });

  it("strips a comment that sits inside a template literal's interpolation", () => {
    const src = "const s = `a ${ b " + SLASHES + " note\n } c`;";
    expect(stripComments(src)).not.toContain("note");
  });
});

describe("readSource", () => {
  it("strips by default and keeps on request", () => {
    const stripped = readSource("src/testing/source.ts");
    const raw = readSource("src/testing/source.ts", { comments: "keep" });
    expect(raw).toContain("One reader for the");
    expect(stripped).not.toContain("One reader for the");
    expect(stripped).toContain("export function stripComments");
  });
});

describe("walkSource", () => {
  it("finds files and skips __tests__ and node_modules by default", () => {
    const files = walkSource("src/testing");
    expect(files.some((f) => f.endsWith("source.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
  });

  it("honours an explicit extension filter", () => {
    expect(walkSource("src/testing", { ext: [".tsx"] })).toEqual([]);
  });
});

describe("routeFiles and handlers", () => {
  it("finds every route file under a folder", () => {
    const files = routeFiles("src/app/api/team");
    expect(files.length).toBeGreaterThan(5);
    expect(files.every((f) => f.endsWith("route.ts"))).toBe(true);
  });

  it("splits a file into its exported handlers, not into one blob", () => {
    const src = [
      `import { x } from "y";`,
      `export async function GET() { return a(); }`,
      `export async function POST() { return b(); }`,
    ].join("\n");
    const hs = handlers(src);
    expect(hs.map((h) => h.method)).toEqual(["GET", "POST"]);
    expect(hs[0].body).toContain("a()");
    expect(hs[0].body).not.toContain("b()");
    expect(preamble(src)).toContain(`import { x }`);
  });

  it("does not let a guarded POST vouch for an ungated GET", () => {
    const src = [
      `export async function GET(r) { return listAll(); }`,
      `export async function POST(r) { assertCan(user, canManageClients); }`,
    ].join("\n");
    const get = handlers(src).find((h) => h.method === "GET");
    expect(get?.body).not.toContain("assertCan");
  });
});

describe("sawFiles", () => {
  it("passes a healthy walk through untouched", () => {
    expect(sawFiles([1, 2, 3], 2, "things")).toEqual([1, 2, 3]);
  });

  it("throws, naming the sweep, when a broken walk would otherwise pass for ever", () => {
    expect(() => sawFiles([], 1, "client write routes")).toThrow(/client write routes.*pass for ever/s);
  });
});

describe("gitGrep", () => {
  // ⚠️ These anchor on files that are already TRACKED. git grep does not see an untracked
  // file, so a sweep pointed at its own brand-new source reads clean and then starts
  // matching itself the moment it lands.
  it("returns hits with file, line and code", () => {
    const hits = gitGrep("PUBLIC_API_PATHS");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.file === "src/middleware.ts")).toBe(true);
    expect(hits[0].line).toBeGreaterThan(0);
  });

  it("returns an empty list rather than throwing when nothing matches", () => {
    expect(gitGrep("zzzz_no_such_token_anywhere_zzzz")).toEqual([]);
  });

  it("can exclude the calling test, which otherwise matches itself once committed", () => {
    const self = here(import.meta.url);
    expect(self).toBe("src/testing/__tests__/source.test.ts");
    const pattern = "zzzUniqueSweepTokenzzz";
    expect(gitGrep(pattern, { exclude: [self] }).map((h) => h.file)).not.toContain(self);
  });

  it("skips comment-only lines by default", () => {
    // This phrase lives only in comments, in three tracked files.
    const phrase = "the token IS the credential";
    expect(gitGrep(phrase)).toEqual([]);
    expect(gitGrep(phrase, { skipComments: false }).length).toBeGreaterThan(0);
  });
});
