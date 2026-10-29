/**
 * Two scheduled paths that used to borrow the Gitwork workspace's settings whoever owned the
 * row: Pulse monitor re-scans, and a Care connection's sync. Each must use the workspace that
 * owns the monitor or connection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspaces: {
    a: { id: "a", aiProvider: "ANTHROPIC", anthropicApiKey: "key-a", platformAiKeysAllowed: false },
    b: { id: "b", aiProvider: "ANTHROPIC", anthropicApiKey: "key-b", platformAiKeysAllowed: false },
  } as Record<string, Record<string, unknown>>,
  lastScanWhere: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => db.workspaces[where.id]),
    },
    pulseMonitor: {
      findUnique: vi.fn(async () => ({
        id: "mon-b",
        workspaceId: "b",
        isActive: true,
        projectName: "B site",
        inputType: "URL",
        inputUrl: "https://b.test",
        inputGithubRepo: null,
        clientId: null,
      })),
      update: vi.fn(),
    },
    pulseScan: {
      findFirst: vi.fn(async (args: { where: unknown }) => {
        db.lastScanWhere = args.where;
        return null;
      }),
      findUnique: vi.fn(async () => ({ status: "FAILED", healthScore: null, checks: [] })),
    },
    accountConnection: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "conn-b",
        source: "GMAIL",
        scraperConfig: null,
        channelTokens: [],
        client: { id: "sc-b", name: "B", slug: "b", workspaceId: "b" },
      })),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

const createPulseScanRecord = vi.fn(async () => ({ scan: { id: "scan-1" } }));
const runAnalysis = vi.fn(async () => undefined);
vi.mock("@/server/pulse", () => ({ createPulseScanRecord, runAnalysis }));
vi.mock("@/server/bootstrap", () => ({
  ensureBaseRecords: vi.fn(async () => {
    throw new Error("a scheduled monitor must not fall back to the Gitwork workspace");
  }),
}));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/email", () => ({ sendWorkspaceEmail: vi.fn(), listBackstageApproverEmails: vi.fn(), escapeHtml: (s: string) => s }));
vi.mock("@/server/pulse-agents/monitor-digest", () => ({ MAX_DIGEST_RECIPIENTS: 10, maybeSendWeeklyDigest: vi.fn(), parseDigestEmails: () => [] }));

beforeEach(() => {
  createPulseScanRecord.mockClear();
  runAnalysis.mockClear();
});

describe("triggerMonitorScan", () => {
  it("scans on the monitor's own workspace's AI key and saves the scan there", async () => {
    const { triggerMonitorScan } = await import("@/server/pulse-agents/monitor");
    await triggerMonitorScan("mon-b");

    expect(createPulseScanRecord).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "b" }));
    const aiConfig = (runAnalysis.mock.calls[0] as unknown[])[2] as { apiKey: string };
    expect(aiConfig.apiKey).toBe("key-b");
    // The platform it last ran as is looked up within the same workspace only.
    expect(db.lastScanWhere).toMatchObject({ workspaceId: "b" });
  });
});

describe("buildSyncContext", () => {
  it("uses the settings of the workspace that owns the connection", async () => {
    const { buildSyncContext } = await import("@/server/support-sync");
    const ctx = await buildSyncContext("conn-b");
    expect((ctx as unknown as { workspace: { id: string } }).workspace.id).toBe("b");
  });
});
