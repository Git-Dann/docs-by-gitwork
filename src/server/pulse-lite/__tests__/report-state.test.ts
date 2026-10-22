// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/pulse", () => ({}));
import { REPORT_TRACKING_SINCE, reportState } from "@/server/pulse-lite/leads-admin";

const after = (min: number) => new Date(REPORT_TRACKING_SINCE.getTime() + min * 60_000);
const base = { reportSentAt: null, reportError: null, scanStatus: "COMPLETED" as string | null };

describe("the report status on the leads list", () => {
  it("never calls a lead from before tracking 'not sent': there is simply no record", () => {
    const r = reportState({ ...base, termsAcceptedAt: new Date("2026-10-22T13:52:43Z") }, after(600).getTime());
    expect(r.state).toBe("untracked");
  });

  it("says sent, with when, once it went", () => {
    expect(reportState({ ...base, termsAcceptedAt: after(1), reportSentAt: after(5) }).state).toBe("sent");
  });

  it("is preparing for half an hour after a tracked unlock, then not sent", () => {
    expect(reportState({ ...base, termsAcceptedAt: after(1) }, after(10).getTime()).state).toBe("preparing");
    expect(reportState({ ...base, termsAcceptedAt: after(1) }, after(45).getTime()).state).toBe("failed");
  });

  it("says why when the send or the scan failed", () => {
    expect(reportState({ ...base, termsAcceptedAt: after(1), reportError: "535 bad login" })).toMatchObject({ state: "failed", error: "535 bad login" });
    expect(reportState({ ...base, termsAcceptedAt: after(1), scanStatus: "FAILED" }).state).toBe("failed");
  });

  it("shows nothing requested for a lead that never used the unlock form", () => {
    expect(reportState({ ...base, termsAcceptedAt: null }).state).toBe("none");
  });
});
