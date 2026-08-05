import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";

/**
 * No gradient in the DOCUMENT layer may fade to the bare `transparent` keyword.
 *
 * `transparent` is `rgba(0, 0, 0, 0)` — transparent BLACK. A gradient from a coloured stop to
 * `transparent` therefore has different RGB endpoints, and the mid-ramp colour depends on whether
 * the renderer interpolates in premultiplied space (what browsers do on screen) or not (Chrome's
 * print/PDF rasteriser).
 *
 * That is a real defect this shipped: the cover's purple glow read blue-ish in the editor and
 * noticeably more purple in the exported PDF, from identical CSS. A document that renders one way
 * on screen and another in the PDF a client receives is broken, however good either one looks.
 *
 * The fix is always the same — fade to the SAME colour at zero alpha (`rgba(r,g,b,0)`), so both
 * interpolation models produce an identical ramp.
 */

const ROOT = join(__dirname, "..", "..");

const FILES = [
  join(ROOT, "components", "document-cover.tsx"),
  ...readdirSync(join(ROOT, "lib", "sections"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(ROOT, "lib", "sections", name)),
];

/**
 * Gradient functions with a bare `transparent` stop, ignoring comments.
 *
 * Uses a balanced-paren scan rather than a regex: gradient stops routinely contain nested
 * `rgba(...)` calls, and a regex that tries to allow for that either stops at the first inner
 * `)` or silently fails to match at all — which is how the first version of this test passed
 * over the very defect it was written for.
 */
function offendingGradients(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const out: string[] = [];

  for (const match of code.matchAll(/(?:linear|radial|conic)-gradient\(/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) continue;
    const gradient = code.slice(match.index ?? 0, close + 1);
    if (/(?:^|[\s,(])transparent(?:[\s,)]|$)/.test(gradient)) out.push(gradient);
  }

  return out;
}

describe("document gradients", () => {
  it("finds the files it is meant to police", () => {
    // Guards the glob: if the section directory moves, this must fail loudly rather than pass
    // over an empty list forever.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("never fades a gradient to the bare `transparent` keyword", () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      for (const gradient of offendingGradients(readFileSync(file, "utf8"))) {
        offenders.push(`${file.split("/").slice(-2).join("/")}: ${gradient.slice(0, 80)}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("detects the defect it exists to prevent", () => {
    // Proves the matcher discriminates, rather than being a regex that never fires.
    expect(
      offendingGradients(
        'background: "radial-gradient(circle at 75% 15%, rgba(107,82,255,0.28), transparent 60%)"',
      ),
    ).toHaveLength(1);

    expect(
      offendingGradients(
        'background: "radial-gradient(circle at 75% 15%, rgba(107,82,255,0.28), rgba(107,82,255,0) 60%)"',
      ),
    ).toEqual([]);
  });

  it("does not flag a non-gradient use of transparent", () => {
    // `background: transparent` and `border-color: transparent` are entirely fine — the problem is
    // interpolating TOWARDS it.
    expect(offendingGradients('style={{ background: "transparent" }}')).toEqual([]);
    expect(offendingGradients('className="border-transparent"')).toEqual([]);
  });
});
