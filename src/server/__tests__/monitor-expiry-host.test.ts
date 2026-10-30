import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
import { monitorDomain, monitorHost } from "../wiki-monitor-expiry";

describe("which host and domain a monitor watches", () => {
  it("reads HTTP, TCP and skips heartbeats", () => {
    expect(monitorHost("HTTP", "https://apiv1.bigwedgegolf.com/health/")).toBe("apiv1.bigwedgegolf.com");
    expect(monitorHost("TCP", "db.example.com:5432")).toBe("db.example.com");
    expect(monitorHost("HEARTBEAT", "https://foundry.gitwork.co.uk/api/public/heartbeat/x")).toBeNull();
    expect(monitorHost("HTTP", "not a url")).toBeNull();
  });
  it("finds the registrable domain, including second-level suffixes", () => {
    expect(monitorDomain("HTTP", "https://foundry.gitwork.co.uk/api/health")).toBe("gitwork.co.uk");
    expect(monitorDomain("HTTP", "https://app.afterdesk.ai")).toBe("afterdesk.ai");
  });
  it("has no domain to renew on a shared platform host", () => {
    expect(monitorDomain("HTTP", "https://kernel-frontend-alpha.vercel.app")).toBeNull();
  });
});
