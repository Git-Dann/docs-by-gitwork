import { describe, it, expect } from "vitest";
import { evaluateBuilderChecks } from "../builder-platforms";
import type { PulseScanCheckInput } from "@/types/pulse";

const find = (checks: PulseScanCheckInput[], key: string) => checks.find((c) => c.checkKey === key);

describe("audit builder-platforms-1: builder_default_deploy_domain", () => {
  it("does not tell the vendor's own www site to attach a custom domain", () => {
    const out = evaluateBuilderChecks({
      builder: "Squarespace",
      hostname: "www.squarespace.com",
      html: '<html><head><title>Website Builder – Easily Create Your Own Website — Squarespace</title><script src="https://static1.squarespace.com/static/vta/x/scripts/site-bundle.js"></script></head></html>',
      bundle: "",
    });
    expect(find(out, "builder_default_deploy_domain")).toBeUndefined();
  });

  it("still warns on a real customer default subdomain", () => {
    for (const [builder, hostname] of [
      ["Squarespace", "jane-doe-x7k2.squarespace.com"],
      ["Wix", "janedoe.wixsite.com"],
      ["Webflow", "acme-studio.webflow.io"],
    ] as const) {
      const out = evaluateBuilderChecks({ builder, hostname, html: "", bundle: "" });
      expect(find(out, "builder_default_deploy_domain")?.status, hostname).toBe("WARN");
    }
  });
});

describe("audit builder-platforms-1: builder_sourcemaps_public", () => {
  const webflowBundle =
    'n||!t||wf_utils.isMobile()||window.location.href!==e||(window.location=e+"dashboard?r=1")}}()}();\n//# sourceMappingURL=webflow-marketing-head-v2.min.js.map';

  it("does not claim an unfetched source map is downloadable", () => {
    const out = evaluateBuilderChecks({ builder: "Webflow", hostname: "webflow.com", html: "", bundle: webflowBundle });
    const c = find(out, "builder_sourcemaps_public");
    expect(c?.confidence).toBe("MEDIUM");
    expect(c?.detail).toMatch(/did not fetch/i);
    expect(c?.detail).not.toMatch(/references a public source map/i);
  });

  it("still reports a source map reference, and stays silent with none", () => {
    const withRef = evaluateBuilderChecks({ builder: "Lovable", hostname: "app.acme.com", html: "", bundle: "0\n//# sourceMappingURL=index-abc123.js.map" });
    expect(find(withRef, "builder_sourcemaps_public")?.status).toBe("WARN");
    expect(find(withRef, "builder_sourcemaps_public")?.evidence).toBe("index-abc123.js.map");
    const without = evaluateBuilderChecks({ builder: "Lovable", hostname: "app.acme.com", html: "", bundle: "const a=1;" });
    expect(find(without, "builder_sourcemaps_public")).toBeUndefined();
  });
});

describe("audit builder-platforms-1: vendor www exclusion is exactly www + two labels", () => {
  it("still warns on a deeper www host under the vendor's generated namespace", () => {
    const out = evaluateBuilderChecks({ builder: "Squarespace", hostname: "www.jane.squarespace.com", html: "", bundle: "" });
    expect(find(out, "builder_default_deploy_domain")?.status).toBe("WARN");
  });
});
