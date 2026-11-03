// @vitest-environment jsdom
/**
 * The Monitors page's Add monitor popup: choose a client, fill in the same fields as the wiki,
 * and it saves to that client's wiki (the one route both use), so it shows in both places.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
vi.mock("@/hooks/use-wiki", () => ({
  useCreateMonitorForClient: () => ({ mutateAsync, isPending: false }),
}));

import { AddMonitorDialog, orderAddMonitorClients, type AddMonitorClient } from "../add-monitor-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => mutateAsync.mockReset().mockResolvedValue({}));
afterEach(() => {
  document.body.innerHTML = "";
});

const clients: AddMonitorClient[] = [
  { clientId: "c-n", slug: "northwind", name: "Northwind Studio", monitorCount: 2 },
  { clientId: "c-k", slug: "kestrel", name: "Kestrel", monitorCount: 0 },
  { clientId: "c-g", slug: "gitwork", name: "Gitwork", monitorCount: 3 },
  // Sorts before Gitwork by name, so "Gitwork first" is something the order has to do.
  { clientId: "c-a", slug: "acme", name: "Acme", monitorCount: 1 },
];

async function mount(props: Partial<React.ComponentProps<typeof AddMonitorDialog>> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const onClose = vi.fn();
  await act(async () => createRoot(host).render(<AddMonitorDialog open onClose={onClose} clients={clients} {...props} />));
  return { onClose };
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
const clientSelect = () => dialog().querySelector("select") as HTMLSelectElement;
const field = (placeholder: string) => dialog().querySelector(`input[placeholder^="${placeholder}"]`) as HTMLInputElement;
const submit = () => [...dialog().querySelectorAll("button")].find((b) => b.textContent === "Add monitor") as HTMLButtonElement;

describe("AddMonitorDialog", () => {
  it("lists the clients this person can open, Gitwork first, with what each already has", async () => {
    await mount();
    const options = [...clientSelect().options].map((o) => o.textContent);
    expect(options).toEqual(["Choose a client…", "Gitwork · 3 monitors", "Acme · 1 monitor", "Kestrel", "Northwind Studio · 2 monitors"]);
  });

  it("is the house fixed-height popup, with the fields scrolling inside it", async () => {
    await mount();
    expect(dialog().className).toContain("app-dialog-fixed");
    expect(dialog().querySelector(".overflow-y-auto.min-h-0")).not.toBeNull();
  });

  it("won't save without a client, and says so", async () => {
    await mount();
    await act(async () => setValue(field("Website, API"), "Website"));
    await act(async () => submit().click());
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("Choose the client this monitor is for.");
  });

  it("saves to the chosen client's wiki and closes", async () => {
    const { onClose } = await mount();
    await act(async () => setValue(clientSelect(), "c-k"));
    await act(async () => setValue(field("Website, API"), "Website"));
    await act(async () => setValue(field("https://api.example.com"), "https://kestrel.co/"));
    await act(async () => submit().click());
    expect(mutateAsync).toHaveBeenCalledWith({
      slug: "kestrel",
      input: expect.objectContaining({ name: "Website", type: "HTTP", target: "https://kestrel.co/", intervalMinutes: 5 }),
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("opens on the client it was opened for", async () => {
    await mount({ initialClientId: "c-k" });
    expect(clientSelect().value).toBe("c-k");
    expect(dialog().textContent).toContain("Saved to Kestrel's wiki, under Monitors.");
  });

  it("shows the server's refusal and stays open", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("You don't have access to this client."));
    const { onClose } = await mount({ initialClientId: "c-n" });
    await act(async () => setValue(field("Website, API"), "API"));
    await act(async () => setValue(field("https://api.example.com"), "https://api.northwind.co/health"));
    await act(async () => submit().click());
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("You don't have access to this client.");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("orderAddMonitorClients", () => {
  it("puts Gitwork first and the rest by name", () => {
    expect(orderAddMonitorClients(clients).map((c) => c.slug)).toEqual(["gitwork", "acme", "kestrel", "northwind"]);
  });
});
