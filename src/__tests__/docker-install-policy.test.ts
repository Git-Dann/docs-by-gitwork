import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

describe("Docker dependency install policy", () => {
  it("copies the repository npm policy before npm ci", () => {
    const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
    const copyPolicy = dockerfile.indexOf("COPY .npmrc ./");
    const install = dockerfile.indexOf("RUN npm ci");

    expect(copyPolicy).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(copyPolicy);
  });

  it("keeps the npm policy in the Docker build context", () => {
    const ignored = readFileSync(join(ROOT, ".dockerignore"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    expect(ignored).not.toContain(".npmrc");
  });
});
