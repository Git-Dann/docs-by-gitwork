/**
 * Portal → Deleted. Rendered through the real component with its hooks mocked at the edge.
 *
 * What it pins: deleted clients are listed and can be restored; only a Super Admin is offered a
 * permanent delete; and the permanent delete cannot be confirmed until the client's name is typed
 * back — the guard against purging the wrong row out of a list.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const restoreMutate = vi.fn();
const purgeMutateAsync = vi.fn().mockResolvedValue({ purged: true });

vi.mock("@/hooks/use-proposals", () => ({
  useDeletedClients: () => ({
    isPending: false,
    error: null,
    data: [
      { id: "c1", name: "Acme Ltd", slug: "acme-ltd", logoUrl: null, deletedAt: "2026-10-10T09:00:00.000Z" },
      { id: "c2", name: "Valu", slug: "valu", logoUrl: null, deletedAt: "2026-10-12T09:00:00.000Z" },
    ],
  }),
  useRestoreClient: () => ({ mutate: restoreMutate, isPending: false }),
  usePurgeClient: () => ({ mutateAsync: purgeMutateAsync, isPending: false }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

let root: Root | null = null;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

async function mount(canPurge: boolean) {
  const { DeletedClientsList } = await import("@/components/clients/deleted-clients");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<DeletedClientsList search="" canPurge={canPurge} />));
}

const buttons = (label: string) =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label);

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Deleted clients", () => {
  it("lists every deleted client with a Restore button that restores that client", async () => {
    await mount(false);
    expect(host.textContent).toContain("Acme Ltd");
    expect(host.textContent).toContain("Valu");
    const restore = buttons("Restore");
    expect(restore).toHaveLength(2);
    act(() => restore[1].click());
    expect(restoreMutate).toHaveBeenCalledWith("valu", expect.anything());
  });

  it("offers permanent delete only to a Super Admin", async () => {
    await mount(false);
    expect(buttons("Delete permanently")).toHaveLength(0);
    expect(host.textContent).toContain("Only a Super Admin");
    act(() => root!.unmount());
    root = null;
    document.body.innerHTML = "";
    await mount(true);
    expect(buttons("Delete permanently")).toHaveLength(2);
  });

  it("won't confirm a permanent delete until the client's name is typed back", async () => {
    await mount(true);
    act(() => buttons("Delete permanently")[0].click());

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("can't be undone");
    const confirm = () => [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Delete permanently")!;
    const input = dialog.querySelector("input") as HTMLInputElement;

    expect(confirm().disabled).toBe(true);
    type(input, "Acme");
    expect(confirm().disabled).toBe(true);
    type(input, "acme ltd"); // case-insensitive: the name, not its capitalisation
    expect(confirm().disabled).toBe(false);

    await act(async () => confirm().click());
    expect(purgeMutateAsync).toHaveBeenCalledWith({ slug: "acme-ltd", confirmName: "acme ltd" });
  });
});
