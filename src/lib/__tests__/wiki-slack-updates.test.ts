/**
 * The wiki's Slack panel: the grouping rules, and the boundary that decides
 * which channel each audience reads.
 *
 * The channel boundary is asserted against SOURCE because it is a wiring fact,
 * not a computation: the danger is not that `groupUpdatesByDev` goes wrong, it
 * is that someone points the client's card at the internal channel.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeSlackState,
  formatUpdateAge,
  groupUpdatesByDev,
  isUnresolvedAuthor,
  type SlackUpdateMessage,
} from "@/lib/wiki-slack-updates";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Source with comments stripped — a "must not appear" check has to read code. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function msg(over: Partial<SlackUpdateMessage> & { author: string; ts: string }): SlackUpdateMessage {
  return { id: over.ts, text: "an update", ...over };
}
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("one row per dev, their latest word", () => {
  const updates = groupUpdatesByDev(
    [
      msg({ author: "Sian", ts: hoursAgo(30), text: "older" }),
      msg({ author: "Harry", ts: hoursAgo(4), text: "harry latest" }),
      msg({ author: "Sian", ts: hoursAgo(2), text: "sian latest" }),
      msg({ author: "Sian", ts: hoursAgo(9), text: "middle" }),
    ],
    NOW,
  );

  it("collapses a chatty person to one row", () => {
    expect(updates.map((u) => u.author)).toEqual(["Sian", "Harry"]);
  });

  it("keeps their most recent message, not the last one in the array", () => {
    /**
     * ⚠️ The route hands messages back oldest-first, but a caller could pass
     * either direction. Taking "the last one seen" would show a two-day-old
     * line as today's update on half the inputs.
     */
    expect(updates[0].latest.text).toBe("sian latest");
  });

  it("counts everything they said, not just what is shown", () => {
    expect(updates[0].count).toBe(3);
  });

  it("orders by who spoke most recently", () => {
    expect(updates[0].author).toBe("Sian");
    expect(updates[0].hoursAgo).toBe(2);
    expect(updates[1].hoursAgo).toBe(4);
  });
});

describe("what it will not pretend to know", () => {
  it("keeps unattributed messages rather than dropping them", () => {
    // ⚠️ "We could not resolve the name" is not "nobody posted". Dropping them
    // would silently shrink the activity the panel reports.
    const updates = groupUpdatesByDev(
      [msg({ author: "Teammate", ts: hoursAgo(1) }), msg({ author: "Sian", ts: hoursAgo(5) })],
      NOW,
    );
    expect(updates.map((u) => u.author)).toContain("Teammate");
  });

  it("sorts named devs above unattributed ones even when they are older", () => {
    const updates = groupUpdatesByDev(
      [msg({ author: "Teammate", ts: hoursAgo(1) }), msg({ author: "Sian", ts: hoursAgo(5) })],
      NOW,
    );
    expect(updates[0].author).toBe("Sian");
  });

  it("treats an unreadable timestamp as unknown, never as just now", () => {
    const updates = groupUpdatesByDev([msg({ author: "Sian", ts: "not-a-date" })], NOW);
    expect(updates[0].hoursAgo).toBeNull();
    expect(formatUpdateAge(null)).toBe("Unknown");
  });

  it("names Bot and Teammate as unresolved", () => {
    expect(isUnresolvedAuthor("Bot")).toBe(true);
    expect(isUnresolvedAuthor("Teammate")).toBe(true);
    expect(isUnresolvedAuthor("Sian")).toBe(false);
  });

  it("formats an age a person can read", () => {
    expect(formatUpdateAge(0)).toBe("Just now");
    expect(formatUpdateAge(3)).toBe("3h ago");
    expect(formatUpdateAge(50)).toBe("2d ago");
  });

  it("copes with an empty channel", () => {
    expect(groupUpdatesByDev([], NOW)).toEqual([]);
  });
});

