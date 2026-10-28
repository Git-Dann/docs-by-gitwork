import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import { CRAWL_EVIDENCE_KEYS, CRAWL_EVIDENCE_RULES, crawlEvidencePages, upgradeFromCrawl, type EvidencePage } from "../crawl-evidence";
import { selectTrustPages, trustTopic, type CrawlObservation, type FetchedPage, type TrustTopic } from "../site-crawl";
import { CHECKS_REGISTRY } from "../../checks-registry";

const HOME = "https://www.example.com/";
const doc = (title: string, body: string, lang = "en") =>
  `<!doctype html><html lang="${lang}"><head><title>${title}</title></head><body><nav><a href="/">Home</a></nav><main>${body}</main><footer>Example</footer></body></html>`;
const fetched = (url: string, body: string, extra: Partial<FetchedPage> = {}): FetchedPage => ({
  url, finalUrl: url, status: 200, contentType: "text/html; charset=utf-8", headers: {}, body, ...extra,
});
const HOME_BODY = doc("Example | Tools for teams", "<h1>Tools for teams</h1><p>Plan, build and ship with Example.</p>");

function observation(pages: Array<{ fetch: FetchedPage; topic?: TrustTopic; kind?: "about" | "article" | "pricing" | "contact" | null }>, catchAll: string | null = null): CrawlObservation {
  return {
    home: fetched(HOME, HOME_BODY),
    pages: pages.filter((p) => !p.topic).map((p) => ({ fetch: p.fetch, kind: p.kind ?? null, source: "link" as const })),
    catchAll: catchAll === null ? { status: 404, body: "" } : { status: 200, body: catchAll },
    linkChecks: [],
    linksFound: 0,
    sitemap: { read: false, urlCount: 0, checks: [] },
    robotsBlocked: 0,
    budgetExhausted: false,
    trustPages: pages.filter((p) => p.topic).map((p) => ({ fetch: p.fetch, topic: p.topic! })),
  };
}

const row = (checkKey: string, status: PulseScanCheckInput["status"] = "INCONCLUSIVE"): PulseScanCheckInput => ({
  category: "Business Operations", checkKey, label: checkKey, status, detail: "From the homepage.",
});

function upgrade(checkKey: string, pages: Parameters<typeof observation>[0], status: PulseScanCheckInput["status"] = "INCONCLUSIVE", catchAll: string | null = null) {
  return upgradeFromCrawl([row(checkKey, status)], crawlEvidencePages(observation(pages, catchAll)))[0];
}

const SUBPROCESSORS = fetched("https://www.example.com/legal/subprocessors", doc("Sub-processors | Example", "<h1>Sub-processors</h1><p>Example uses the following sub-processors to deliver the service.</p>"));

describe("a crawled page that says it turns INCONCLUSIVE into PASS, naming the page", () => {
  it("sub-processor list on a trust page", () => {
    const c = upgrade("supplier_due_diligence", [{ fetch: SUBPROCESSORS, topic: "subprocessors" }]);
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("https://www.example.com/legal/subprocessors");
    expect(c.detail).toContain('which says: "Sub-processors"');
    expect(c.evidence).toContain("https://www.example.com/legal/subprocessors");
  });

  it("a whistleblowing link on an ordinary page counts, quoting the link", () => {
    const about = fetched("https://www.example.com/about", doc("About Example", '<p>Our story.</p><a href="/speak-up">Whistleblowing</a>'));
    const c = upgrade("whistleblower_policy", [{ fetch: about, kind: "about" }]);
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("https://www.example.com/about");
  });

  it("the rights a privacy notice explains, from a separate rights page", () => {
    const rights = fetched("https://www.example.com/privacy/your-rights", doc("Your rights | Example", "<h2>Data portability</h2><p>You have the right to data portability: we will give you your data in a machine-readable format.</p><p>You have the right of access to your personal data.</p>"));
    for (const key of ["gdpr_right_to_access", "gdpr_right_to_portability"]) {
      const c = upgrade(key, [{ fetch: rights, topic: "rights" }]);
      expect(c.status, key).toBe("PASS");
      expect(c.detail).toContain("/privacy/your-rights");
    }
  });
});

describe("crawled pages that do not say it leave the check alone", () => {
  it("still INCONCLUSIVE when no page names it", () => {
    const pricing = fetched("https://www.example.com/pricing", doc("Pricing", "<p>Free, Pro and Enterprise plans.</p>"));
    expect(upgrade("supplier_due_diligence", [{ fetch: pricing, kind: "pricing" }])).toEqual(row("supplier_due_diligence"));
  });

  it("still INCONCLUSIVE with no pages at all", () => {
    expect(upgrade("bribery_act_policy", [])).toEqual(row("bribery_act_policy"));
  });
});

