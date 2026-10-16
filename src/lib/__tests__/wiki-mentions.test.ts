/**
 * @mentions in a request's reply thread — the rules the composer and the Slack
 * notifier share.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_MENTIONS_PER_COMMENT,
  activeMentionQuery,
  insertMention,
  matchMentionables,
  mentionSlackText,
  mentionsInBody,
  slackEscape,
  slackQuote,
  splitMentions,
  type MentionPerson,
} from "@/lib/wiki-mentions";

const PEOPLE: MentionPerson[] = [
  { id: "client:1", name: "Javed Iqbal", kind: "CLIENT" },
  { id: "team:1", name: "Mustaqeem bin Ahmed", kind: "TEAM" },
  { id: "team:2", name: "Dan Lindsay", kind: "TEAM" },
  { id: "team:3", name: "Harry Brown", kind: "TEAM" },
];

describe("activeMentionQuery", () => {
  it("opens on an @ at the start or after whitespace", () => {
    expect(activeMentionQuery("@ja", 3)).toEqual({ start: 0, query: "ja" });
    expect(activeMentionQuery("thanks @mus", 11)).toEqual({ start: 7, query: "mus" });
    expect(activeMentionQuery("(@da", 4)).toEqual({ start: 1, query: "da" });
  });

  it("never opens inside an email address", () => {
    expect(activeMentionQuery("mail dan@gitwork.co.uk", 22)).toBeNull();
  });

  it("allows one space so a surname still narrows, and closes on a second", () => {
    expect(activeMentionQuery("@Javed Iq", 9)).toEqual({ start: 0, query: "Javed Iq" });
    expect(activeMentionQuery("@Javed Iqbal says", 17)).toBeNull();
  });

  it("closes on a newline and only reads up to the caret", () => {
    expect(activeMentionQuery("@ja\nnext", 8)).toBeNull();
    expect(activeMentionQuery("hi @ja there", 6)).toEqual({ start: 3, query: "ja" });
  });
});

describe("matchMentionables", () => {
  it("ranks a name that starts with the query above one that merely contains it", () => {
    expect(matchMentionables(PEOPLE, "da").map((p) => p.name)).toEqual(["Dan Lindsay"]);
    expect(matchMentionables(PEOPLE, "bin")[0].name).toBe("Mustaqeem bin Ahmed");
    expect(matchMentionables(PEOPLE, "ha")[0].name).toBe("Harry Brown");
  });

  it("lists everyone for an empty query and nobody for a miss", () => {
    expect(matchMentionables(PEOPLE, "")).toHaveLength(4);
    expect(matchMentionables(PEOPLE, "zz")).toHaveLength(0);
  });
});

describe("insertMention", () => {
  it("replaces the typed query with the full name and a trailing space", () => {
    const out = insertMention("thanks @ja", 7, 10, { name: "Javed Iqbal" });
    expect(out.text).toBe("thanks @Javed Iqbal ");
    expect(out.caret).toBe(out.text.length);
  });

  it("keeps whatever followed the caret", () => {
    const out = insertMention("@ja please", 0, 3, { name: "Javed Iqbal" });
    expect(out.text).toBe("@Javed Iqbal  please");
  });
});

describe("mentionsInBody", () => {
  it("drops a person picked and then deleted from the text — they must not be paged", () => {
    const picked = [PEOPLE[0], PEOPLE[1]];
    expect(mentionsInBody("over to you @Javed Iqbal", picked).map((p) => p.id)).toEqual(["client:1"]);
  });

  it("de-duplicates and caps", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `t:${i}`, name: `P${i}` }));
    const body = many.map((p) => `@${p.name}`).join(" ");
    expect(mentionsInBody(body, [...many, many[0]])).toHaveLength(MAX_MENTIONS_PER_COMMENT);
  });
});

describe("splitMentions", () => {
  it("marks the stored mentions and leaves the rest as text", () => {
    const parts = splitMentions("hi @Javed Iqbal, see @Dan", [{ name: "Javed Iqbal" }]);
    expect(parts).toEqual([
      { text: "hi ", mention: false },
      { text: "@Javed Iqbal", mention: true },
      { text: ", see @Dan", mention: false },
    ]);
  });

  it("prefers the longest name, so a prefix can't split a full one", () => {
    const parts = splitMentions("@Dan Lindsay", [{ name: "Dan" }, { name: "Dan Lindsay" }]);
    expect(parts).toEqual([{ text: "@Dan Lindsay", mention: true }]);
  });

  it("returns the body untouched when nobody was mentioned", () => {
    expect(splitMentions("plain", [])).toEqual([{ text: "plain", mention: false }]);
  });
});

describe("Slack text", () => {
  it("escapes the three characters Slack treats as markup — the channel is shared", () => {
    expect(slackEscape("<!channel> & <@U1>")).toBe("&lt;!channel&gt; &amp; &lt;@U1&gt;");
  });

  it("can never broadcast @channel from a reply body", () => {
    const text = mentionSlackText({
      author: "Javed",
      mentioned: [{ name: "Dan Lindsay", slackUserId: "U123" }],
      requestTitle: "Dwell time",
      body: "<!channel> look at this",
      link: null,
    });
    expect(text).not.toContain("<!channel>");
    expect(text).toContain("&lt;!channel&gt;");
  });

  it("pings a resolved person and bolds one we couldn't find", () => {
    const text = mentionSlackText({
      author: "Mustaqeem bin Ahmed",
      mentioned: [
        { name: "Javed Iqbal", slackUserId: null },
        { name: "Dan Lindsay", slackUserId: "U999" },
      ],
      requestTitle: "Live occupancy in 5-minute increments",
      body: "this will take time",
      link: "https://foundry.gitwork.co.uk/wiki/polleniq/tok#intake",
    });
    expect(text.split("\n")[0]).toBe(
      "*Javed Iqbal*, <@U999> — *Mustaqeem bin Ahmed* mentioned you on <https://foundry.gitwork.co.uk/wiki/polleniq/tok#intake|Live occupancy in 5-minute increments>",
    );
    expect(text).toContain("> this will take time");
  });

  it("quotes every line and clips a long reply", () => {
    expect(slackQuote("a\n\nb")).toBe("> a\n>\n> b");
    expect(slackQuote("x".repeat(700)).length).toBeLessThan(620);
  });

  it("keeps a pipe in the title from breaking the link", () => {
    const text = mentionSlackText({
      author: "A",
      mentioned: [{ name: "B", slackUserId: null }],
      requestTitle: "web | iOS",
      body: "x",
      link: "https://x.test/w",
    });
    expect(text).toContain("<https://x.test/w|web ¦ iOS>");
  });
});
