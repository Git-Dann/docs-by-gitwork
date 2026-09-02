import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Every doc-keyword regex in api-quality.ts was once written `a.*b`. Minified HTML
// is ONE line and `.` matches everything except a newline, so `.*` spanned the whole
// document: `a.*b` asked "does `a` appear anywhere, and `b` anywhere after it?" —
// which for common words is true of almost any page. The checks then reported PASS
// having established nothing.
//
// Proven against Foundry's own login page, which contains no API documentation:
//   api_sandbox_test_mode  matched `test.*mode`  via minified JS `.test(p)` … `mode`
//   api_sdk_packages       matched `go.*get`     via the `go` inside `"logo"`
//
// This test reads the real module source, so it fails if anyone reintroduces an
// unbounded `.*` between two keywords — the fix cannot silently regress.
// ─────────────────────────────────────────────────────────────────────────────

const source = readFileSync("src/server/pulse-checks/api-quality.ts", "utf8");

/** The regexes the module builds for HTML keyword sniffing. */
function builtPatterns(): string[] {
  return [...source.matchAll(/new RegExp\(`([^`]+)`, "i"\)/g)].map((m) => m[1]);
}

function near(a: string, b: string): string {
  return `${a}[\\s\\-_/]{0,3}${b}`;
}

/** Resolve the `${near(...)}` template calls the way the module does at runtime. */
function resolve(pattern: string): string {
  return pattern
    .replace(/\$\{near\("([^"]*)", "([^"]*)"(?:, (\d+))?\)\}/g, (_m, a, b) => near(a, b))
    // The source is a TS template literal, so `\\d` there is `\d` at runtime.
    .replace(/\\\\/g, "\\");
}

describe("api-quality keyword regexes are proximity-bounded", () => {
  it("builds at least a dozen keyword patterns (guards against the extractor silently matching nothing)", () => {
    expect(builtPatterns().length).toBeGreaterThanOrEqual(12);
  });

  it("contains no unbounded `.*` between keywords", () => {
    const offenders = builtPatterns().filter((p) => resolve(p).includes(".*"));
    expect(offenders).toEqual([]);
  });

  it("uses a phrase separator, not an arbitrary character bound", () => {
    // `.{0,8}` was tried first and was not enough: `.test(p),mode` puts only four
    // characters between the halves, so minified JS still matched.
    const offenders = builtPatterns().filter((p) => /\.\{0,\d+\}/.test(resolve(p)));
    expect(offenders).toEqual([]);
  });

  it("does not reintroduce the two alternations that matched ordinary prose", () => {
    // `has.*more` matched "has access to more than one"; `go.*get` matched "logo".
    // Even bounded these are too generic to mean anything, so they were deleted.
    expect(source).not.toMatch(/near\("has", "more"/);
    expect(source).not.toMatch(/near\("go", "get"/);
  });

  it("reports nothing on a page with no API documentation", () => {
    // A realistic minified login page: contains `.test(`, `"logo"`, the words
    // "has"/"more"/"get"/"mode" — every ingredient of the old false passes.
    const loginish =
      `<!DOCTYPE html><html><head><title>Welcome back</title>` +
      `<script>var f=/^\\/edge/.test(p),mode="dark";function get(k){return k}</script>` +
      `<script type="application/ld+json">{"logo":"https://x/icon.png","name":"Acme"}</script>` +
      `</head><body><main><h1>Welcome back</h1>` +
      `<p>Your account has access to more than one workspace.</p>` +
      `<form><input type="password"/><button>Sign in</button></form>` +
      `</main></body></html>`;

    const matched = builtPatterns().filter((p) => new RegExp(resolve(p), "i").test(loginish));
    expect(matched).toEqual([]);
  });

  it("still matches genuine API documentation prose", () => {
    // The bound must not be so tight that a real docs page stops matching.
    const docs =
      `<h2>Rate limits</h2><p>The API allows 120 requests per minute.</p>` +
      `<h2>Pagination</h2><p>Use the next cursor to page through results.</p>` +
      `<h2>Errors</h2><p>Errors use RFC 7807 problem details.</p>` +
      `<h2>Sandbox</h2><p>Use a sandbox key in test mode.</p>` +
      `<h2>SDKs</h2><p>Install the client library: npm install acme.</p>` +
      `<h2>Webhooks</h2><p>Verify the webhook signature.</p>`;

    const matched = builtPatterns().filter((p) => new RegExp(resolve(p), "i").test(docs));
    // Rate limits, pagination, RFC 7807, sandbox, SDK and webhooks are all present.
    expect(matched.length).toBeGreaterThanOrEqual(6);
  });
});

describe("a check whose detail says 'not applicable' must not earn score weight", () => {
  it("emits SKIPPED, not PASS, when no GraphQL is detected", () => {
    // PASS earns weight on both sides of the score ratio, so returning PASS for an
    // inapplicable check handed every non-GraphQL site a free point — and inflated
    // the medians in getIndustryBenchmarks that later scans are compared against.
    const line = source.split("\n").find((l) => l.includes('checkKey: "graphql_depth_limiting"'));
    expect(line).toBeDefined();
    expect(line).toContain('"SKIPPED"');
    expect(line).not.toMatch(/hasGraphql \? \([^)]*\) : "PASS"/);
  });
});
