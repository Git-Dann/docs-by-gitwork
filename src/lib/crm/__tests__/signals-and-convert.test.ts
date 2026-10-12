import { describe, expect, it } from "vitest";
import {
  buildGmailQuery,
  cleanSlackText,
  emailDirection,
  firstLeadAddress,
  normaliseDomainInput,
  normaliseMessageId,
  parseAddressList,
} from "@/lib/crm/signals";
import { buildConversionProposals, deriveMainContact, type ContactEvidence } from "@/lib/crm/convert";

describe("normaliseDomainInput", () => {
  it("accepts the ways people type a domain", () => {
    expect(normaliseDomainInput("https://www.Valu.com/about")).toBe("valu.com");
    expect(normaliseDomainInput("@valu.co.uk")).toBe("valu.co.uk");
    expect(normaliseDomainInput("jane@valu.com")).toBe("valu.com");
  });

  it("refuses anything that could be a Gmail search operator", () => {
    expect(normaliseDomainInput("valu.com OR from:me")).toBeNull();
    expect(normaliseDomainInput("{valu.com}")).toBeNull();
    expect(normaliseDomainInput('"valu.com"')).toBeNull();
    expect(normaliseDomainInput("localhost")).toBeNull();
  });
});

describe("buildGmailQuery", () => {
  it("asks only for mail to, from or cc'ing the lead's own domains", () => {
    const after = new Date("2026-10-01T00:00:00Z");
    const q = buildGmailQuery(["valu.com"], after);
    expect(q).toBe(`{from:valu.com to:valu.com cc:valu.com} after:${after.getTime() / 1000}`);
  });

  it("returns nothing at all when no domain is known — never an unscoped search", () => {
    expect(buildGmailQuery([], new Date())).toBeNull();
    expect(buildGmailQuery(["not a domain"], new Date())).toBeNull();
  });
});

describe("emailDirection", () => {
  it("is inbound from their domain or a subdomain, outbound otherwise", () => {
    expect(emailDirection('"Jane" <jane@valu.com>', ["valu.com"])).toBe("inbound");
    expect(emailDirection("ops@mail.valu.com", ["valu.com"])).toBe("inbound");
    expect(emailDirection("dan@gitwork.co.uk", ["valu.com"])).toBe("outbound");
  });

  it("does not treat a lookalike domain as theirs", () => {
    expect(emailDirection("x@notvalu.com", ["valu.com"])).toBe("outbound");
  });
});

describe("parseAddressList / firstLeadAddress", () => {
  it("keeps a comma inside a quoted display name", () => {
    expect(parseAddressList('"Doe, Jane" <jane@valu.com>, bob@valu.com')).toEqual([
      { name: "Doe, Jane", email: "jane@valu.com" },
      { name: null, email: "bob@valu.com" },
    ]);
  });

  it("finds who on their side we wrote to, skipping our own people", () => {
    const to = "Harry <harry@gitwork.co.uk>, Jane Doe <jane@valu.com>";
    expect(firstLeadAddress([to, null], ["valu.com"])).toEqual({ name: "Jane Doe", email: "jane@valu.com" });
  });
});

describe("normaliseMessageId / cleanSlackText", () => {
  it("strips brackets so two mailboxes' copies of one email dedupe", () => {
    expect(normaliseMessageId("<ABC123@mail.gmail.com>")).toBe("abc123@mail.gmail.com");
    expect(normaliseMessageId("  ")).toBeNull();
  });

  it("turns Slack markup into readable text", () => {
    expect(cleanSlackText("<@U123> sent <https://valu.com|the deck> to <#C1|valu> &amp; done")).toBe("@someone sent the deck to #valu & done");
  });
});

describe("deriveMainContact", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const row = (direction: string, email: string, name: string | null, iso: string): ContactEvidence => ({
    direction,
    counterpartEmail: email,
    counterpartName: name,
    occurredAt: at(iso),
  });

  it("picks whoever on their side emailed us most", () => {
    const rows = [
      row("inbound", "jane@valu.com", "Jane Doe", "2026-09-01"),
      row("inbound", "jane@valu.com", "Jane Doe", "2026-09-05"),
      row("inbound", "bob@valu.com", "Bob", "2026-09-06"),
      row("outbound", "bob@valu.com", "Bob", "2026-09-07"),
      row("outbound", "bob@valu.com", "Bob", "2026-09-08"),
    ];
    expect(deriveMainContact(rows, ["valu.com"])).toEqual({ name: "Jane Doe", email: "jane@valu.com", messages: 2 });
  });

  it("falls back to whoever we emailed when nobody on their side has written", () => {
    expect(deriveMainContact([row("outbound", "bob@valu.com", "Bob", "2026-09-07")], ["valu.com"])?.email).toBe("bob@valu.com");
  });

  it("never picks an automated sender or someone outside their domain", () => {
    const rows = [
      row("inbound", "no-reply@valu.com", null, "2026-09-01"),
      row("inbound", "no-reply@valu.com", null, "2026-09-02"),
      row("inbound", "jane@elsewhere.com", "Jane", "2026-09-03"),
    ];
    expect(deriveMainContact(rows, ["valu.com"])).toBeNull();
  });
});

describe("buildConversionProposals", () => {
  const contact = { name: "Jane Doe", email: "jane@valu.com", messages: 3 };

  it("fills empty fields, as a name + email pair", () => {
    const out = buildConversionProposals({ primaryContactName: null, primaryContactEmail: null, website: null }, contact, ["valu.com"]);
    expect(out.map((f) => [f.field, f.proposed])).toEqual([
      ["primaryContactEmail", "jane@valu.com"],
      ["primaryContactName", "Jane Doe"],
      ["website", "https://valu.com"],
    ]);
  });

  it("never overwrites a field someone already filled in", () => {
    const out = buildConversionProposals(
      { primaryContactName: "Sam", primaryContactEmail: "sam@valu.com", website: "https://valu.com" },
      contact,
      ["valu.com"],
    );
    expect(out).toEqual([]);
  });

  it("never names one person at another person's address", () => {
    const out = buildConversionProposals({ primaryContactName: null, primaryContactEmail: "sam@valu.com", website: "x" }, contact, ["valu.com"]);
    expect(out).toEqual([]);
  });

  it("adds a name to an existing email only when it is the same person", () => {
    const out = buildConversionProposals({ primaryContactName: null, primaryContactEmail: "Jane@Valu.com", website: "x" }, contact, ["valu.com"]);
    expect(out.map((f) => f.field)).toEqual(["primaryContactName"]);
  });
});
