// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pulseLiteScan: { findUnique: vi.fn(), updateMany: vi.fn() },
  pulseLead: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  workspace: { findFirst: vi.fn() },
  workspaceMember: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/email", () => ({ sendWorkspaceEmail: vi.fn(async () => ({ ok: true, id: "m" })) }));
vi.mock("@/server/proposals", () => ({ DEFAULT_WORKSPACE_SLUG: "default" }));
const deliverFullReport = vi.hoisted(() => vi.fn(async () => ({ ok: true, scanId: "s" })));
vi.mock("@/server/pulse-lite/report-delivery", () => ({ deliverFullReport }));

import { FULL_REPORTS_PER_DAY, capturePulseLead, notifyLeadOfScanResult } from "@/server/pulse-lite/leads";

beforeEach(() => {
  vi.resetAllMocks();
  db.pulseLead.delete.mockResolvedValue({});
  deliverFullReport.mockResolvedValue({ ok: true, scanId: "s" });
});

describe("two people unlocking one scan at the same moment", () => {
  it("counts only leads that agreed to the terms towards the one-per-email limit", async () => {
    db.pulseLiteScan.findUnique.mockResolvedValueOnce({ id: "lite", targetUrl: "https://a.test", healthScore: 80, emailCaptured: false, leadId: null });
    db.pulseLead.findFirst.mockResolvedValue(null);
    db.pulseLead.create.mockResolvedValue({ id: "lead-1" });
    db.pulseLiteScan.updateMany.mockResolvedValue({ count: 1 });
    await capturePulseLead({ liteScanId: "lite", email: "a@b.test" });
    expect(db.pulseLead.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "a@b.test", termsAcceptedAt: { not: null } } }));
  });

  it("lets only the first claim it, and the second gets the first's lead, not a new paid scan", async () => {
    db.pulseLiteScan.findUnique
      .mockResolvedValueOnce({ id: "lite", targetUrl: "https://a.test", healthScore: 80, emailCaptured: false, leadId: null })
      .mockResolvedValueOnce({ leadId: "lead-first" });
    db.pulseLead.findFirst.mockResolvedValue(null);
    db.pulseLead.create.mockResolvedValue({ id: "lead-second" });
    db.pulseLiteScan.updateMany.mockResolvedValue({ count: 0 }); // someone claimed it in between

    const res = await capturePulseLead({ liteScanId: "lite", email: "second@b.test" });

    expect(res).toEqual({ leadId: "lead-first", created: false });
    expect(db.pulseLead.delete).toHaveBeenCalledWith({ where: { id: "lead-second" } });
  });

  it("claims it when nobody else has", async () => {
    db.pulseLiteScan.findUnique.mockResolvedValueOnce({ id: "lite", targetUrl: "https://a.test", healthScore: 80, emailCaptured: false, leadId: null });
    db.pulseLead.findFirst.mockResolvedValue(null);
    db.pulseLead.create.mockResolvedValue({ id: "lead-1" });
    db.pulseLiteScan.updateMany.mockResolvedValue({ count: 1 });
    expect(await capturePulseLead({ liteScanId: "lite", email: "a@b.test" })).toEqual({ leadId: "lead-1", created: true });
    expect(db.pulseLiteScan.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "lite", emailCaptured: false } }));
  });
});

describe("the daily ceiling on full reports", () => {
  beforeEach(() => {
    db.pulseLead.findUnique.mockResolvedValue({ id: "lead-1", email: "a@b.test", name: "A", targetUrl: "https://a.test", liteScanId: "lite", healthScore: 80, source: "embed", business: "B" });
    db.pulseLiteScan.findUnique.mockResolvedValue({ healthScore: 80 });
    db.pulseLead.update.mockResolvedValue({});
    db.workspace.findFirst.mockResolvedValue(null);
  });

  it("sends the report while under it", async () => {
    db.pulseLead.count.mockResolvedValue(FULL_REPORTS_PER_DAY - 1);
    await notifyLeadOfScanResult("lead-1");
    await vi.waitFor(() => expect(deliverFullReport).toHaveBeenCalledOnce());
  });

  it("runs no scan past it, and records why on the lead", async () => {
    db.pulseLead.count.mockResolvedValue(FULL_REPORTS_PER_DAY);
    await notifyLeadOfScanResult("lead-1");
    await vi.waitFor(() =>
      expect(db.pulseLead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { reportError: expect.stringContaining("Daily limit") },
      }),
    );
    expect(deliverFullReport).not.toHaveBeenCalled();
  });
});
