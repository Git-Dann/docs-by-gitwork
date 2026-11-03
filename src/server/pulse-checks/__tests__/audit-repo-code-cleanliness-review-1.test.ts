import { describe, it, expect } from "vitest";
import { maxNestingDepth } from "../code-cleanliness";

describe("review: nesting detector bounds and Go type literals", () => {
  it("stays fast on a bundled single-line file with many braces (guard, not a discriminating test)", () => {
    const line = "function a(){var o={b:1};if(x){y()}}".repeat(40_000);
    const start = Date.now();
    maxNestingDepth(line, "public/js/app.js");
    expect(Date.now() - start).toBeLessThan(2_000);
  });
  it("keeps counting Go control flow next to an anonymous struct type (non-regression; does not isolate the struct exclusion)", () => {
    const go = [
      "func TestX(t *testing.T) {",
      "\tfor _, tc := range []struct{",
      "\t\tname string",
      "\t}{} {",
      "\t}",
      "\tif ok {",
      "\t\tfor i := 0; i < n; i++ {",
      "\t\t}",
      "\t}",
      "}",
    ].join("\n");
    expect(maxNestingDepth(go, "x_test.go")).toBe(3);
  });
});
