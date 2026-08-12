import { describe, it, expect } from "vitest";
import {
  isAnswered,
  isLaunchpadDocKey,
  LAUNCHPAD_LEGAL_BANNER,
  LEGAL_GENERATORS,
  legalDocFields,
  renderLegalDoc,
} from "../legal/render";
import { LAUNCHPAD_DOC_KEYS } from "@/types/launchpad";
import type { LaunchpadAnswers } from "@/types/launchpad";

/** A fully-answered privacy policy — the fixed answer map the render is pinned to. */
const PRIVACY_ANSWERS: LaunchpadAnswers = {
  company_name: "Acme Health Ltd",
  trading_name: "Acme",
  registered_address: "1 Anchorage Quay, Salford, M50 3XE",
  website_url: "https://acmehealth.co.uk",
  contact_email: "privacy@acmehealth.co.uk",
  company_number: "12345678",
  effective_date: "1 September 2026",
  data_collected: "Name\nEmail address\nIP address",
  purposes: "To provide your account\nTo send service emails",
  processors: "Fasthosts (hosting)\nStripe (payments)",
  retention_period: "For as long as you have an account, then 6 years",
  international_transfers: "yes",
  uses_cookies: true,
  children: false,
};

describe("the TEMPLATE banner", () => {
  it("names all three things a reader must know", () => {
    expect(LAUNCHPAD_LEGAL_BANNER).toContain("TEMPLATE");
    expect(LAUNCHPAD_LEGAL_BANNER).toContain("not legal advice");
    expect(LAUNCHPAD_LEGAL_BANNER).toMatch(/lawyer/i);
  });

  it("is returned by every generator", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      expect(renderLegalDoc(key, {}).banner).toBe(LAUNCHPAD_LEGAL_BANNER);
    }
  });

  it("is NEVER inside the body — that is what stops a client's edit removing it", () => {
    // The banner is chrome, not content. If it lived in the markdown, one backspace
    // would turn a template into something reading as finished legal advice.
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const { body } = renderLegalDoc(key, PRIVACY_ANSWERS);
      expect(body).not.toContain(LAUNCHPAD_LEGAL_BANNER);
      expect(body).not.toContain("not legal advice");
    }
  });
});

describe("renderLegalDoc — determinism", () => {
  it("is byte-identical for the same answers", () => {
    expect(renderLegalDoc("privacy", PRIVACY_ANSWERS).body).toBe(
      renderLegalDoc("privacy", PRIVACY_ANSWERS).body,
    );
  });

  it("renders every generator without throwing on an empty answer map", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const out = renderLegalDoc(key, {});
      expect(out.body.length).toBeGreaterThan(200);
      expect(out.title).toBe(LEGAL_GENERATORS[key].title);
    }
  });
});

describe("renderLegalDoc — merge substitution", () => {
  const out = renderLegalDoc("privacy", PRIVACY_ANSWERS);

  it("substitutes every answered token", () => {
    expect(out.body).toContain("Acme Health Ltd");
    expect(out.body).toContain("privacy@acmehealth.co.uk");
    expect(out.body).toContain("1 Anchorage Quay, Salford, M50 3XE");
    expect(out.body).toContain("Company number: 12345678");
  });

  it("leaves no unresolved token behind when everything is answered", () => {
    expect(out.body).not.toMatch(/\{\{[a-z0-9_]+\}\}/);
    expect(out.missing).toEqual([]);
  });

  it("renders a select's LABEL, never its stored id", () => {
    // `{{international_transfers}}` must read as the sentence, not as "yes".
    expect(out.body).toContain("Yes — some providers are outside the UK/EEA");
    expect(out.body).not.toMatch(/Transfers outside the UK or EEA: yes/);
  });

  it("turns a one-per-line answer into markdown bullets", () => {
    expect(out.body).toContain("- Name");
    expect(out.body).toContain("- Email address");
    expect(out.body).toContain("- Fasthosts (hosting)");
  });

  it("does not double-bullet a line the client already bulleted", () => {
    const body = renderLegalDoc("privacy", {
      ...PRIVACY_ANSWERS,
      data_collected: "- Name\n* Email\n1. Phone",
    }).body;
    expect(body).toContain("- Name");
    expect(body).not.toContain("- - Name");
    expect(body).not.toContain("- * Email");
    expect(body).not.toContain("- 1. Phone");
  });
});

