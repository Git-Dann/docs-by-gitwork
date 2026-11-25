import { describe, expect, it } from "vitest";
import {
  DISPATCH_SLACK_ACTIONS,
  buildAssistantReply,
  chunkForSections,
  isDispatchSlackAction,
  markActionDecided,
  markdownToMrkdwn,
} from "../slack-format";

describe("markdownToMrkdwn", () => {
  it("converts bold, headings, lists and links", () => {
    expect(markdownToMrkdwn("## Where things are\n- **Login** is done\n- See [the board](https://x.test/b)")).toBe(
      "*Where things are*\n•  *Login* is done\n•  See <https://x.test/b|the board>",
    );
  });

  it("escapes Slack control characters so client text can't ping or link", () => {
    expect(markdownToMrkdwn("<!channel> & <@U123>")).toBe("&lt;!channel&gt; &amp; &lt;@U123&gt;");
  });

  it("only links http(s)", () => {
    expect(markdownToMrkdwn("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });

  it("leaves code blocks alone", () => {
    expect(markdownToMrkdwn("```\n**not bold**\n```")).toBe("```\n**not bold**\n```");
  });
});

describe("chunkForSections", () => {
  it("splits on lines and never exceeds the cap", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${"x".repeat(80)}`).join("\n");
    const chunks = chunkForSections(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
    expect(chunks.join("\n")).toBe(text);
  });
});

describe("buildAssistantReply", () => {
  const reply = buildAssistantReply({
    text: "Two things are open.",
    actions: [{ id: "act1", title: "Create 2 tasks", lines: ["Fix login", "Add logout"] }],
    sources: [{ label: "WED-12", url: "https://f.test/t/12" }],
    clientName: "Wedge",
    askerSlackId: "U1",
  });

  it("gives every proposal Confirm and Cancel carrying its id", () => {
    const buttons = reply.blocks.find((b) => b.block_id === "dispatch.buttons.act1") as { elements: { action_id: string; value: string }[] };
    expect(buttons.elements.map((e) => [e.action_id, e.value])).toEqual([
      [DISPATCH_SLACK_ACTIONS.CONFIRM, "act1"],
      [DISPATCH_SLACK_ACTIONS.CANCEL, "act1"],
    ]);
    expect(isDispatchSlackAction(buttons.elements[0].action_id)).toBe(true);
    expect(isDispatchSlackAction("task.markDone")).toBe(false);
  });

  it("says who may confirm, and cites sources", () => {
    const footer = JSON.stringify(reply.blocks.at(-1));
    expect(footer).toContain("only <@U1> can confirm");
    expect(footer).toContain("<https://f.test/t/12|WED-12>");
  });

  it("stays within Slack's 50-block cap", () => {
    const big = buildAssistantReply({
      text: "x".repeat(200_000),
      actions: Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, title: "t", lines: [] })),
      sources: [],
      clientName: "C",
    });
    expect(big.blocks.length).toBeLessThanOrEqual(50);
  });
});

describe("markActionDecided", () => {
  it("replaces only that proposal's buttons", () => {
    const blocks = [
      { type: "actions", block_id: "dispatch.buttons.a" },
      { type: "actions", block_id: "dispatch.buttons.b" },
    ];
    const out = markActionDecided(blocks, "a", "Done: Created 1 task.");
    expect(out[0]).toMatchObject({ type: "context", block_id: "dispatch.done.a" });
    expect(out[1]).toBe(blocks[1]);
  });
});
