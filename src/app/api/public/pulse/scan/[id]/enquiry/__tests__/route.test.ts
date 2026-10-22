// @vitest-environment node
/**
 * The unlock endpoint. Harry tested the live widget and no report email arrived: the
 * enquiry route captured the lead and never sent anything. These pin that it now
 * does, once, and only for a complete submission.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const afterCalls: Array<() => unknown> = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => { afterCalls.push(fn); },
}));

let scanStatus = "COMPLETED";
vi.mock("@/lib/prisma", () => ({
  prisma: { pulseLiteScan: { findUnique: vi.fn(async () => ({ status: scanStatus })) } },
}));

const capture = vi.fn();
const notify = vi.fn(async () => {});
vi.mock("@/server/pulse-lite/leads", () => ({
  capturePulseLead: (...a: unknown[]) => capture(...a),
  notifyLeadOfScanResult: (...a: unknown[]) => notify(...(a as [])),
}));
vi.mock("@/server/pulse-embed-workspace", () => ({
  getPulseEmbedWorkspaceConfig: vi.fn(async () => ({ enabled: true, turnstileSecretKey: null })),
}));
vi.mock("@/server/pulse-lite/turnstile", () => ({ assertValidTurnstileToken: vi.fn(async () => {}) }));

const body = { name: "Sam", business: "Acme", email: "sam@acme.test", termsAccepted: true };
const post = async (b: unknown) => {
  const { POST } = await import("@/app/api/public/pulse/scan/[id]/enquiry/route");
  const req = new Request("https://x.test/api/public/pulse/scan/s1/enquiry", { method: "POST", body: JSON.stringify(b) });
  return POST(req as never, { params: Promise.resolve({ id: "s1" }) });
};

beforeEach(() => {
  afterCalls.length = 0;
  scanStatus = "COMPLETED";
  capture.mockReset();
  notify.mockClear();
  capture.mockResolvedValue({ leadId: "l1", created: true });
});

describe("unlocking a report", () => {
  it("lets through a visitor whose browser autofilled the hidden field with their company", async () => {
    // What happened to Harry: Chrome filled the honeypot with "Gitwork Group Ltd".
    const res = await post({ ...body, business: "Gitwork Group Ltd", honeypot: "Gitwork Group Ltd" });
    expect(res.status).toBe(201);
    expect(capture).toHaveBeenCalled();
  });

  it("still refuses a bot that fills the hidden field with something of its own", async () => {
    const res = await post({ ...body, honeypot: "http://spam.example" });
    expect(res.status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
  });

  it("refuses a submission without the terms agreed, and records nothing", async () => {
    const res = await post({ ...body, termsAccepted: false });
    expect(res.status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
  });

  it("records name, business, email and when the terms were agreed", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      liteScanId: "s1", name: "Sam", business: "Acme", email: "sam@acme.test", termsAcceptedAt: expect.any(Date),
    }));
  });

  it("emails the report once the scan has finished", async () => {
    await post(body);
    for (const fn of afterCalls) await fn();
    expect(notify).toHaveBeenCalledWith("l1");
  });

  it("leaves the email to the scan runner while the scan is still going", async () => {
    scanStatus = "RUNNING";
    await post(body);
    for (const fn of afterCalls) await fn();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not email twice when the same submission is retried", async () => {
    capture.mockResolvedValue({ leadId: "l1", created: false });
    await post(body);
    for (const fn of afterCalls) await fn();
    expect(notify).not.toHaveBeenCalled();
  });
});
