import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/wiki-monitors/http", () => ({ probeHttp: vi.fn(async () => ({ status: "UP", latencyMs: 5, statusCode: 200, error: null })) }));
vi.mock("@/server/wiki-monitors/tcp", () => ({ probeTcp: vi.fn() }));
vi.mock("@/server/stored-secret", () => ({ readSecret: (v: string | null) => v }));

const body = JSON.stringify({
  type: "HTTP", target: "https://example.com", method: "GET", expectedStatus: null,
  keyword: null, degradedMs: null, headers: {}, body: null,
});
const req = (auth?: string) =>
  new Request("http://x/api/monitor-probe", { method: "POST", body, headers: auth ? { authorization: auth } : {} });

describe("second-location probe route", () => {
  afterEach(() => {
    delete process.env.MONITOR_PROBE_SECRET;
  });
  it("doesn't exist without the secret configured", async () => {
    const { POST } = await import("@/app/api/monitor-probe/route");
    const res = await POST(req("Bearer anything") as never);
    expect(res.status).toBe(404);
  });
  it("refuses a wrong secret", async () => {
    process.env.MONITOR_PROBE_SECRET = "s3cret-value";
    const { POST } = await import("@/app/api/monitor-probe/route");
    expect((await POST(req("Bearer nope") as never)).status).toBe(404);
    expect((await POST(req() as never)).status).toBe(404);
  });
  it("runs the check with the right secret and says where from", async () => {
    process.env.MONITOR_PROBE_SECRET = "s3cret-value";
    process.env.MONITOR_PROBE_LOCATION = "Test region";
    const { POST } = await import("@/app/api/monitor-probe/route");
    const res = await POST(req("Bearer s3cret-value") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data ?? json).toMatchObject({ status: "UP", location: "Test region" });
    delete process.env.MONITOR_PROBE_LOCATION;
  });
});
