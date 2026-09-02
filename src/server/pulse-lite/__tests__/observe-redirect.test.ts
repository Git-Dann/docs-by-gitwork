import { describe, expect, it, vi } from "vitest";
import { fetchScannableUrl } from "../url-guard";

// ─────────────────────────────────────────────────────────────────────────────
// The guarded transport MUST override `init.redirect` to "manual" — every hop has
// to be re-approved against the SSRF guard — and then it follows the chain itself.
// The consequence was invisible and severe: a caller passing `redirect: "manual"`
// because it wanted to SEE the redirect received the FINAL response instead.
//
// That is exactly what broke `http_redirect`. It probed `http://host` expecting a
// 301 to https, got the followed 200, concluded "no redirect" and WARNed — on every
// correctly-configured site on the internet. Verified outside Pulse with curl:
// stripe.com, github.com and gitwork.co.uk all answer 301 with
// `Location: https://…`, and all three were reported as not redirecting.
// ─────────────────────────────────────────────────────────────────────────────

const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);

/** A host that 301s http -> https, then serves 200. */
function chainedHost() {
  const seen: string[] = [];
  const request = vi.fn(async (url: string) => {
    seen.push(url);
    if (url.startsWith("http://")) {
      return new Response(null, { status: 301, headers: { location: url.replace("http://", "https://") } });
    }
    return new Response("<html>ok</html>", { status: 200 });
  });
  return { request, seen };
}

describe("followRedirects: false lets a caller observe the redirect", () => {
  it("returns the 301 itself, with its Location intact", async () => {
    const { request, seen } = chainedHost();
    const res = await fetchScannableUrl(
      "http://example.com",
      { method: "HEAD", redirect: "manual" },
      { lookup, request },
      { followRedirects: false },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://example.com/");
    // One hop only — it must not have chased the chain.
    expect(seen).toEqual(["http://example.com/"]);
  });

  it("still applies the SSRF guard to the single hop it issues", async () => {
    // A host resolving to a private address must be refused even with following off.
    const privateLookup = vi.fn(async () => [{ address: "127.0.0.1", family: 4 as const }]);
    const { request } = chainedHost();
    await expect(
      fetchScannableUrl("http://internal.example", {}, { lookup: privateLookup, request }, { followRedirects: false }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("the default still follows redirects", () => {
  it("returns the final 200, not the 301", async () => {
    const { request, seen } = chainedHost();
    const res = await fetchScannableUrl("http://example.com", {}, { lookup, request });
    expect(res.status).toBe(200);
    // Proves the default behaviour every other caller relies on is unchanged.
    expect(seen).toHaveLength(2);
  });

  it("is unchanged when followRedirects is explicitly true", async () => {
    const { request } = chainedHost();
    const res = await fetchScannableUrl("http://example.com", {}, { lookup, request }, { followRedirects: true });
    expect(res.status).toBe(200);
  });
});
