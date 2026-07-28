import { describe, it, expect } from "vitest";
import { evaluateBuilderChecks, isPromptBuilder, probeBubbleDataApi, probeBubbleVersionTest } from "../builder-platforms";
import type { PulseScanCheckInput } from "@/types/pulse";

// These checks fire on real client bundles, so the tests that matter most are the
// ones asserting they stay QUIET. A scanner that cries wolf on a legitimate
// production site is worse than one that says nothing: it teaches people to ignore
// the report. Each "does not fire" case below is a plausible-looking string that
// must NOT trip the rule.

const keys = (checks: PulseScanCheckInput[]) => checks.map((c) => c.checkKey);
const find = (checks: PulseScanCheckInput[], key: string) => checks.find((c) => c.checkKey === key);

const base = { builder: "Lovable", hostname: "example.com", html: "", bundle: "" };

describe("evaluateBuilderChecks — gating", () => {
  it("returns nothing when no builder was detected", () => {
    // The no-op guarantee: every hand-coded project must be unaffected.
    expect(
      evaluateBuilderChecks({ ...base, builder: null, bundle: "fetch('https://api.openai.com/v1/chat')" }),
    ).toEqual([]);
  });

  it("emits nothing for a clean production build on a custom domain", () => {
    const out = evaluateBuilderChecks({
      ...base,
      hostname: "app.acme.com",
      bundle: "const a=1;function render(){return null}",
    });
    expect(out).toEqual([]);
  });
});

describe("paid provider called from the browser", () => {
  it("fails when the bundle calls a provider endpoint directly", () => {
    const out = evaluateBuilderChecks({
      ...base,
      bundle: `await fetch("https://api.openai.com/v1/chat/completions",{headers:{Authorization:"Bearer "+k}})`,
    });
    const c = find(out, "builder_paid_provider_from_browser");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toContain("OpenAI");
  });

  it("names every provider it found, not just the first", () => {
    const out = evaluateBuilderChecks({
      ...base,
      bundle: "api.openai.com api.anthropic.com api.stripe.com/v1/charges",
    });
    const c = find(out, "builder_paid_provider_from_browser");
    expect(c?.evidence).toContain("OpenAI");
    expect(c?.evidence).toContain("Anthropic");
    expect(c?.evidence).toContain("Stripe");
  });

  it("does not fire on Stripe's PUBLISHABLE client library", () => {
    // js.stripe.com IS meant to run in the browser with a pk_ key. Flagging it
    // would fire on every correctly-built checkout on the internet. Only the
    // secret REST API (api.stripe.com/v1/) is a finding.
    const out = evaluateBuilderChecks({
      ...base,
      bundle: `Stripe("pk_live_abc");import "https://js.stripe.com/v3/";`,
    });
    expect(keys(out)).not.toContain("builder_paid_provider_from_browser");
  });

  it("does not fire on a same-origin server route that proxies a provider", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: `fetch("/api/chat")` });
    expect(keys(out)).not.toContain("builder_paid_provider_from_browser");
  });
});

describe("dev tooling and source maps", () => {
  it("flags Lovable's tagger and the editor bridge", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: `import{lovableTagger}from"lovable-tagger"` });
    expect(find(out, "builder_dev_tooling_in_prod")?.status).toBe("WARN");
  });

  it("flags a public source map reference", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: "0\n//# sourceMappingURL=index-abc123.js.map" });
    const c = find(out, "builder_sourcemaps_public");
    expect(c?.status).toBe("WARN");
    expect(c?.evidence).toBe("index-abc123.js.map");
  });

  it("does not treat the words in ordinary code as dev tooling", () => {
    const out = evaluateBuilderChecks({
      ...base,
      bundle: "const refresh=()=>location.reload();// vite is great",
    });
    expect(keys(out)).not.toContain("builder_dev_tooling_in_prod");
  });
});

describe("client-side authorization", () => {
  it("warns — never fails — because the server side is unobservable", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: `if(user.isAdmin){showPanel()}` });
    const c = find(out, "builder_client_side_authorization");
    // A FAIL here would be asserting something this scan cannot see.
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("MEDIUM");
  });

  it("matches an explicit role comparison too", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: `role === "admin" ? <Admin/> : null` });
    expect(keys(out)).toContain("builder_client_side_authorization");
  });
});

