import { describe, expect, it } from "vitest";
import { clientMentionRecipients, teamMentionRecipients } from "../wiki-intake-reply-notify";
import type { StoredMention } from "../wiki-mentions";

/**
 * ⚠️ These are about who must NOT be rung. A mention push is addressed to one
 * named person, so every bug here is a phone buzzing for somebody else — or a
 * client learning who is talking to whom inside their own team.
 */

const mention = (id: string, kind: StoredMention["kind"]): StoredMention => ({
  id,
  name: id,
  kind,
});

describe("clientMentionRecipients", () => {
  it("returns the client people named in a reply", () => {
    expect(
      clientMentionRecipients(
        [mention("client:u1", "CLIENT"), mention("client:u2", "CLIENT")],
        null,
      ),
    ).toEqual(["u1", "u2"]);
  });

  it("never rings the author", () => {
    // A client @mentioning a colleague must not notify themselves.
    expect(
      clientMentionRecipients([mention("client:u1", "CLIENT"), mention("client:u2", "CLIENT")], "u1"),
    ).toEqual(["u2"]);
  });

  it("ignores team mentions", () => {
    // Those go through `teamMentionRecipients` and the Foundry notification
    // system. Handling them here too would notify a Gitwork user twice.
    expect(clientMentionRecipients([mention("team:abc", "TEAM")], null)).toEqual([]);
  });

  it("drops contact:primary, which has no account to ring", () => {
    // A CLIENT-kind mention with no ClientWikiUser behind it — a name off the
    // client record. It still highlights and still reaches them by email.
    expect(clientMentionRecipients([mention("contact:primary", "CLIENT")], null)).toEqual([]);
  });

  it("requires the kind AND the id prefix to agree, both ways round", () => {
    // ⚠️ BOTH directions, because only testing one leaves half the guard
    // unprotected — proved by sabotage: deleting the `kind` check passed the
    // first version of this suite. Stored mentions are JSON written at reply
    // time, possibly by an older build, so the two can disagree in the data
    // even though `resolveMentions` always writes them consistently.
    expect(clientMentionRecipients([mention("team:abc", "CLIENT")], null)).toEqual([]);
    expect(clientMentionRecipients([mention("client:u1", "TEAM")], null)).toEqual([]);
    expect(clientMentionRecipients([mention("client:", "CLIENT")], null)).toEqual([]);
  });

  it("de-duplicates someone mentioned twice in one reply", () => {
    expect(
      clientMentionRecipients([mention("client:u1", "CLIENT"), mention("client:u1", "CLIENT")], null),
    ).toEqual(["u1"]);
  });

  it("and the team rule still ignores client mentions", () => {
    // The two are mirrors, and a mention must reach exactly one of them.
    const both = [mention("client:u1", "CLIENT"), mention("team:abc", "TEAM")];
    expect(clientMentionRecipients(both, null)).toEqual(["u1"]);
    expect(teamMentionRecipients(both, null)).toEqual(["abc"]);
  });
});
