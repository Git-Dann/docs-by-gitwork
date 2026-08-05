import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blendOver, parseHex } from "@/lib/blend-over";

/**
 * The cover's purple glow must contain NO ALPHA.
 *
 * A CSS gradient with alpha becomes a transparency group with a soft mask when Chrome exports to
 * PDF, and renderers disagree about compositing those. Observed on one file, three renderers:
 * Slack's server-generated channel thumbnail correct, the downloaded file correct, and Slack's
 * in-app viewer a flat magenta wash across the whole cover.
 *
 * Pre-blending removes the alpha, which removes the mask, which removes the disagreement.
 */

describe("parseHex", () => {
  it("reads long and short form", () => {
    expect(parseHex("#0C0C18")).toEqual([12, 12, 24]);
    expect(parseHex("0C0C18")).toEqual([12, 12, 24]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
  });

  it("returns null rather than guessing at anything else", () => {
    // A CSS keyword or an rgba() string must not silently parse as a colour.
    for (const bad of ["transparent", "rgba(0,0,0,0.2)", "#12345", "", "#ggg"]) {
      expect(parseHex(bad), bad).toBeNull();
    }
  });
});

describe("blendOver", () => {
  it("returns the background at alpha 0 and the foreground at alpha 1", () => {
    expect(blendOver([107, 82, 255], 0, "#0C0C18")).toBe("#0c0c18");
    expect(blendOver([107, 82, 255], 1, "#0C0C18")).toBe("#6b52ff");
  });

  it("computes the cover's actual glow correctly", () => {
    // rgba(107,82,255,0.28) over #0C0C18:
    //   R 0.28*107 + 0.72*12 = 38.6 → 39
    //   G 0.28*82  + 0.72*12 = 31.6 → 32
    //   B 0.28*255 + 0.72*24 = 88.7 → 89
    expect(blendOver([107, 82, 255], 0.28, "#0C0C18")).toBe("#272059");
  });

  it("always emits a 6-digit hex with no alpha channel", () => {
    for (const alpha of [0, 0.13, 0.28, 0.5, 0.99, 1]) {
      expect(blendOver([107, 82, 255], alpha, "#0C0C18")).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("clamps an out-of-range alpha rather than producing an impossible channel", () => {
    expect(blendOver([107, 82, 255], -1, "#0C0C18")).toBe("#0c0c18");
    expect(blendOver([107, 82, 255], 5, "#0C0C18")).toBe("#6b52ff");
  });

  it("falls back to an opaque foreground when the background can't be parsed", () => {
    // Returning the foreground is a VISIBLE wrong colour; silently returning black would be a
    // subtle one, and subtle is what took three passes to find here.
    expect(blendOver([107, 82, 255], 0.28, "var(--doc-paper)")).toBe("#6b52ff");
  });
});

describe("the cover gradient itself", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "components", "document-cover.tsx"),
    "utf8",
  );

  it("declares no `rgba(` or `transparent` inside any gradient", () => {
    // The guard that matters. Both are alpha, both produce the soft mask, and both have already
    // shipped once each.
    const gradients = source.match(/(?:radial|linear)-gradient\([^`"']*/g) ?? [];

    expect(gradients.length).toBeGreaterThan(0);
    for (const gradient of gradients) {
      expect(gradient, gradient).not.toContain("rgba(");
      expect(gradient, gradient).not.toContain("transparent");
    }
  });

  it("derives the glow from `paper` rather than hardcoding it", () => {
    // Hardcoding would let the glow and the page drift to different navies.
    expect(source).toContain("blendOver([107, 82, 255], 0.28, paper)");
  });
});
