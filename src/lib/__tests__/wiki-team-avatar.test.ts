import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publicTeamAvatarUrl, signedInAvatarUserId } from "../wiki-team-avatar";

describe("team avatars on a public wiki", () => {
  it("⚠️ rewrites an uploaded photo to the wiki-scoped route", () => {
    expect(publicTeamAvatarUrl("tok123", "/api/avatars/cmpg22qdh0000l4046owr2cyx")).toBe(
      "/api/wiki/tok123/avatars/cmpg22qdh0000l4046owr2cyx",
    );
  });
  it("leaves external photos and missing avatars alone", () => {
    expect(publicTeamAvatarUrl("t", "https://avatars.githubusercontent.com/u/1")).toBe(
      "https://avatars.githubusercontent.com/u/1",
    );
    expect(publicTeamAvatarUrl("t", null)).toBeNull();
  });
  it("only matches the exact signed-in path", () => {
    expect(signedInAvatarUserId("/api/avatars/abc/../../x")).toBeNull();
    expect(signedInAvatarUserId("https://evil.test/api/avatars/abc")).toBeNull();
  });
  it("both public resolutions (whole wiki and one section) apply the rewrite", () => {
    const src = readFileSync("src/server/wiki.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function resolvePublicWiki"), src.indexOf("function withPublicAvatars"));
    expect(fn.match(/withPublicAvatars\(forPublic\(/g)).toHaveLength(2);
  });
});