describe("every not-ready state names a cause", () => {
  const base = { channelName: "#acme", summary: null, generatedAt: null, messages: [] };

  it("distinguishes no bot token from no channel", () => {
    const a = describeSlackState({ ...base, configured: false, reason: "no_token" }, false);
    const b = describeSlackState({ ...base, configured: false, reason: "no_channel" }, false);
    expect(a.kind).toBe("needs-setup");
    expect(b.kind).toBe("needs-setup");
    expect(a).not.toEqual(b);
  });

  it("says the bot was never invited, rather than showing an empty card", () => {
    const s = describeSlackState({ ...base, configured: true, reason: "not_in_channel" }, false);
    expect(s.kind).toBe("needs-setup");
    expect(s.kind === "needs-setup" && s.message).toMatch(/invited/i);
  });

  it("separates a quiet channel from an unreadable one", () => {
    // ⚠️ The whole §35 rule in one assertion: "nothing was said" and "we could
    // not look" must not render identically.
    const quiet = describeSlackState({ ...base, configured: true, reason: "ok" }, false);
    const broken = describeSlackState({ ...base, configured: false, reason: "slack_error" }, false);
    expect(quiet.kind).toBe("empty");
    expect(broken.kind).toBe("needs-setup");
  });

  it("reports ready only when there is something to show", () => {
    const s = describeSlackState(
      { ...base, configured: true, reason: "ok", messages: [msg({ author: "Sian", ts: hoursAgo(1) })] },
      false,
    );
    expect(s.kind).toBe("ready");
  });
});

describe("the client's card can only ever read the shared channel", () => {
  const PUBLIC_ROUTE = code(read("src/app/api/wiki/[token]/slack/route.ts"));
  const CARD = code(read("src/components/clients/wiki/wiki-slack-card.tsx"));
  const DASH = code(read("src/components/clients/wiki/wiki-dashboard.tsx"));
  const PUBLIC_VIEW = code(read("src/components/clients/wiki/wiki-public-view.tsx"));
  const WORKSPACE = code(read("src/components/clients/wiki/wiki-workspace.tsx"));

  /**
   * ⚠️ The internal channel carries Gitwork talking among itself about this
   * client. The shared one is Slack Connect — the client is already in it, so
   * showing it discloses nothing. Everything below guards that one swap.
   */
  it("the public route reads slackExternalChannelId and names no other channel", () => {
    expect(PUBLIC_ROUTE).toContain("slackExternalChannelId");
    expect(PUBLIC_ROUTE).not.toContain("slackInternalChannelId");
    expect(PUBLIC_ROUTE).not.toMatch(/\bslackChannelId\b/);
  });

  it("the public route takes no channel or scope parameter", () => {
    // A parameter is a thing a caller can set; the safe number of ways to ask
    // this endpoint for the internal channel is zero.
    expect(PUBLIC_ROUTE).not.toMatch(/searchParams/);
    expect(PUBLIC_ROUTE).not.toMatch(/\bscope\b/);
  });

  it("the client's share view passes audience=client and no slug", () => {
    const call = PUBLIC_VIEW.slice(PUBLIC_VIEW.indexOf("<WikiDashboard"));
    const end = call.indexOf("/>");
    const props = call.slice(0, end);
    expect(props).toContain('audience="client"');
    expect(props).toContain("shareToken={token}");
    expect(props, "the client view must not carry the slug the internal route needs").not.toMatch(
      /\bslug=/,
    );
  });

  it("the internal workspace passes audience=team", () => {
    const call = WORKSPACE.slice(WORKSPACE.indexOf("<WikiDashboard"));
    expect(call.slice(0, call.indexOf("/>"))).toContain('audience="team"');
  });

  it("the dashboard gates each card on its own audience", () => {
    expect(DASH).toMatch(/audience === "team" && slug/);
    expect(DASH).toMatch(/audience === "client" && shareToken/);
  });

  it("audience is required, so a new call site cannot inherit a default", () => {
    const sig = DASH.slice(DASH.indexOf("export function WikiDashboard"));
    expect(sig.slice(0, 900)).toMatch(/audience: "team" \| "client";/);
    expect(sig.slice(0, 900)).not.toMatch(/audience\?:/);
  });

  it("only the matching hook is enabled, so no request is made to be refused", () => {
    expect(CARD).toMatch(/useClientSlackActivity\([\s\S]{0,60}source === "team"/);
    expect(CARD).toMatch(/usePublicWikiSlack\([\s\S]{0,60}source === "client"/);
  });

  it("never shows a client our own setup problem", () => {
    expect(CARD).toMatch(/source === "client" && state\.kind === "needs-setup"/);
  });
});

describe("a malformed payload degrades quietly", () => {
  /**
   * ⚠️ `messages` is optional in the type for this reason. A response missing
   * it used to crash on `.length`, which turns a field-shape change into a
   * blank page — the loudest possible failure for the least important cause.
   */
  it("treats a missing messages array as an empty channel", () => {
    expect(groupUpdatesByDev(undefined, NOW)).toEqual([]);
    const s = describeSlackState(
      { configured: true, channelName: "#acme", summary: null, generatedAt: null, reason: "ok" },
      false,
    );
    expect(s.kind).toBe("empty");
  });
});