describe("renderLegalDoc — the required/optional asymmetry", () => {
  it("keeps a REQUIRED unanswered token visible and reports it", () => {
    // An unfinished draft has to look unfinished rather than plausibly complete.
    const out = renderLegalDoc("privacy", { ...PRIVACY_ANSWERS, contact_email: "" });
    expect(out.body).toContain("{{contact_email}}");
    expect(out.missing).toContain("Privacy contact email");
  });

  it("substitutes an OPTIONAL unanswered token away and drops its line", () => {
    const out = renderLegalDoc("privacy", { ...PRIVACY_ANSWERS, company_number: "" });
    expect(out.body).not.toContain("{{company_number}}");
    // The whole "Company number:" line goes, rather than leaving a dangling label.
    expect(out.body).not.toContain("Company number:");
    expect(out.missing).not.toContain("Company number");
  });

  it("drops the VAT line in the T&Cs for a client who is not VAT-registered", () => {
    const answered = { company_name: "Acme Ltd", vat_number: "GB123456789" };
    expect(renderLegalDoc("terms", answered).body).toContain("VAT registration number: GB123456789");
    expect(renderLegalDoc("terms", { company_name: "Acme Ltd" }).body).not.toContain(
      "VAT registration number",
    );
  });

  it("lists every missing required label for a blank doc", () => {
    const out = renderLegalDoc("privacy", {});
    const required = legalDocFields("privacy")
      .filter((f) => f.required)
      .map((f) => f.label);
    expect(out.missing.sort()).toEqual(required.sort());
  });
});

describe("no orphaned markdown markers, in ANY answer state", () => {
  /**
   * The defect this pins shipped and was caught by a SCREENSHOT, not a detector: a
   * wholly-unanswered cookie policy rendered `**{{trading_name}}**` as a literal
   * `****`, because the token is optional, its fallback was also blank, and the line
   * survived on the strength of a different (required) token.
   *
   * Three answer states per doc, because the bug only appeared in one of them — a
   * fixture that only tests the fully-answered case cannot distinguish the bug from
   * the fix (§42.10's lesson).
   */
  const STATES: Array<[string, LaunchpadAnswers]> = [
    ["empty", {}],
    ["partial", { company_name: "Acme Ltd", effective_date: "1 September 2026" }],
    ["full", PRIVACY_ANSWERS],
  ];

  for (const key of LAUNCHPAD_DOC_KEYS) {
    for (const [label, answers] of STATES) {
      it(`${key} / ${label} answers leaves no empty emphasis or stray markers`, () => {
        const { body } = renderLegalDoc(key, answers);
        expect(body, "empty bold").not.toMatch(/\*\*\s*\*\*/);
        expect(body, "quadruple asterisk").not.toContain("****");
        expect(body, "empty link text").not.toMatch(/\[\s*\]\(/);
        // A bold marker orphaned by a substitution leaves an ODD count on its line.
        for (const line of body.split("\n")) {
          const bolds = (line.match(/\*\*/g) ?? []).length;
          expect(bolds % 2, `unbalanced ** on: ${line.slice(0, 60)}`).toBe(0);
        }
      });
    }
  }

  it("leaves the token visible when a fallback chain ends in a required blank", () => {
    // `trading_name` is optional but falls back to `company_name`, which is required.
    // With neither answered the honest render is the loud placeholder, not "".
    const { body } = renderLegalDoc("cookie", {});
    expect(body).toContain("{{trading_name}}");
    expect(body).not.toContain("****");
  });
});

describe("renderLegalDoc — fallbackId", () => {
  it("falls a blank trading name back to the legal name", () => {
    // Otherwise the opening sentence of the policy loses its subject.
    const out = renderLegalDoc("privacy", { ...PRIVACY_ANSWERS, trading_name: "" });
    expect(out.body).toContain("**Acme Health Ltd** (\"we\", \"us\")");
    expect(out.body).not.toContain("{{trading_name}}");
  });

  it("prefers the client's own trading name when given", () => {
    expect(renderLegalDoc("privacy", PRIVACY_ANSWERS).body).toContain('**Acme** ("we", "us")');
  });
});

describe("renderLegalDoc — section gates", () => {
  it("drops a section whose gate is unticked", () => {
    const out = renderLegalDoc("privacy", { ...PRIVACY_ANSWERS, children: false });
    expect(out.body).not.toContain("## Children");
    expect(out.body).not.toContain("Age Appropriate");
  });

  it("keeps a section whose gate is ticked", () => {
    const out = renderLegalDoc("privacy", { ...PRIVACY_ANSWERS, children: true });
    expect(out.body).toContain("## Children");
  });

  it("gates on a non-empty string as well as a checkbox", () => {
    // A client who sets no marketing cookies gets no empty "Marketing cookies" clause.
    const none = renderLegalDoc("cookie", { marketing_cookies: "" });
    expect(none.body).not.toContain("## Marketing cookies");

    const some = renderLegalDoc("cookie", { marketing_cookies: "_fbp — Meta pixel — 90 days" });
    expect(some.body).toContain("## Marketing cookies");
    expect(some.body).toContain("- _fbp — Meta pixel — 90 days");
  });

  it("gates two sections off one answer", () => {
    const off = renderLegalDoc("terms", { sells_products: false });
    expect(off.body).not.toContain("## Prices and payment");
    expect(off.body).not.toContain("## Cancellation and refunds");

    const on = renderLegalDoc("terms", { sells_products: true });
    expect(on.body).toContain("## Prices and payment");
    expect(on.body).toContain("## Cancellation and refunds");
  });

  it("never drops the preamble or an ungated section", () => {
    const out = renderLegalDoc("terms", {});
    expect(out.body).toContain("# Terms & conditions");
    expect(out.body).toContain("## Acceptable use");
    expect(out.body).toContain("## Our liability");
  });

  it("leaves no 3-blank-line gap where a section was removed", () => {
    const out = renderLegalDoc("privacy", { ...PRIVACY_ANSWERS, children: false });
    expect(out.body).not.toMatch(/\n{3,}/);
  });
});

describe("the clamped markdown subset", () => {
  it("uses only constructs the block renderer can draw", () => {
    // Anything outside headings / lists / paragraphs / inline marks prints VERBATIM
    // to the client (ONBOARDING.md §4.7). Tables, fences and blockquotes are out.
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const template = LEGAL_GENERATORS[key].template;
      expect(template, `${key}: no tables`).not.toMatch(/^\s*\|/m);
      expect(template, `${key}: no code fences`).not.toContain("```");
      expect(template, `${key}: no blockquotes`).not.toMatch(/^\s*>\s/m);
      expect(template, `${key}: no raw HTML`).not.toMatch(/<[a-z][^>]*>/i);
    }
  });

  it("keeps every heading alone in its block, or the renderer draws it as a paragraph", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const blocks = LEGAL_GENERATORS[key].template.split(/\n{2,}/);
      for (const block of blocks) {
        if (!/^#{1,6}\s/.test(block.trim())) continue;
        expect(block.trim().split("\n"), `${key}: "${block.slice(0, 40)}"`).toHaveLength(1);
      }
    }
  });
});

