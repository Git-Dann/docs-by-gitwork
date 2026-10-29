/**
 * The ⌘K command menu's rules, kept free of React so they can be tested on their own.
 *
 * Items come from what the viewer can already see: the sidebar's own nav (already filtered by
 * module permission and workspace modules), their clients, their documents, and a few actions.
 * Nothing here grants access; a result is only a link to a page that does its own gating.
 */

import { fuzzySearch } from "@/lib/fuzzy-search";

export type CommandGroup = "Go to" | "Clients" | "Documents" | "Actions";

/** Group order in the list. Pages first: jumping between products is the most common use. */
export const COMMAND_GROUPS: readonly CommandGroup[] = ["Go to", "Clients", "Documents", "Actions"];

export interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  /** A short second line: a module's description, a client's status, a document's type. */
  hint?: string;
  /** Extra words that should match but are not shown. */
  keywords?: string;
  href?: string;
  /** Actions run instead of navigating. */
  action?: "toggle-theme";
}

/** How many results each group shows while searching. Empty query shows pages and actions only. */
export const GROUP_LIMIT = 6;

/**
 * The results for a query, in display order. With no query the menu shows where you can go and
 * what you can do, not a wall of every client and document: those appear once you type.
 */
export function rankCommands(items: readonly CommandItem[], query: string): CommandItem[] {
  const q = query.trim();
  if (!q) {
    return COMMAND_GROUPS.flatMap((group) =>
      group === "Go to" || group === "Actions" ? items.filter((i) => i.group === group) : [],
    );
  }
  const ranked = fuzzySearch(items, q, (i) => [i.label, i.hint, i.keywords]);
  return COMMAND_GROUPS.flatMap((group) => ranked.filter((i) => i.group === group).slice(0, GROUP_LIMIT));
}

/** ⌘K on a Mac, Ctrl+K elsewhere. Works from inside a text field too, as in every app with one. */
export function isCommandMenuShortcut(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): boolean {
  return e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

/** Wraps the highlight round the ends of the list, as arrow keys in a menu should. */
export function moveHighlight(index: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (((index + delta) % length) + length) % length;
}
