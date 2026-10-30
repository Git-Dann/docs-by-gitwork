// @vitest-environment jsdom
/**
 * Approving a release has to be obvious, on the client's page as much as the team's: the
 * pending status IS the button, a callout at the top lists what's waiting, and once approved
 * it says who approved it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangelogEntryRecord } from "@/lib/api";
import { ChangelogSection } from "../changelog-section";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.innerHTML = "";
});

const entry = (id: string, platform: string, version: string, status: string, extra: Partial<ChangelogEntryRecord> = {}): ChangelogEntryRecord => ({
  id, platform, version, title: version === "2.0.3" ? "Wedge+ Is Here" : "Earlier", body: "- Notes", releasedAt: null,
  createdAt: version === "2.0.3" ? "2026-10-30T09:00:00.000Z" : "2026-10-01T09:00:00.000Z", status,
  approvedAt: null, approvedByName: null, ...extra,
});

const entries = [
  entry("ios", "IOS", "2.0.3", "PENDING"),
  entry("and", "ANDROID", "2.0.3", "PENDING"),
  entry("old", "IOS", "2.0.2", "APPROVED", { approvedAt: "2026-10-02T09:00:00.000Z", approvedByName: "Luke McFarland" }),
];

async function mount(props: Partial<React.ComponentProps<typeof ChangelogSection>> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const onToggleStatus = props.onToggleStatus ?? vi.fn(async () => undefined);
  await act(async () =>
    createRoot(host).render(
      <ChangelogSection entries={entries} onDelete={async () => undefined} onToggleStatus={onToggleStatus} {...props} />,
    ),
  );
  return { host, onToggleStatus };
}

const buttons = (host: HTMLElement, name: string) => [...host.querySelectorAll("button")].filter((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").includes(name));

describe("the client's page", () => {
  it("asks for their approval at the top, and the pending status is the button", async () => {
    const { host } = await mount({ readOnly: true, canApprove: true, audience: "client" });
    expect(host.querySelector('[aria-label="Releases waiting for approval"]')?.textContent).toContain("1 release is waiting for your approval");
    expect(buttons(host, "Approve v2.0.3").length).toBe(2); // the callout and the status chip
    // Still read-only otherwise: no edit, no menu.
    expect(buttons(host, "Edit")).toHaveLength(0);
    expect(host.querySelector('[aria-label^="More actions"]')).toBeNull();
  });

  it("approves every platform of the version in one click", async () => {
    const { host, onToggleStatus } = await mount({ readOnly: true, canApprove: true, audience: "client" });
    await act(async () => buttons(host, "Approve v2.0.3")[0].click());
    expect(onToggleStatus).toHaveBeenCalledWith(["ios", "and"], "APPROVED");
  });

  it("says why it didn't work, where it was clicked", async () => {
    const failing = vi.fn(async () => {
      throw new Error("Please sign in to your portal to approve releases.");
    });
    const { host } = await mount({ readOnly: true, canApprove: true, audience: "client", onToggleStatus: failing });
    await act(async () => buttons(host, "Approve v2.0.3")[1].click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Please sign in");
  });

  it("a filter can't hide what's waiting: the callout stays on the Approved tab", async () => {
    const { host } = await mount({ readOnly: true, canApprove: true, audience: "client" });
    const approvedTab = [...host.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.startsWith("Approved")) as HTMLElement;
    await act(async () => approvedTab.click());
    expect(host.querySelector('[aria-label="Releases waiting for approval"]')?.textContent).toContain("v2.0.3");
  });

  it("names who approved an approved release", async () => {
    const { host } = await mount({ readOnly: true, canApprove: true, audience: "client" });
    expect(host.textContent).toContain("Approved by Luke McFarland");
  });

  it("a read-only view that can't approve shows a plain pending label, no buttons", async () => {
    const { host } = await mount({ readOnly: true, canApprove: false });
    expect(buttons(host, "Approve v")).toHaveLength(0); // ("Approved" is a filter tab)
    expect(host.querySelector('[aria-label="Releases waiting for approval"]')).toBeNull();
    expect(host.textContent).toContain("Pending");
  });
});

describe("the team's page", () => {
  it("approves by default and doesn't say 'your'", async () => {
    const { host } = await mount();
    expect(host.textContent).toContain("1 release is waiting for approval");
    expect(host.textContent).not.toContain("your approval");
    expect(buttons(host, "Approve v2.0.3").length).toBe(2);
  });
});
