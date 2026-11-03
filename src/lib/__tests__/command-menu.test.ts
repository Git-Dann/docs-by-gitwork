import { describe, expect, it } from "vitest";
import {
  GROUP_LIMIT,
  isCommandMenuShortcut,
  rankCommands,
  type CommandItem,
} from "@/lib/command-menu";

const page = (label: string, hint?: string): CommandItem => ({ id: `page:${label}`, group: "Go to", label, hint, href: `/app/${label.toLowerCase()}` });
const client = (label: string): CommandItem => ({ id: `client:${label}`, group: "Clients", label, href: `/app/portal/${label.toLowerCase()}` });
const doc = (label: string): CommandItem => ({ id: `doc:${label}`, group: "Documents", label, href: `/app/docs/${label}` });
const theme: CommandItem = { id: "action:theme", group: "Actions", label: "Switch to dark mode", keywords: "theme", action: "toggle-theme" };

const ITEMS = [page("Pulse", "Project health checks"), page("Docs"), client("Big Wedge Golf"), client("Fellas Loaded"), doc("Wedge proposal"), theme];

describe("rankCommands", () => {
  it("shows pages and actions, not every client and document, before you type", () => {
    expect(rankCommands(ITEMS, "").map((i) => i.group)).toEqual(["Go to", "Go to", "Actions"]);
  });

  it("finds clients and documents once you type, grouped in a fixed order", () => {
    const groups = rankCommands(ITEMS, "wedge").map((i) => i.group);
    expect(groups).toEqual(["Clients", "Documents"]);
  });

  it("matches the hint and hidden keywords too", () => {
    expect(rankCommands(ITEMS, "health").map((i) => i.label)).toEqual(["Pulse"]);
    expect(rankCommands(ITEMS, "theme").map((i) => i.label)).toEqual(["Switch to dark mode"]);
  });

  it("forgives a typo, because the search is the shared fuzzy matcher", () => {
    expect(rankCommands(ITEMS, "fellas laoded").map((i) => i.label)).toContain("Fellas Loaded");
  });

  it("caps each group so one long list cannot push the others off the screen", () => {
    const many = Array.from({ length: 20 }, (_, i) => client(`Acme ${i}`));
    expect(rankCommands([...many, page("Acme page")], "acme").filter((i) => i.group === "Clients")).toHaveLength(GROUP_LIMIT);
  });
});

describe("isCommandMenuShortcut", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

  it("is Cmd+K or Ctrl+K", () => {
    expect(isCommandMenuShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isCommandMenuShortcut(key("K", { ctrlKey: true }))).toBe(true);
  });

  it("is not a bare K, nor K with Shift or Alt", () => {
    expect(isCommandMenuShortcut(key("k"))).toBe(false);
    expect(isCommandMenuShortcut(key("k", { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isCommandMenuShortcut(key("k", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
