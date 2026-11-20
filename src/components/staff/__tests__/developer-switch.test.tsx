// @vitest-environment jsdom
/**
 * The two places a person is made a developer by hand: the Developer switch on their Staff
 * details, and a developer filling in their own GitHub handle and stack in Backstage → Me.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffPerson } from "@/lib/staff";
import type { OwnDeveloperDetails } from "@/lib/developer-self-details";

const calls = vi.hoisted(() => ({
  update: [] as unknown[],
  create: [] as unknown[],
  saveOwn: [] as unknown[],
  own: null as OwnDeveloperDetails | null,
}));

vi.mock("@/hooks/use-staff", () => ({
  useCreateStaffRecord: () => ({ mutateAsync: async (v: unknown) => void calls.create.push(v), isPending: false }),
  useUpdateStaffDetails: () => ({ mutateAsync: async (v: unknown) => void calls.update.push(v), isPending: false }),
  useOwnDeveloperDetails: () => ({ data: calls.own }),
  useUpdateOwnDeveloperDetails: () => ({
    mutateAsync: async (v: Record<string, unknown>) => {
      calls.saveOwn.push(v);
      return { ...calls.own!, githubHandle: String(v.githubHandle ?? calls.own!.githubHandle), primaryStack: String(v.primaryStack ?? "") };
    },
    isPending: false,
  }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));

import { DetailsDialog } from "../staff-roster";
import { MyDeveloperCard } from "../my-developer-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  calls.update = [];
  calls.create = [];
  calls.saveOwn = [];
  calls.own = null;
});
afterEach(() => {
  document.body.innerHTML = "";
});

const person = (over: Partial<StaffPerson> = {}): StaffPerson => ({
  key: "r:1", memberId: "m1", recordId: "r1", name: "Abdullah Farooq", preferredName: null, pronouns: null,
  email: "abdullahfarooq@gitwork.co.uk", avatarUrl: null, role: "DEVELOPER", jobTitle: null, department: null,
  employmentType: null, startDate: null, managerRecordId: null, managerName: null, isDeveloper: false,
  hasGithubHandle: false, primaryStack: null, currentClients: [], archivedAt: null, ...over,
});

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => createRoot(host).render(node));
}
const click = (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const developerBox = () =>
  [...document.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Developer"))?.querySelector("input") as HTMLInputElement;

describe("Developer switch on Staff details", () => {
  it("saves the choice with the rest of the details", async () => {
    await render(<DetailsDialog inline person={person()} people={[]} onClose={() => {}} />);
    expect(developerBox().checked).toBe(false);
    await click(developerBox());
    await click(button("Save"));
    expect(calls.update).toEqual([{ recordId: "r1", update: expect.objectContaining({ isDeveloper: true }) }]);
  });

  it("is on and locked for someone with a GitHub handle, and says why", async () => {
    await render(<DetailsDialog inline person={person({ isDeveloper: true, hasGithubHandle: true })} people={[]} onClose={() => {}} />);
    expect(developerBox().checked).toBe(true);
    expect(developerBox().disabled).toBe(true);
    expect(document.body.textContent).toContain("because they have a GitHub handle");
  });

  it("can remove a GitHub handle that's someone else's, then be switched off", async () => {
    await render(<DetailsDialog inline person={person({ isDeveloper: true, hasGithubHandle: true })} people={[]} onClose={() => {}} />);
    await click(button("Wrong GitHub account? Remove the handle"));
    expect(developerBox().disabled).toBe(false);
    expect(developerBox().checked).toBe(false);
    await click(button("Save"));
    expect(calls.update).toEqual([{ recordId: "r1", update: expect.objectContaining({ isDeveloper: false, removeGithubHandle: true }) }]);
  });

  it("never sends removeGithubHandle unless asked", async () => {
    await render(<DetailsDialog inline person={person({ isDeveloper: true, hasGithubHandle: true })} people={[]} onClose={() => {}} />);
    await click(button("Save"));
    expect((calls.update[0] as { update: object }).update).not.toHaveProperty("removeGithubHandle");
  });
});

describe("MyDeveloperCard (Backstage → Me)", () => {
  const own = (over: Partial<OwnDeveloperDetails> = {}): OwnDeveloperDetails => ({
    recordId: "r1", isDeveloper: true, githubHandle: null, primaryStack: null, techStacks: [],
    location: null, timezone: null, linkedinUrl: null, portfolioUrl: null, ...over,
  });

  it("isn't shown to someone who isn't a developer", async () => {
    calls.own = own({ isDeveloper: false });
    await render(<MyDeveloperCard number="02" />);
    expect(document.body.textContent).toBe("");
  });

  it("opens on the form, saying what's missing, and saves a pasted GitHub address as a username", async () => {
    calls.own = own();
    await render(<MyDeveloperCard number="02" />);
    expect(document.body.textContent).toContain("Add your GitHub handle and main stack");
    const handle = [...document.querySelectorAll("label")].find((l) => l.textContent?.startsWith("GitHub username"))!.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(handle, "https://github.com/abdullah-f");
      handle.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      handle.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(handle.value).toBe("abdullah-f");
    await click(button("Save"));
    expect(calls.saveOwn[0]).toMatchObject({ githubHandle: "abdullah-f" });
  });

  it("reads back as a summary when nothing's missing", async () => {
    calls.own = own({ githubHandle: "abdullah-f", primaryStack: "Flutter" });
    await render(<MyDeveloperCard number="02" />);
    expect(document.body.textContent).toContain("@abdullah-f");
    expect(document.querySelector("form")).toBeNull();
  });
});