describe("only pages that are really pages count", () => {
  it("a soft 404 (the homepage served at another path) containing the words does not count", () => {
    // Same title and content as the homepage, plus the words: a catch-all answer, not a page.
    const homeWithWords = HOME_BODY.replace("Plan, build and ship with Example.", "Plan, build and ship with Example. sub-processors");
    const echo = fetched("https://www.example.com/legal/subprocessors", homeWithWords);
    expect(upgrade("supplier_due_diligence", [{ fetch: echo, topic: "subprocessors" }], "INCONCLUSIVE", homeWithWords).status).toBe("INCONCLUSIVE");
  });

  it("an unrendered app shell does not count", () => {
    const shell = fetched("https://www.example.com/legal/subprocessors", `<!doctype html><html><head><title>Example</title><script src="/app.js"></script></head><body><div id="root"></div><noscript><a href="/legal/subprocessors">Sub-processors</a></noscript></body></html>`);
    expect(upgrade("supplier_due_diligence", [{ fetch: shell, topic: "subprocessors" }]).status).toBe("INCONCLUSIVE");
  });

  it("a 403 or a bot wall does not count", () => {
    const blocked = fetched(SUBPROCESSORS.url, SUBPROCESSORS.body, { status: 403 });
    expect(upgrade("supplier_due_diligence", [{ fetch: blocked, topic: "subprocessors" }]).status).toBe("INCONCLUSIVE");
  });
});

describe("only an upgrade", () => {
  it("never replaces a homepage PASS", () => {
    const pass: PulseScanCheckInput = { ...row("supplier_due_diligence", "PASS"), detail: "Homepage quote." };
    expect(upgradeFromCrawl([pass], crawlEvidencePages(observation([{ fetch: SUBPROCESSORS, topic: "subprocessors" }])))[0]).toBe(pass);
  });

  it("a WARN is upgraded only where the check's own WARN says another page satisfies it", () => {
    const privacy = fetched("https://www.example.com/privacy", doc("Privacy policy", "<h2>Data retention</h2><p>We keep account data for as long as your account is open.</p><p>You have the right of access to your personal data.</p>"));
    expect(upgrade("data_retention_schedule", [{ fetch: privacy, topic: "privacy" }], "WARN").status).toBe("PASS");
    // The rights check's WARN means the policy was read and omits the right: not for the crawl to overturn.
    expect(upgrade("gdpr_right_to_access", [{ fetch: privacy, topic: "privacy" }], "WARN").status).toBe("WARN");
  });

  it("never produces a FAIL or a WARN, whatever the pages say", () => {
    const pages = crawlEvidencePages(observation([{ fetch: SUBPROCESSORS, topic: "subprocessors" }]));
    for (const key of CRAWL_EVIDENCE_KEYS) {
      for (const status of ["INCONCLUSIVE", "PASS", "NOT_APPLICABLE", "SKIPPED"] as const) {
        const out = upgradeFromCrawl([row(key, status)], pages)[0];
        expect(["PASS", status], `${key} from ${status}`).toContain(out.status);
      }
    }
  });
});

