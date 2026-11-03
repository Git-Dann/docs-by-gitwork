// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pulseScan: { findUnique: vi.fn(), update: vi.fn() },
  pulseLiteScan: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const createPulseScanRecord = vi.fn();
const runAnalysis = vi.fn();
vi.mock("@/server/pulse", () => ({
  createPulseScanRecord: (...a: unknown[]) => createPulseScanRecord(...a),
  runAnalysis: (...a: unknown[]) => runAnalysis(...a),
  pulseInclude: {},
  serializePulseScan: (r: unknown) => r,
}));

const sendWorkspaceEmail = vi.fn();
vi.mock("@/server/email", () => ({ sendWorkspaceEmail: (...a: unknown[]) => sendWorkspaceEmail(...a) }));
vi.mock("@/server/pulse-embed-workspace", () => ({
  getPulseEmbedWorkspaceConfig: async () => ({ bookingUrl: "https://gitwork.co.uk/audit", freeCheckKeys: null }),
}));

import { deliverFullReport } from "@/server/pulse-lite/report-delivery";

const check = (checkKey: string, status: string) => ({
  checkKey, category: "Security", label: checkKey, status, detail: `${checkKey} detail`, severity: "HIGH", confidence: "HIGH",
});

function fullScan(over: Record<string, unknown> = {}) {
  return {
    id: "scan1", workspaceId: "ws1", status: "COMPLETED", errorMessage: null, healthScore: 81,
    isShared: false, shareToken: null,
    checks: [check("csp_header", "FAIL"), check("hsts_header", "PASS")],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createPulseScanRecord.mockResolvedValue({ scan: { id: "scan1" }, aiConfig: { provider: "ANTHROPIC" } });
  runAnalysis.mockResolvedValue(undefined);
  db.pulseLiteScan.findUnique.mockResolvedValue({ importedScanId: null });
  db.pulseLiteScan.update.mockResolvedValue({});
  db.pulseScan.update.mockResolvedValue({});
  sendWorkspaceEmail.mockResolvedValue({ ok: true, id: "m1" });
});

describe("delivering the full report after an unlock", () => {
  it("runs the full scan, shares it, and emails one link to the report as a PDF", async () => {
    db.pulseScan.findUnique.mockResolvedValue(fullScan());
    const res = await deliverFullReport({ to: "sam@acme.test", name: "Sam", targetUrl: "https://acme.test/", liteScanId: "lite1" });

    expect(res).toEqual({ ok: true, scanId: "scan1" });
    expect(runAnalysis).toHaveBeenCalledWith("scan1", expect.objectContaining({ inputType: "URL", inputUrl: "https://acme.test/" }), expect.anything());
    expect(db.pulseLiteScan.update).toHaveBeenCalledWith({ where: { id: "lite1" }, data: { importedScanId: "scan1" } });
    const shared = db.pulseScan.update.mock.calls[0][0];
    expect(shared.data.isShared).toBe(true);
    const token = shared.data.shareToken as string;
    expect(token).toMatch(/^[a-f0-9]{32}$/);

    const mail = sendWorkspaceEmail.mock.calls[0][0];
    expect(mail.to).toEqual(["sam@acme.test"]);
    expect(mail.workspaceId).toBe("ws1");
    expect(mail.attachments).toBeUndefined();
    expect(mail.html).toContain(`/api/public/pulse/report/${token}/pdf`);
    // The email's number is the one on the PDF cover.
    expect(mail.html).toContain(">81<");
  });

  it("reuses the full scan already run for this free scan instead of paying for another", async () => {
    db.pulseLiteScan.findUnique.mockResolvedValue({ importedScanId: "scan9" });
    db.pulseScan.findUnique
      .mockResolvedValueOnce({ status: "COMPLETED" })
      .mockResolvedValueOnce(fullScan({ id: "scan9", isShared: true, shareToken: "a".repeat(32) }));
    const res = await deliverFullReport({ to: "sam@acme.test", name: null, targetUrl: "https://acme.test/", liteScanId: "lite1" });

    expect(res).toEqual({ ok: true, scanId: "scan9" });
    expect(createPulseScanRecord).not.toHaveBeenCalled();
    expect(db.pulseScan.update).not.toHaveBeenCalled();
    expect(sendWorkspaceEmail.mock.calls[0][0].html).toContain(`/api/public/pulse/report/${"a".repeat(32)}/pdf`);
  });

  it("sends nothing, and says why, when the full scan fails", async () => {
    db.pulseScan.findUnique.mockResolvedValue(fullScan({ status: "FAILED", errorMessage: "site unreachable" }));
    const res = await deliverFullReport({ to: "sam@acme.test", name: "Sam", targetUrl: "https://acme.test/" });

    expect(res).toEqual({ ok: false, error: expect.stringContaining("site unreachable") });
    expect(sendWorkspaceEmail).not.toHaveBeenCalled();
    expect(db.pulseScan.update).not.toHaveBeenCalled();
  });

  it("passes on a send failure rather than reporting success", async () => {
    db.pulseScan.findUnique.mockResolvedValue(fullScan());
    sendWorkspaceEmail.mockResolvedValue({ ok: false, error: "535 Username and Password not accepted" });
    const res = await deliverFullReport({ to: "sam@acme.test", name: "Sam", targetUrl: "https://acme.test/" });
    expect(res).toEqual({ ok: false, error: expect.stringContaining("535") });
  });
});