describe("hosting shape is per-platform", () => {
  it("fails a Replit workspace URL and passes a Deployment", () => {
    const workspace = evaluateBuilderChecks({ ...base, builder: "Replit", hostname: "app.replit.dev" });
    expect(find(workspace, "replit_production_deployment")?.status).toBe("FAIL");

    const deployed = evaluateBuilderChecks({ ...base, builder: "Replit", hostname: "myapp.replit.app" });
    expect(find(deployed, "replit_production_deployment")?.status).toBe("PASS");
  });

  it("fails a v0 preview host", () => {
    const out = evaluateBuilderChecks({ ...base, builder: "v0 (Vercel)", hostname: "something.v0.dev" });
    expect(find(out, "v0_preview_host_production")?.status).toBe("FAIL");
  });

  it("warns on Bolt's default Netlify subdomain but not on a custom domain", () => {
    const dflt = evaluateBuilderChecks({ ...base, builder: "Bolt (StackBlitz)", hostname: "zippy-cat-123.netlify.app" });
    expect(find(dflt, "builder_default_deploy_domain")?.status).toBe("WARN");

    const custom = evaluateBuilderChecks({ ...base, builder: "Bolt (StackBlitz)", hostname: "acme.com" });
    expect(keys(custom)).not.toContain("builder_default_deploy_domain");
  });

  it("does not apply one platform's hosting rule to another", () => {
    // A Lovable app on netlify.app is not Bolt's default-domain finding, and a
    // Replit deployment check must not appear for a v0 app.
    const lovableOnNetlify = evaluateBuilderChecks({ ...base, builder: "Lovable", hostname: "x.netlify.app" });
    expect(keys(lovableOnNetlify)).not.toContain("builder_default_deploy_domain");

    const v0 = evaluateBuilderChecks({ ...base, builder: "v0 (Vercel)", hostname: "acme.com" });
    expect(keys(v0)).not.toContain("replit_production_deployment");
  });

  it("does not fire a hosting finding for a non-prompt builder", () => {
    const webflow = evaluateBuilderChecks({ ...base, builder: "Webflow", hostname: "acme.com" });
    expect(keys(webflow)).toEqual([]);
  });
});

describe("Lovable specifics", () => {
  it("warns about the unoptimised upload path", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: `<img src="/lovable-uploads/photo.png">` });
    expect(find(out, "lovable_uploads_unoptimised")?.status).toBe("WARN");
  });

  it("does not apply the upload-path rule to another builder", () => {
    const out = evaluateBuilderChecks({ ...base, builder: "Replit", bundle: `/lovable-uploads/x.png` });
    expect(keys(out)).not.toContain("lovable_uploads_unoptimised");
  });

  it("flags a leftover builder badge", () => {
    const out = evaluateBuilderChecks({ ...base, bundle: `<a>Edit with Lovable</a>` });
    expect(find(out, "builder_badge_visible")?.status).toBe("WARN");
  });
});

describe("isPromptBuilder", () => {
  it("covers the four prompt-to-app builders and excludes site builders", () => {
    for (const b of ["Lovable", "Bolt (StackBlitz)", "v0 (Vercel)", "Replit"]) {
      expect(isPromptBuilder(b), b).toBe(true);
    }
    for (const b of ["Webflow", "Wix", "Squarespace", "Framer", null]) {
      expect(isPromptBuilder(b), String(b)).toBe(false);
    }
  });
});

describe("client-side authorization is scoped to prompt builders", () => {
  it("does not fire on a hosted site builder's vendor runtime", () => {
    // Webflow/Wix ship a large vendor bundle of their own; `userRole` there is far
    // more likely to be platform code than the author's authorization logic.
    for (const b of ["Webflow", "Wix", "Squarespace", "Framer"]) {
      const out = evaluateBuilderChecks({ ...base, builder: b, bundle: `var userRole="viewer"` });
      expect(keys(out), b).not.toContain("builder_client_side_authorization");
    }
  });

  it("still fires for each of the four prompt builders", () => {
    for (const b of ["Lovable", "Bolt (StackBlitz)", "v0 (Vercel)", "Replit"]) {
      const out = evaluateBuilderChecks({ ...base, builder: b, bundle: `if(user.isAdmin){}` });
      expect(keys(out), b).toContain("builder_client_side_authorization");
    }
  });
});

describe("default deploy subdomain — one check, twelve platforms", () => {
  it("warns on each platform's own default host", () => {
    const cases: Array<[string, string]> = [
      ["Framer", "site.framer.app"],
      ["Webflow", "site.webflow.io"],
      ["Wix", "me.wixsite.com"],
      ["Bubble", "app.bubbleapps.io"],
      ["Softr", "portal.softr.app"],
      ["Carrd", "me.carrd.co"],
      ["Glide", "app.glide.page"],
      ["Squarespace", "site.squarespace.com"],
    ];
    for (const [builder, hostname] of cases) {
      const out = evaluateBuilderChecks({ ...base, builder, hostname });
      expect(find(out, "builder_default_deploy_domain")?.status, builder).toBe("WARN");
    }
  });

  it("stays silent on a custom domain for every platform", () => {
    for (const builder of ["Framer", "Webflow", "Wix", "Bubble", "Softr", "Carrd", "Glide", "Squarespace"]) {
      const out = evaluateBuilderChecks({ ...base, builder, hostname: "acme.com" });
      expect(keys(out), builder).not.toContain("builder_default_deploy_domain");
    }
  });

  it("never double-reports a host that already has a stronger finding", () => {
    // A Replit workspace URL and a v0 preview mean "not a deployment at all",
    // which is stronger than "unbranded" — one URL, one finding.
    const replit = evaluateBuilderChecks({ ...base, builder: "Replit", hostname: "x.replit.app" });
    expect(keys(replit)).not.toContain("builder_default_deploy_domain");

    const v0 = evaluateBuilderChecks({ ...base, builder: "v0 (Vercel)", hostname: "x.vercel.app" });
    expect(keys(v0)).not.toContain("builder_default_deploy_domain");

    // Bolt keeps its own wording, so exactly one default-domain finding, not two.
    const bolt = evaluateBuilderChecks({ ...base, builder: "Bolt (StackBlitz)", hostname: "x.netlify.app" });
    expect(bolt.filter((c) => c.checkKey === "builder_default_deploy_domain")).toHaveLength(1);
  });
});

