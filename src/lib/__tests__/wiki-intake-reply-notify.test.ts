/**
 * Who hears about a reply on a client's request: the team people @mentioned in it
 * (never the author themselves), and — when Gitwork replies — the client who raised
 * it, by email, only when we can tell exactly who that is and never at a Gitwork
 * address. The email quotes text people typed, so it must arrive escaped.
 */
import { describe, expect, it } from "vitest";
import {
  REPLY_EMAIL_BODY_LIMIT,
  buildTeamReplyEmail,
  isInternalEmail,
  pickRaiserEmail,
  teamMentionRecipients,
} from "../wiki-intake-reply-notify";

describe("teamMentionRecipients", () => {
  it("returns the Foundry user ids of mentioned team members", () => {
    expect(
      teamMentionRecipients(
        [
          { id: "team:u-sam", kind: "TEAM" },
          { id: "team:u-lena", kind: "TEAM" },
        ],
        "u-harry",
      ),
    ).toEqual(["u-sam", "u-lena"]);
  });

  it("never notifies the author about their own reply", () => {
    expect(
      teamMentionRecipients(
        [
          { id: "team:u-harry", kind: "TEAM" },
          { id: "team:u-sam", kind: "TEAM" },
        ],
        "u-harry",
      ),
    ).toEqual(["u-sam"]);
  });

  it("ignores client mentions and the primary-contact pseudo-person", () => {
    expect(
      teamMentionRecipients(
        [
          { id: "client:wu-1", kind: "CLIENT" },
          { id: "contact:primary", kind: "CLIENT" },
        ],
        null,
      ),
    ).toEqual([]);
  });

  it("notifies each person once", () => {
    expect(
      teamMentionRecipients(
        [
          { id: "team:u-sam", kind: "TEAM" },
          { id: "team:u-sam", kind: "TEAM" },
        ],
        null,
      ),
    ).toEqual(["u-sam"]);
  });
});

describe("isInternalEmail", () => {
  it("recognises Gitwork's domains and their subdomains", () => {
    expect(isInternalEmail("harry@gitwork.co.uk")).toBe(true);
    expect(isInternalEmail("HARRY@GITWORK.CO.UK")).toBe(true);
    expect(isInternalEmail("a@mail.gitwork.co.uk")).toBe(true);
    expect(isInternalEmail("owner@gitwork.io")).toBe(true);
  });

  it("does not match a lookalike domain", () => {
    expect(isInternalEmail("a@notgitwork.co.uk")).toBe(false);
    expect(isInternalEmail("a@gitwork.co.uk.evil.test")).toBe(false);
  });
});

const USERS = [
  { email: "ayesha@client.test", name: "Ayesha Khan" },
  { email: "sam.one@client.test", name: "Sam" },
  { email: "sam.two@client.test", name: "Sam" },
  { email: "harry@gitwork.co.uk", name: "Harry Brown" },
  { email: "noname@client.test", name: null },
];

describe("pickRaiserEmail", () => {
  it("matches the stamped display name back to a wiki user", () => {
    expect(pickRaiserEmail("Ayesha Khan", USERS)).toBe("ayesha@client.test");
    expect(pickRaiserEmail("  ayesha khan ", USERS)).toBe("ayesha@client.test");
  });

  it("matches a user with no name by the email that was stamped instead", () => {
    expect(pickRaiserEmail("noname@client.test", USERS)).toBe("noname@client.test");
  });

  it("never emails a Gitwork address", () => {
    expect(pickRaiserEmail("Harry Brown", USERS)).toBeNull();
    expect(pickRaiserEmail("harry@gitwork.co.uk", USERS)).toBeNull();
  });

  it("refuses an ambiguous name rather than guessing", () => {
    expect(pickRaiserEmail("Sam", USERS)).toBeNull();
  });

  it("never invents an address for someone who isn't a wiki user", () => {
    expect(pickRaiserEmail("Client wiki", USERS)).toBeNull();
    expect(pickRaiserEmail(null, USERS)).toBeNull();
  });
});

describe("buildTeamReplyEmail", () => {
  const base = {
    clientName: "Northwind",
    itemTitle: "Search is broken",
    authorName: "Harry Brown",
    body: "Fixed in the latest build.",
    link: "https://foundry.gitwork.co.uk/wiki/northwind/tok#intake",
  };

  it("escapes everything a person typed", () => {
    const { html } = buildTeamReplyEmail({
      ...base,
      itemTitle: "<script>alert(1)</script>",
      authorName: "Eve <b>",
      body: '<img src=x onerror="steal()"> & more',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;steal()&quot;&gt; &amp; more");
  });

  it("links to the client's shared wiki when there is one", () => {
    const { html, text } = buildTeamReplyEmail(base);
    expect(html).toContain(`href="${base.link}"`);
    expect(text).toContain(base.link);
  });

  it("says where to look, without a link, when sharing is off", () => {
    const { html, text } = buildTeamReplyEmail({ ...base, link: null });
    expect(html).not.toContain("href=");
    expect(text).toContain("Requests page");
  });

  it("keeps the subject on one line", () => {
    const { subject } = buildTeamReplyEmail({ ...base, itemTitle: "line one\r\nBcc: x@y.z" });
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("quotes at most REPLY_EMAIL_BODY_LIMIT characters of the reply", () => {
    const { text } = buildTeamReplyEmail({ ...base, body: "x".repeat(REPLY_EMAIL_BODY_LIMIT + 500) });
    expect(text).toContain(`${"x".repeat(REPLY_EMAIL_BODY_LIMIT)}…`);
    expect(text).not.toContain("x".repeat(REPLY_EMAIL_BODY_LIMIT + 1));
  });
});
