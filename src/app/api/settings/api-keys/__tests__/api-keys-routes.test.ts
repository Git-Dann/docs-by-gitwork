import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The key routes need a person who is an Admin, and the browser never gets the master key. */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("API key routes", () => {
  const files = ["src/app/api/settings/api-keys/route.ts", "src/app/api/settings/api-keys/[id]/route.ts"];

  it.each(files)("%s needs an Admin, read from the database", (f) => {
    const src = read(f);
    expect(src).toMatch(/requireAuthedUser\(/);
    expect(src).toMatch(/assertAtLeastAdmin\(user\)/);
    expect(src).not.toMatch(/ensureBaseRecords|DEFAULT_WORKSPACE_SLUG/);
  });

  it.each(files)("%s refuses to be driven by a key", (f) => {
    expect(read(f)).toMatch(/if \(presentsApiKey\(request\)\) return apiError\(/);
  });
});

describe("the middleware no longer hands browsers the env API_KEY", () => {
  const src = read("src/middleware.ts");
  it("never sets the API session cookie", () => {
    expect(src).not.toMatch(/cookies\.set\(\{\s*name: API_AUTH_COOKIE/);
  });
  it("never accepts that cookie as API authorisation", () => {
    expect(src).not.toMatch(/req\.cookies\.get\(API_AUTH_COOKIE\)\?\.value/);
    expect(src).toMatch(/let authorized = bearerToken === apiKey;/);
  });
});
