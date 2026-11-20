import { describe, expect, it } from "vitest";
import { MAX_PER_HOUR, REPEAT_AFTER_MS, errorAlertText, errorSignature, scrubMessage, shouldPostError } from "@/lib/error-alerts";

const fresh = () => ({ lastSent: new Map<string, number>(), sentTimes: [] as number[] });

describe("shouldPostError", () => {
  it("posts a given error once an hour", () => {
    const s = fresh();
    expect(shouldPostError(s, "a", 0)).toBe(true);
    expect(shouldPostError(s, "a", 1000)).toBe(false);
    expect(shouldPostError(s, "a", REPEAT_AFTER_MS)).toBe(true);
  });

  it("caps all posts in an hour", () => {
    const s = fresh();
    for (let i = 0; i < MAX_PER_HOUR; i += 1) expect(shouldPostError(s, `e${i}`, i)).toBe(true);
    expect(shouldPostError(s, "one-more", 100)).toBe(false);
    expect(shouldPostError(s, "one-more", REPEAT_AFTER_MS + 100)).toBe(true);
  });
});

describe("what is posted", () => {
  it("takes out email addresses and long numbers, and keeps the first line", () => {
    expect(scrubMessage("No user dan@example.co.uk with id 123456789\nstack…")).toBe("No user [email] with id [number]");
  });

  it("treats the same error on the same route as one", () => {
    const a = { routePath: "/api/x/[id]", name: "TypeError", message: "x of undefined (id 1234567)" };
    expect(errorSignature(a)).toBe(errorSignature({ ...a, message: "x of undefined (id 7654321)" }));
  });

  it("names the route template, never anything from the request", () => {
    const text = errorAlertText({ routePath: "/api/clients/[slug]", method: "POST", name: "PrismaClientKnownRequestError", code: "P2002", message: "Unique constraint failed", digest: "123" });
    expect(text).toContain("`POST /api/clients/[slug]`");
    expect(text).toContain("P2002");
  });
});
