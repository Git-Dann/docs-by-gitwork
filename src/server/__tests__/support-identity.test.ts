import { describe, expect, it } from "vitest";
import { resolveCustomer, derivePreview, emailsIn } from "@/server/support-channels/identity";

// Fixtures are REAL rows from the Fellas Loaded inbox (the 226-row queue where every row was
// labelled "Fellas Loaded"). Designing against invented sample data is what let that ship.
const CTX = { mailboxAddress: "support@fellasloaded.com", mailboxName: "Fellas Loaded" };

describe("resolveCustomer — forwarded contact-form mail", () => {
  it("pulls the customer out of the subject when the mailbox forwarded to itself", () => {
    const r = resolveCustomer(
      {
        fromText: '"Fellas Loaded" <support@fellasloaded.com>',
        subject: "Support Request - mattyshannan@gmail.com",
        body: "I can't log in since the update.",
      },
      CTX,
    );
    expect(r.label).toBe("mattyshannan@gmail.com");
    expect(r.viaForwarder).toBe(true);
  });

  it("recognises the forwarder by display name even when the address differs", () => {
    // Some forwards arrive from a relay address but keep the app's display name.
    const r = resolveCustomer(
      { fromText: "Fellas Loaded <bounce-72@mailer.example>", subject: "Support Request - kerryncopand2001@gmail.com" },
      CTX,
    );
    expect(r.label).toBe("kerryncopand2001@gmail.com");
  });

  it("falls back to the body when the subject carries no address", () => {
    const r = resolveCustomer(
      {
        fromText: '"Fellas Loaded" <support@fellasloaded.com>',
        subject: "New enquiry",
        body: "Name: Jo Blake\nEmail: jo.blake@outlook.com\nMessage: my card was declined",
      },
      CTX,
    );
    expect(r.label).toBe("jo.blake@outlook.com");
  });

  it("never picks the mailbox's own address back out of the subject or body", () => {
    const r = resolveCustomer(
      {
        fromText: '"Fellas Loaded" <support@fellasloaded.com>',
        subject: "Copy of message sent to support@fellasloaded.com",
        body: "Reply to support@fellasloaded.com",
      },
      CTX,
    );
    // Nothing better exists, so it keeps the From line rather than inventing an identity.
    expect(r.label).toBe("Fellas Loaded");
    expect(r.viaForwarder).toBe(true);
  });

  it("ignores no-reply addresses as candidate customers", () => {
    const r = resolveCustomer(
      {
        fromText: '"Fellas Loaded" <support@fellasloaded.com>',
        subject: "Support Request - noreply@fellasloaded.com",
        body: "sent via the app",
      },
      CTX,
    );
    expect(r.label).toBe("Fellas Loaded");
  });
});

describe("resolveCustomer — mail from a real person is left alone", () => {
  // The dangerous failure mode of the fix: replacing a genuine sender with whatever address
  // happens to appear in their subject line. These are the rows that were already correct.
  it('keeps a quoted display name ("Björn Khermik")', () => {
    const r = resolveCustomer({ fromText: '"Björn Khermik" <bjorn@example.se>', subject: "cant pay for membership" }, CTX);
    expect(r.label).toBe("Björn Khermik");
    expect(r.email).toBe("bjorn@example.se");
    expect(r.viaForwarder).toBe(false);
  });

  it("keeps a real sender even when their subject mentions another address", () => {
    const r = resolveCustomer(
      { fromText: "Sanmatin Matin <sanmatin@fellv.com>", subject: "Partnership Opportunity: FELLV.com for [Company]" },
      CTX,
    );
    expect(r.label).toBe("Sanmatin Matin");
  });

  it("uses the address when there is no display name", () => {
    const r = resolveCustomer({ fromText: "jesse.grever@gmail.com", subject: "Loaded subscription" }, CTX);
    expect(r.label).toBe("jesse.grever@gmail.com");
  });

  it("works with no mailbox context configured at all", () => {
    const r = resolveCustomer({ fromText: '"Jane Doe" <jane@x.com>', subject: "hello" });
    expect(r.label).toBe("Jane Doe");
    expect(r.viaForwarder).toBe(false);
  });
});

