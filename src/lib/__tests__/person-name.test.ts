import { describe, expect, it } from "vitest";
import { tidyPersonName } from "../person-name";

describe("tidying a name from Google at first sign-in", () => {
  it("capitalises a name typed entirely in lower case", () => {
    expect(tidyPersonName("ali asghar")).toBe("Ali Asghar");
    expect(tidyPersonName("  anne-marie   o'neil ")).toBe("Anne-Marie O'Neil");
  });
  it("⚠️ leaves any name with a capital exactly as written", () => {
    for (const n of ["Mustaqeem bin Ahmed", "Ronan McDonald", "Pieter van der Berg", "DAN"]) {
      expect(tidyPersonName(n)).toBe(n);
    }
  });
  it("no name → null, so the caller's email fallback applies", () => {
    expect(tidyPersonName(null)).toBeNull();
    expect(tidyPersonName("   ")).toBeNull();
  });
  it("every account-creating sign-in path uses it", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/auth.ts", "src/app/api/auth/mobile-callback/route.ts", "src/app/api/auth/desktop/start/route.ts"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/name: tidyPersonName\(/);
    }
  });
});
