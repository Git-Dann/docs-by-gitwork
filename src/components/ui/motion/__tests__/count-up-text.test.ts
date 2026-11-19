import { describe, expect, it } from "vitest";
import { formatFigure, parseFigure } from "../count-up-text";

describe("CountUpText's figure parsing", () => {
  it("keeps what surrounds the number, and writes it back exactly", () => {
    for (const v of ["85%", "£1,240", "12 days", "3.5", "£1,240.50k", "-4", "v2"]) {
      const f = parseFigure(v)!;
      expect(f, v).not.toBeNull();
      expect(formatFigure(f, f.number)).toBe(v);
    }
  });

  it("splits a figure into prefix, number and suffix", () => {
    expect(parseFigure("£1,240.50k")).toEqual({ prefix: "£", number: 1240.5, decimals: 2, grouped: true, suffix: "k" });
    expect(parseFigure("85%")).toEqual({ prefix: "", number: 85, decimals: 0, grouped: false, suffix: "%" });
  });

  it("shows text with no number unchanged", () => {
    expect(parseFigure("—")).toBeNull();
    expect(parseFigure("Live")).toBeNull();
  });

  it("an in-between value keeps the same shape", () => {
    expect(formatFigure(parseFigure("£1,240")!, 612)).toBe("£612");
    expect(formatFigure(parseFigure("£1,240")!, 1012)).toBe("£1,012");
    expect(formatFigure(parseFigure("3.5")!, 1.25)).toBe("1.3");
  });
});