describe("generator wiring", () => {
  it("registers exactly the declared doc keys, each self-consistent", () => {
    expect(Object.keys(LEGAL_GENERATORS).sort()).toEqual([...LAUNCHPAD_DOC_KEYS].sort());
    for (const key of LAUNCHPAD_DOC_KEYS) {
      expect(LEGAL_GENERATORS[key].key).toBe(key);
    }
  });

  it("gives every field a unique id, since the id IS the merge token", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const ids = legalDocFields(key).map((f) => f.id);
      expect(new Set(ids).size, `${key} has duplicate field ids`).toBe(ids.length);
    }
  });

  it("declares options on every select — a select with none renders an empty control", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      for (const field of legalDocFields(key)) {
        if (field.type === "select") {
          expect(field.options?.length, `${key}.${field.id}`).toBeGreaterThan(1);
        }
      }
    }
  });

  it("points every sectionGates entry at a real field and a real heading", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const gen = LEGAL_GENERATORS[key];
      const ids = new Set(gen.fields.map((f) => f.id));
      for (const [heading, fieldId] of Object.entries(gen.sectionGates ?? {})) {
        expect(ids.has(fieldId), `${key}: gate field "${fieldId}" does not exist`).toBe(true);
        expect(gen.template, `${key}: no "## ${heading}" heading to gate`).toContain(`## ${heading}`);
      }
    }
  });

  it("points every fallbackId at a real field", () => {
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const gen = LEGAL_GENERATORS[key];
      const ids = new Set(gen.fields.map((f) => f.id));
      for (const field of gen.fields) {
        if (field.fallbackId) expect(ids.has(field.fallbackId), `${key}.${field.id}`).toBe(true);
      }
    }
  });

  it("has a token in the template for every field it asks about", () => {
    // A question whose answer is never rendered is pure friction for the client.
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const gen = LEGAL_GENERATORS[key];
      for (const field of gen.fields) {
        const used =
          gen.template.includes(`{{${field.id}}}`) ||
          Object.values(gen.sectionGates ?? {}).includes(field.id);
        expect(used, `${key}.${field.id} is asked but never used`).toBe(true);
      }
    }
  });

  it("has a field for every token in the template", () => {
    // The mirror check — an unbacked token can never resolve, so it would ship
    // `{{foo}}` to the client on a fully-answered doc.
    for (const key of LAUNCHPAD_DOC_KEYS) {
      const gen = LEGAL_GENERATORS[key];
      const ids = new Set(gen.fields.map((f) => f.id));
      for (const match of gen.template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)) {
        expect(ids.has(match[1]), `${key}: token {{${match[1]}}} has no field`).toBe(true);
      }
    }
  });
});

describe("helpers", () => {
  it("isLaunchpadDocKey accepts only the three keys", () => {
    expect(isLaunchpadDocKey("privacy")).toBe(true);
    expect(isLaunchpadDocKey("Privacy")).toBe(false);
    expect(isLaunchpadDocKey("nda")).toBe(false);
    expect(isLaunchpadDocKey(undefined)).toBe(false);
  });

  it("isAnswered treats false and blank as unanswered, and 0 as answered", () => {
    expect(isAnswered(true)).toBe(true);
    expect(isAnswered(false)).toBe(false);
    expect(isAnswered("")).toBe(false);
    expect(isAnswered("   ")).toBe(false);
    expect(isAnswered("x")).toBe(true);
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered(0)).toBe(true);
  });
});
