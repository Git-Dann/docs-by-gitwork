import { describe, expect, it, vi } from "vitest";
import { fetchScannableUrl, pinnedLookupResultForTest } from "../url-guard";
import { redactAuthenticatedText, summariseAuthenticatedPage } from "../../pulse-agents/auth-content";

describe("Pulse outbound target safety", () => {
  it("validates every redirect before following it", async () => {
    const request = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }));

    await expect(fetchScannableUrl("https://93.184.216.34/start", {}, { request }))
      .rejects.toThrow(/can't be scanned|private/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("passes the approved DNS answers to the transport so the fetch cannot re-resolve", async () => {
    const request = vi.fn(async (_url, _init, approvedAddresses: readonly string[]) =>
      new Response(JSON.stringify(approvedAddresses), { status: 200 }),
    );
    const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);

    const response = await fetchScannableUrl("https://example.com", {}, { lookup, request });

    expect(await response.json()).toEqual(["93.184.216.34"]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("returns every approved address when the transport requests all DNS answers", () => {
    expect(pinnedLookupResultForTest([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ], { all: true })).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("blocks IPv6 loopback, mapped and documentation targets", async () => {
    for (const target of ["http://[::1]", "http://[::ffff:7f00:1]", "https://[2001:db8::1]"]) {
      await expect(fetchScannableUrl(target)).rejects.toThrow(/can't be scanned/i);
    }
  });

  it("does not over-block public IPv4 ranges adjacent to TEST-NET", async () => {
    const request = vi.fn(async () => new Response("ok", { status: 200 }));
    await expect(fetchScannableUrl("https://203.0.114.1", {}, { request })).resolves.toBeInstanceOf(Response);
  });
});

describe("authenticated scan data minimisation", () => {
  it("redacts credentials, contact data and payment data before AI use", () => {
    const redacted = redactAuthenticatedText(
      "Jane jane@example.com password=hunter2 Bearer eyJhbGciOiJIUzI1NiJ9.abc.sig card 4242 4242 4242 4242",
    );

    expect(redacted).not.toContain("jane@example.com");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).not.toContain("4242 4242 4242 4242");
    expect(redacted).toContain("[REDACTED_EMAIL]");
  });

  it("never includes raw body text in the authenticated summary", () => {
    const summary = summariseAuthenticatedPage({
      pageTitle: "Account for jane@example.com",
      h1: "Welcome Jane",
      navItems: ["Dashboard", "Billing"],
      authenticatedUrl: "https://example.com/account?token=secret",
    });

    expect(summary).not.toHaveProperty("mainText");
    expect(JSON.stringify(summary)).not.toContain("jane@example.com");
    expect(JSON.stringify(summary)).not.toContain("token=secret");
  });
});
