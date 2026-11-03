import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listAgentStatus, setAgentStatus, summaryAgentState } from "../agent-status";

/** Agent status is in memory and shared by the process, so it must be kept per workspace. */
describe("agent status is per workspace", () => {
  it("one business never sees another's agents", () => {
    setAgentStatus("ws-a", "s1", "needs-you", "Reviewing PR");
    setAgentStatus("ws-b", "s2", "thinking", "Other business");
    expect(listAgentStatus("ws-a").map((a) => a.sessionId)).toEqual(["s1"]);
    expect(listAgentStatus("ws-b").map((a) => a.sessionId)).toEqual(["s2"]);
    expect(summaryAgentState("ws-b")).toBe("thinking");
    expect(summaryAgentState("ws-c")).toBe("idle");
  });
});

describe("the link preview uses the shared SSRF guard", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/og-preview/route.ts"), "utf8");
  it("fetches only through fetchScannableUrl", () => {
    expect(src).toMatch(/await fetchScannableUrl\(rawUrl,/);
    expect(src).not.toMatch(/[^a-zA-Z]fetch\(/);
  });
});
