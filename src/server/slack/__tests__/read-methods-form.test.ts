import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Slack's read methods take their arguments from a form, not a JSON body. Sent as JSON, a
 * users.info `{ user }` arrives as no user, and Dispatch couldn't match anyone's Slack account
 * to Foundry (Nov 2026). These pin the encoding per method.
 */

vi.mock("@/lib/encryption", () => ({ decryptNullable: () => null }));

const { conversationsInfo, listConversations, postMessage, usersInfo } = await import("../client");
const { askerProblemMessage } = await import("../asker");

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: () => Promise.resolve({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("Slack request encoding", () => {
  it("users.info, conversations.info and conversations.list go form-encoded", async () => {
    const fetchMock = stubFetch();
    await usersInfo("xoxb-t", "U123");
    await conversationsInfo("xoxb-t", "C456");
    await listConversations("xoxb-t");
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    for (const [, init] of calls) {
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    }
    expect(calls[0][0]).toMatch(/\/users\.info$/);
    expect(new URLSearchParams(calls[0][1].body as string).get("user")).toBe("U123");
    expect(new URLSearchParams(calls[1][1].body as string).get("channel")).toBe("C456");
    expect(new URLSearchParams(calls[2][1].body as string).get("exclude_archived")).toBe("true");
  });

  it("chat.postMessage stays JSON (blocks need it)", async () => {
    const fetchMock = stubFetch();
    await postMessage("xoxb-t", { channel: "C1", text: "hi", blocks: [{ type: "section" }] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toContain("application/json");
    expect(JSON.parse(init.body as string).blocks).toEqual([{ type: "section" }]);
  });
});

describe("why a Slack account couldn't be matched", () => {
  it("says which permission is missing, or which email has no Foundry account", () => {
    expect(askerProblemMessage({ kind: "slack_error", error: "missing_scope", needed: "users:read.email" })).toContain("(users:read.email)");
    expect(askerProblemMessage({ kind: "no_member", email: "x@y.test" })).toContain("x@y.test");
    expect(askerProblemMessage({ kind: "no_email" })).toContain("users:read.email");
  });
});
