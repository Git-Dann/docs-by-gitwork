import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GITWORK,
  companyDisclosureLine,
  letterheadLines,
  letterheadShort,
  registeredPartyDetailLines,
} from "@/lib/gitwork";

/**
 * Gitwork's legal identifiers, and the guard that keeps them in one place.
 *
 * These numbers go on documents clients sign. They were hard-coded at five sites in three formats,
 * and two of them had already drifted — the cover's letterhead carried "Anchorage Quay" and the
 * parties editor's placeholder did not. Nobody noticed, because nothing compares them.
 *
 * The value of `src/lib/gitwork.ts` is not that it holds the strings; it is that nothing ELSE does.
 * That is what the source sweep below checks, and it is the assertion that actually fails when
 * someone pastes the company number into a sixth file.
 */

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // Test fixtures legitimately quote the real values — asserting on a party named
      // "Gitwork Group Ltd" is the point of those tests.
      if (name === "__tests__" || name === "node_modules") continue;
      sourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe("the identifiers live in exactly one place", () => {
  for (const [label, literal] of [
    ["company number", GITWORK.companyNumber],
    ["VAT number", GITWORK.vatNumber],
  ] as const) {
    it(`no source file outside gitwork.ts contains the ${label}`, () => {
      const offenders = sourceFiles(SRC)
        .filter((path) => !path.endsWith(join("lib", "gitwork.ts")))
        .filter((path) => readFileSync(path, "utf8").includes(literal))
        .map((path) => path.slice(SRC.length + 1));

      expect(
        offenders,
        `${label} is duplicated — import from "@/lib/gitwork" instead:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});

describe("the rendered forms", () => {
  it("builds the public disclosure line", () => {
    // ⚠️ Load-bearing on /portal/login — `/` redirects there, a Pulse scan follows the redirect,
    // and the company/VAT disclosure checks parse THAT page's HTML.
    expect(companyDisclosureLine()).toBe(
      "Gitwork Group Ltd · Company No. 15756347 · VAT 468314867 · Registered in England and Wales",
    );
  });

  it("builds the two-line cover letterhead, upper-cased", () => {
    expect(letterheadLines("/")).toEqual([
      "GITWORK GROUP LTD  /  COMPANY NO. 15756347  /  VAT REG. 468314867",
      "3RD FLOOR, ANCHORAGE ONE, ANCHORAGE QUAY, SALFORD QUAYS, M50 3YJ",
    ]);
  });

  it("uses a different separator for the running page header", () => {
    // Typographic, not incidental: the cover uses `/` and the page header `·`. Both were literals
    // before, which is how they were free to disagree about everything else too.
    expect(letterheadShort()).toBe("GITWORK GROUP LTD  ·  COMPANY NO. 15756347");
    expect(letterheadLines("·")[0]).toContain("  ·  ");
  });

  it("builds the contractual identification clause as separate lines", () => {
    // `PartyItem.details` is a line array — one joined string would render as a single run-on line.
    expect(registeredPartyDetailLines()).toEqual([
      "a company registered in England and Wales under number 15756347",
      "whose registered office is at 3rd Floor, Anchorage One, Anchorage Quay, Salford Quays, Manchester M50 3YJ",
    ]);
  });

  it("keeps Manchester in the contractual address and out of the letterhead", () => {
    // Not a style preference — the letterhead is a fixed-width mono strip on the cover, and the
    // contract clause is prose. They differed in the wild for that reason; both forms are kept
    // deliberately rather than one being quietly "corrected" into the other.
    expect(registeredPartyDetailLines()[1]).toContain("Manchester");
    expect(letterheadLines()[1]).not.toContain("MANCHESTER");
  });
});
