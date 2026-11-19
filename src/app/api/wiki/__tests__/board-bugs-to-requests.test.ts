import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Decision B (CLAUDE.md §134): a client's Bug or Feedback card is logged in Requests, not on the board. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const route = read("src/app/api/wiki/[token]/board/tasks/route.ts");
const post = route.slice(route.indexOf("export async function POST"));

describe("a client's bug or feedback goes to Requests", () => {
  it("only for a client writer, and only for bug or feedback", () => {
    expect(post).toMatch(/isClientWriter\(access\.writer\) && \(body\.itemType === "bug" \|\| body\.itemType === "feedback"\)/);
  });

  it("after the writer is resolved and the write rate is checked", () => {
    expect(post.indexOf("resolveBoardWriter(req, token)")).toBeLessThan(post.indexOf("addRequestFromBoard("));
    expect(post.indexOf("assertBoardWriteRate(req)")).toBeLessThan(post.indexOf("addRequestFromBoard("));
  });

  it("names the signed-in client as the requester, never a typed name", () => {
    expect(post).toContain("requestedBy: access.writer.name");
  });

  it("falls back to a board card when Requests is off, so nothing is lost", () => {
    const routed = post.indexOf("if (request) return apiOk");
    expect(routed).toBeGreaterThan(-1);
    expect(post.indexOf("createBoardCard(access.writer, body)")).toBeGreaterThan(routed);
  });

  it("logs into the wiki the board belongs to", () => {
    expect(post).toContain("addRequestFromBoard(access.writer.wikiId,");
  });
});
