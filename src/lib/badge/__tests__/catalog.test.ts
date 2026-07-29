import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  APPROVED_BADGES,
  BADGES,
  COUNTERMARK_BADGES,
  PULSE_BADGES,
  approvedPath,
  approvedStem,
  badgeByCode,
  countermarkPath,
  pulsePath,
} from "../catalog";

const PUBLIC = path.join(process.cwd(), "public");

// The catalogue is what names these marks in the studio, the docs and any review
// comment. Its job is to stay true to what is actually committed — a code that
// resolves to a missing file is worse than no catalogue.

describe("identity", () => {
  it("gives every badge a unique, permanently-shaped code", () => {
    const codes = BADGES.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^(FA|PS|CM)-\d{2}$/);
  });

  it("resolves a badge by its code", () => {
    expect(badgeByCode("FA-01")?.name).toBe("The Seal");
    expect(badgeByCode("PS-04")?.style).toBe("card");
    expect(badgeByCode("nope")).toBeUndefined();
  });

  it("splits cleanly into its families, each carrying what its family needs", () => {
    expect(APPROVED_BADGES.length + PULSE_BADGES.length + COUNTERMARK_BADGES.length)
      .toBe(BADGES.length);
    for (const b of APPROVED_BADGES) expect(b.stem).toBeTruthy();
    for (const b of PULSE_BADGES) expect(b.style).toBeTruthy();
    for (const b of COUNTERMARK_BADGES) expect(b.cmStyle).toBeTruthy();
  });
});

describe("the committed files back the catalogue", () => {
  // Every variant the studio can offer must exist on disk, or a user picks an
  // option and gets a broken image. Regenerate with scripts/badge/generate.py.
  it.each(APPROVED_BADGES)("$code has every variant it advertises", (badge) => {
    const variants: { dark?: boolean; motion?: boolean }[] = [
      {},
      { motion: true },
      ...(badge.hasDark ? [{ dark: true }, { dark: true, motion: true }] : []),
    ];
    for (const v of variants) {
      const file = path.join(PUBLIC, "badge", `${approvedStem(badge, v)}.svg`);
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });

  it("ships the small monogram the size floor points at", () => {
    const mono = badgeByCode("FA-05")!;
    expect(approvedStem(mono, { small: true })).toBe("foundry-approved-monogram-sm");
    expect(existsSync(path.join(PUBLIC, "badge", "foundry-approved-monogram-sm.svg"))).toBe(true);
  });

  it("only asks for a dark build where one exists", () => {
    // FA-04 and FA-05 carry their own ground, so requesting dark must fall back
    // rather than point at a file that was never generated.
    for (const badge of APPROVED_BADGES.filter((b) => !b.hasDark)) {
      expect(approvedStem(badge, { dark: true })).toBe(badge.stem);
    }
  });
});

describe("paths", () => {
  it("builds the public path for a mark", () => {
    expect(approvedPath(badgeByCode("FA-01")!)).toBe("/badge/foundry-approved-seal.svg");
    expect(approvedPath(badgeByCode("FA-01")!, { dark: true, motion: true }))
      .toBe("/badge/foundry-approved-seal-dark-anim.svg");
  });

  it("omits the default style so the commonest URL stays short", () => {
    expect(pulsePath(badgeByCode("PS-01")!, "tok")).toBe("/api/badge/pulse/tok.svg");
    expect(pulsePath(badgeByCode("PS-02")!, "tok")).toBe("/api/badge/pulse/tok.svg?style=ring");
  });

  it("builds the countermark path, omitting the default style", () => {
    expect(countermarkPath(badgeByCode("CM-01")!, "tok")).toBe("/api/badge/countermark/tok.svg");
    expect(countermarkPath(badgeByCode("CM-03")!, "tok", { dark: true }))
      .toBe("/api/badge/countermark/tok.svg?style=card&theme=dark");
  });

  it("carries theme and motion through", () => {
    expect(pulsePath(badgeByCode("PS-04")!, "tok", { dark: true, motion: true }))
      .toBe("/api/badge/pulse/tok.svg?style=card&theme=dark&motion=1");
  });

  it("refuses to build an approved path for a Pulse badge", () => {
    expect(() => approvedStem(badgeByCode("PS-01")!)).toThrow(/not a Foundry Approved mark/);
  });
});