describe("derivePreview", () => {
  it("returns null rather than echoing the subject", () => {
    // This is the bug that made every row render the same string twice: Gmail set
    // `preview: subject` and never updated it.
    expect(derivePreview("Support Request - matty@gmail.com", "Support Request - matty@gmail.com")).toBeNull();
  });

  it("returns the actual message text", () => {
    expect(derivePreview("I can't log in since the update.", "Support Request - matty@gmail.com")).toBe(
      "I can't log in since the update.",
    );
  });

  it("strips quoted history so a reply doesn't preview the message it answers", () => {
    const body = "Thanks, that worked.\n\nOn Mon, 4 Aug 2026 at 09:12, Support wrote:\n> Have you tried resetting?";
    expect(derivePreview(body)).toBe("Thanks, that worked.");
  });

  it("strips a signature block", () => {
    expect(derivePreview("Please cancel my membership.\n--\nSent from my iPhone")).toBe("Please cancel my membership.");
  });

  it("unwraps form-forwarder labels", () => {
    const body = "Name: Jo Blake\nEmail: jo@x.com\nMessage: my card was declined twice";
    expect(derivePreview(body)).toBe("Jo Blake jo@x.com my card was declined twice");
  });

  it("collapses whitespace and caps the length", () => {
    const out = derivePreview("a".repeat(400));
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(200);
  });

  it("is null for an empty or whitespace-only body", () => {
    expect(derivePreview("")).toBeNull();
    expect(derivePreview("   \n\n  ")).toBeNull();
    expect(derivePreview(null)).toBeNull();
  });
});

describe("emailsIn", () => {
  it("finds addresses in ordinary text", () => {
    expect(emailsIn("Support Request - matty.shannan+tag@gmail.co.uk")).toEqual(["matty.shannan+tag@gmail.co.uk"]);
  });
  it("is empty for text with none", () => {
    expect(emailsIn("cant pay for membership")).toEqual([]);
  });
});

describe("resolveCustomer — the shape actually stored in the database", () => {
  /**
   * ⚠️ These are the cases the first fix missed, and they are the reason it repaired nothing in
   * production while every test above passed.
   *
   * Gmail stores `authorLabel` with the `<address>` ALREADY STRIPPED, and the connector config
   * holds addresses (impersonateEmail / intakeAddress) while the stored customerLabel is a
   * display name. So at repair time there is no address on either side to compare — the only
   * usable signal is that the "customer" is the Care client's own name.
   */
  it("detects the forwarder from the CLIENT NAME when no address survives", () => {
    const r = resolveCustomer(
      // Exactly what the DB holds: a bare display name, no angle brackets, no address.
      { fromText: "Fellas Loaded", subject: "Support Request - mattyshannan@gmail.com", body: "" },
      { mailboxAddress: "support@fellasloaded.com", clientName: "Fellas Loaded" },
    );
    expect(r.label).toBe("mattyshannan@gmail.com");
    expect(r.viaForwarder).toBe(true);
  });

  it("matches the client name case- and whitespace-insensitively", () => {
    const r = resolveCustomer(
      { fromText: "  fellas loaded ", subject: "Support Request - joshwedlock1234@gmail.com" },
      { clientName: "Fellas Loaded" },
    );
    expect(r.label).toBe("joshwedlock1234@gmail.com");
  });

  it("still leaves a real customer alone when only clientName is configured", () => {
    // The guard that matters: clientName must not become a licence to rewrite every sender.
    const r = resolveCustomer(
      { fromText: "Jesse Grever", subject: "Loaded subscription" },
      { clientName: "Fellas Loaded" },
    );
    expect(r.label).toBe("Jesse Grever");
    expect(r.viaForwarder).toBe(false);
  });

  it("keeps the forwarder name when the subject holds no customer address", () => {
    const r = resolveCustomer(
      { fromText: "Fellas Loaded", subject: "(The Fellas Studios Forwarding confirmation)" },
      { clientName: "Fellas Loaded" },
    );
    expect(r.label).toBe("Fellas Loaded");
    expect(r.viaForwarder).toBe(true);
  });
});