describe("Webflow staging indexability", () => {
  it("warns when the staging host is indexable", () => {
    const out = evaluateBuilderChecks({ ...base, builder: "Webflow", hostname: "site.webflow.io", html: "<html></html>" });
    expect(find(out, "webflow_staging_indexable")?.status).toBe("WARN");
  });

  it("passes when staging correctly sends noindex", () => {
    const out = evaluateBuilderChecks({
      ...base, builder: "Webflow", hostname: "site.webflow.io",
      html: `<meta name="robots" content="noindex, nofollow">`,
    });
    expect(find(out, "webflow_staging_indexable")?.status).toBe("PASS");
  });

  it("does not run on a Webflow site already on its own domain", () => {
    const out = evaluateBuilderChecks({ ...base, builder: "Webflow", hostname: "acme.com" });
    expect(keys(out)).not.toContain("webflow_staging_indexable");
  });
});

describe("Bubble Data API probe", () => {
  const origin = "https://app.bubbleapps.io";

  it("fails when a type returns live records unauthenticated", async () => {
    const out = await probeBubbleDataApi({ builder: "Bubble", origin }, {
      fetchJson: async () => ({ status: 200, body: { response: { results: [{ _id: "1", email: "a@b.c" }] } } }),
    });
    const c = find(out, "bubble_data_api_open");
    expect(c?.status).toBe("FAIL");
    expect(c?.detail).toContain("privacy rules");
  });

  it("stops at the first proven exposure instead of enumerating", async () => {
    // A readiness scan proves the door is open; it does not walk through it.
    let calls = 0;
    await probeBubbleDataApi({ builder: "Bubble", origin }, {
      fetchJson: async () => {
        calls++;
        return { status: 200, body: { response: { results: [{ _id: "1" }] } } };
      },
    });
    expect(calls).toBe(1);
  });

  it("passes when the API rejects unauthenticated reads", async () => {
    const out = await probeBubbleDataApi({ builder: "Bubble", origin }, {
      fetchJson: async () => ({ status: 403, body: null }),
    });
    const c = find(out, "bubble_data_api_open");
    expect(c?.status).toBe("PASS");
    // Must still tell the reader the probe was a sample of type names.
    expect(c?.detail).toMatch(/EVERY type|did not guess/);
  });

  it("SKIPS rather than passing when the API is unreachable", async () => {
    // The §35 lesson: "we could not look" must never render as "it is fine".
    const out = await probeBubbleDataApi({ builder: "Bubble", origin }, {
      fetchJson: async () => { throw new Error("network"); },
    });
    const c = find(out, "bubble_data_api_open");
    expect(c?.status).toBe("SKIPPED");
    expect(c?.detail).toContain("not a statement that the");
  });

  it("treats a 200 with zero rows as protected-or-empty, not as an exposure", async () => {
    const out = await probeBubbleDataApi({ builder: "Bubble", origin }, {
      fetchJson: async () => ({ status: 200, body: { response: { results: [] } } }),
    });
    expect(find(out, "bubble_data_api_open")?.status).toBe("PASS");
  });

  it("returns nothing for a non-Bubble app", async () => {
    const out = await probeBubbleDataApi({ builder: "Lovable", origin }, {
      fetchJson: async () => { throw new Error("must not be called"); },
    });
    expect(out).toEqual([]);
  });
});

describe("Bubble version-test probe", () => {
  it("warns when the development copy is publicly reachable", async () => {
    const out = await probeBubbleVersionTest(
      { builder: "Bubble", origin: "https://app.bubbleapps.io" },
      { fetchStatus: async () => 200 },
    );
    expect(find(out, "bubble_version_test_exposed")?.status).toBe("WARN");
  });

  it("passes when it is not reachable", async () => {
    const out = await probeBubbleVersionTest(
      { builder: "Bubble", origin: "https://app.bubbleapps.io" },
      { fetchStatus: async () => 404 },
    );
    expect(find(out, "bubble_version_test_exposed")?.status).toBe("PASS");
  });
});
