import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { anthropicBilledSince, centsToUsd } = await import("../ai-cost");

function reply(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 401, statusText: ok ? "OK" : "Unauthorized", json: () => Promise.resolve(body) });
}

describe("Anthropic billed spend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads Anthropic's amounts as cents, not dollars", () => {
    expect(centsToUsd("123.45")).toBeCloseTo(1.2345);
    expect(centsToUsd("41280.000000")).toBe(412.8);
    expect(centsToUsd(undefined)).toBe(0);
  });

  it("sums every day and every page from the period start to the last UTC midnight", async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(reply({ data: [{ results: [{ amount: "1500" }, { amount: "250" }] }], has_more: true, next_page: "p2" }))
      .mockReturnValueOnce(reply({ data: [{ results: [{ amount: "250" }] }], has_more: false }));
    vi.stubGlobal("fetch", fetchMock);

    const now = new Date("2026-11-25T14:30:00Z");
    const out = await anthropicBilledSince("sk-ant-admin-x", new Date("2026-11-01T00:00:00Z"), now);

    expect(out).toEqual({ usd: 20, through: new Date("2026-11-25T00:00:00Z") });
    const first = new URL(fetchMock.mock.calls[0][0] as string);
    expect(first.pathname).toBe("/v1/organizations/cost_report");
    expect(first.searchParams.get("starting_at")).toBe("2026-11-01T00:00:00.000Z");
    expect(first.searchParams.get("ending_at")).toBe("2026-11-25T00:00:00.000Z");
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("page")).toBe("p2");
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers["x-api-key"]).toBe("sk-ant-admin-x");
  });

  it("returns null when Anthropic refuses, so the budget falls back to Foundry's estimate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(reply({}, false)));
    expect(await anthropicBilledSince("bad", new Date("2026-11-01T00:00:00Z"), new Date("2026-11-25T10:00:00Z"))).toBeNull();
  });

  it("asks nothing on the first day of a period: nothing is billed yet", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await anthropicBilledSince("k", new Date("2026-11-25T00:00:00Z"), new Date("2026-11-25T10:00:00Z"));
    expect(out).toEqual({ usd: 0, through: new Date("2026-11-25T00:00:00Z") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
