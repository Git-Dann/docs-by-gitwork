// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pulseLead: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pulseLiteScan: { updateMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/pulse", () => ({}));

import { deletePulseLead, updatePulseLead } from "@/server/pulse-lite/leads-admin";

const lead = { id: "l1", email: "dan@gitwork.co.uk", name: "Dan", business: "Gitwork", liteScanId: "lite1" };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  db.pulseLead.findUnique.mockResolvedValue(lead);
  db.pulseLead.update.mockResolvedValue({});
});

describe("editing a lead", () => {
  it("saves a corrected name, business and email, cleaned the same way as the form", async () => {
    db.pulseLead.findFirst.mockResolvedValue(null);
    await updatePulseLead("l1", { name: "  Dan  Lindsay ", email: "Dan+Test@Gitwork.co.uk" });
    expect(db.pulseLead.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { name: "Dan Lindsay", business: "Gitwork", email: "dan+test@gitwork.co.uk" },
    });
  });

  it("refuses what the form would refuse", async () => {
    await expect(updatePulseLead("l1", { name: "https://x.example" })).rejects.toMatchObject({ status: 400 });
    await expect(updatePulseLead("l1", { email: "not an email" })).rejects.toMatchObject({ status: 400 });
    expect(db.pulseLead.update).not.toHaveBeenCalled();
  });

  it("refuses an email another lead has already used for its report", async () => {
    db.pulseLead.findFirst.mockResolvedValue({ id: "l2" });
    await expect(updatePulseLead("l1", { email: "taken@example.com" })).rejects.toMatchObject({ status: 409 });
  });

  it("says when the lead doesn't exist", async () => {
    db.pulseLead.findUnique.mockResolvedValue(null);
    await expect(updatePulseLead("nope", { name: "Dan" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleting a lead", () => {
  it("removes it and releases its free scan, so the email can unlock again", async () => {
    await deletePulseLead("l1");
    expect(db.pulseLiteScan.updateMany).toHaveBeenCalledWith({ where: { leadId: "l1" }, data: { emailCaptured: false, leadId: null } });
    expect(db.pulseLead.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });
});