describe("each check reads only the pages that can answer it", () => {
  it("a retention period in a blog post is not a retention schedule", () => {
    // Its title says privacy, so only being a blog post keeps it out.
    const post = fetched("https://www.example.com/blog/privacy-and-backups", doc("Privacy and backups", "<p>Backups are kept for 30 days and deleted after 30 days.</p>"));
    expect(upgrade("data_retention_schedule", [{ fetch: post, kind: "article" }], "WARN").status).toBe("WARN");
  });

  it("a privacy notice quoting the regulator's phone hours is not the business's hours (gov.uk)", () => {
    const notice = fetched("https://www.example.com/help/privacy-notice", doc("Privacy notice", "<p>Information Commissioner<br>Telephone: 0303 123 1113<br>Monday to Friday, 9am to 4:30pm</p>"));
    expect(upgrade("business_hours_displayed", [{ fetch: notice, topic: "privacy" }]).status).toBe("INCONCLUSIVE");
    const contact = fetched("https://www.example.com/contact", doc("Contact us", "<p>Our support team is available Monday to Friday, 9am to 5:30pm.</p>"));
    expect(upgrade("business_hours_displayed", [{ fetch: contact, kind: "contact" }]).status).toBe("PASS");
  });

  it("'24/7 support' sold on a product page is not the business's support hours (atlassian.com/enterprise)", () => {
    const product = fetched("https://www.example.com/enterprise", doc("Enterprise", "<p>AI-powered workflows that deliver contextual, 24/7 support to employees and customers.</p>"));
    expect(upgrade("business_hours_displayed", [{ fetch: product }]).status).toBe("INCONCLUSIVE");
  });

  it("an uptime SLA on a pricing page is not a support response time (linear.app)", () => {
    const pricing = fetched("https://www.example.com/pricing", doc("Pricing", "<ul><li>Uptime SLA</li><li>SAML SSO</li></ul>"));
    expect(upgrade("support_sla_documented", [{ fetch: pricing, kind: "pricing" }], "WARN").status).toBe("WARN");
    const plans = fetched("https://www.example.com/support-plans", doc("Support plans", "<p>Premium includes a 15-minute response SLA.</p>"));
    expect(upgrade("support_sla_documented", [{ fetch: plans }], "WARN").status).toBe("PASS");
  });

  it("an invoicing feature on a product page is not invoices for the customer (stripe.com/products)", () => {
    const product = fetched("https://www.example.com/products", doc("Products", "<p>Send an Invoice PDF to your customers.</p>"));
    expect(upgrade("invoice_generation_b2b", [{ fetch: product }]).status).toBe("INCONCLUSIVE");
  });

  it("a CEO in a customer story is not the company's responsible person", () => {
    const story = fetched("https://www.example.com/customers/acme-company", doc("Acme company story", "<p>Jane Doe, CEO of Acme, says it changed everything.</p>"));
    expect(upgrade("eu_director_info", [{ fetch: story }]).status).toBe("INCONCLUSIVE");
  });

  it("the rights checks read only English privacy pages", () => {
    const de = fetched("https://www.example.com/datenschutz", doc("Datenschutz", "<p>Right of access to your personal data.</p>", "de"));
    expect(upgrade("gdpr_right_to_access", [{ fetch: de, topic: "privacy" }]).status).toBe("INCONCLUSIVE");
  });
});

describe("the Modern Slavery Act statement", () => {
  it("found only off the homepage stays INCONCLUSIVE, and says where it is", () => {
    const statement = fetched("https://www.example.com/modern-slavery-statement", doc("Modern Slavery Statement", "<h1>Modern Slavery Statement 2025</h1>"));
    const c = upgrade("modern_slavery_statement", [{ fetch: statement, topic: "ethics" }]);
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toContain("https://www.example.com/modern-slavery-statement");
  });
});

describe("every rule names a registered check", () => {
  it("each key is in the check registry", () => {
    const keys = new Set(CHECKS_REGISTRY.map((c) => c.key));
    for (const key of CRAWL_EVIDENCE_KEYS) expect(keys.has(key), key).toBe(true);
    expect(Object.keys(CRAWL_EVIDENCE_RULES).length).toBeGreaterThan(10);
  });
});

describe("trust page selection", () => {
  const link = (href: string, text = "") => ({ href, text, base: HOME });

  it("finds legal and trust pages by path or link text", () => {
    expect(trustTopic("https://www.example.com/legal/subprocessors")).toBe("subprocessors");
    expect(trustTopic("https://www.example.com/x/y", "Privacy Policy")).toBe("privacy");
    expect(trustTopic("https://www.example.com/p/123", "Your privacy rights")).toBe("rights");
    expect(trustTopic("https://www.example.com/pricing", "Pricing")).toBeNull();
  });

  it("one page per topic first, in priority order, never the homepage or a page already read", () => {
    const picks = selectTrustPages(
      [link("/terms", "Terms"), link("/privacy", "Privacy"), link("/privacy/cookies", "Privacy"), link("/legal/subprocessors"), link("/", "Privacy"), link("/security", "Security"), link("https://other.example.org/privacy", "Privacy")],
      HOME,
      new Set(["example.com/security"]),
      3,
      null,
    );
    expect(picks.map((p) => p.url)).toEqual([
      "https://www.example.com/legal/subprocessors",
      "https://www.example.com/privacy",
      "https://www.example.com/terms",
    ]);
  });

  it("respects robots.txt", () => {
    const picks = selectTrustPages([link("/privacy", "Privacy")], HOME, new Set(), 5, { allow: [], disallow: ["/privacy"] });
    expect(picks).toEqual([]);
  });
});
