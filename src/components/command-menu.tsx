"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { useTheme } from "@/components/providers/theme-provider";
import { useClientList, useProposalList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import {
  COMMAND_GROUPS,
  isCommandMenuShortcut,
  moveHighlight,
  rankCommands,
  type CommandItem,
} from "@/lib/command-menu";

/** A sidebar entry, as the shell already has it: filtered to what this viewer may open. */
export interface CommandPage {
  href?: string;
  label: string;
  description?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const OPEN_EVENT = "foundry:command-menu";

/** Open the menu from anywhere, e.g. a header button. */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** "IN_PROGRESS" → "In Progress". Tolerates a missing value: list rows are API data, not a guarantee. */
function titleCase(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * ⌘K / Ctrl+K: jump to any product, client or document, or run an action, without the mouse.
 *
 * The pages are the shell's own nav, so the menu can never offer a product the sidebar hides.
 * Clients and documents load only once the menu is first opened, and only when the viewer has
 * that module, so a closed menu costs nothing and a developer without Docs never calls the API.
 */
export function CommandMenu({
  pages,
  canSeeClients,
  canSeeDocs,
  mapHref = (href) => href,
}: {
  pages: CommandPage[];
  canSeeClients: boolean;
  canSeeDocs: boolean;
  /** The demo shell maps /app links onto its /demo pages. */
  mapHref?: (href: string) => string;
}) {
  const router = useRouter();
  const { resolved, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const clients = useClientList(undefined, { enabled: everOpened && canSeeClients });
  const docs = useProposalList({}, { enabled: everOpened && canSeeDocs });

  const show = useCallback(() => {
    setQuery("");
    setHighlight(0);
    setEverOpened(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCommandMenuShortcut(e)) return;
      e.preventDefault();
      if (open) setOpen(false);
      else show();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [open, show]);

  const items = useMemo<CommandItem[]>(() => {
    const out: CommandItem[] = pages
      .filter((p) => p.href)
      .map((p) => ({ id: `page:${p.href}`, group: "Go to", label: p.label, hint: p.description, href: p.href }));
    out.push({ id: "page:/app/settings", group: "Go to", label: "Settings", hint: "Workspace and account", href: "/app/settings" });
    for (const c of clients.data?.clients ?? []) {
      out.push({
        id: `client:${c.id}`,
        group: "Clients",
        label: c.name,
        hint: titleCase(c.status) || undefined,
        keywords: c.slug,
        href: `/app/portal/${c.slug}`,
      });
    }
    for (const d of docs.data?.proposals ?? []) {
      out.push({
        id: `doc:${d.id}`,
        group: "Documents",
        label: d.title,
        hint: [titleCase(d.documentType), d.clientName].filter(Boolean).join(" · "),
        keywords: d.documentNumber ?? undefined,
        href: `/app/docs/${d.id}`,
      });
    }
    out.push({
      id: "action:theme",
      group: "Actions",
      label: resolved === "dark" ? "Switch to light mode" : "Switch to dark mode",
      keywords: "theme appearance dark light",
      action: "toggle-theme",
    });
    return out;
  }, [pages, clients.data, docs.data, resolved]);

  const results = useMemo(() => rankCommands(items, query), [items, query]);
  const active = results[Math.min(highlight, Math.max(0, results.length - 1))];
  const loading = (canSeeClients && clients.isLoading) || (canSeeDocs && docs.isLoading);

  // Keep the highlighted row in view as the arrows move it.
  useEffect(() => {
    if (!active) return;
    document.getElementById(`${listId}-${active.id}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function run(item: CommandItem) {
    setOpen(false);
    if (item.action === "toggle-theme") setMode(resolved === "dark" ? "light" : "dark");
    else if (item.href) router.push(mapHref(item.href));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, e.key === "ArrowDown" ? 1 : -1, results.length));
    } else if (e.key === "Enter" && active) {
      e.preventDefault();
      run(active);
    }
  }

  const iconFor = (item: CommandItem) => {
    if (item.group === "Go to") {
      if (item.href === "/app/settings") return Cog6ToothIcon;
      return pages.find((p) => p.href === item.href)?.icon ?? ArrowRightIcon;
    }
    if (item.group === "Clients") return BuildingOffice2Icon;
    if (item.group === "Documents") return DocumentTextIcon;
    return resolved === "dark" ? SunIcon : MoonIcon;
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      labelledById={`${listId}-label`}
      // A fixed height, so the box does not resize under the cursor as results change while typing.
      panelClassName="flex h-[min(460px,75vh)] w-full max-w-[640px] flex-col"
    >
      <label id={`${listId}-label`} className="sr-only">
        Search Foundry
      </label>
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-2)] px-4">
        <MagnifyingGlassIcon aria-hidden className="h-5 w-5 shrink-0 text-[var(--text-4)]" />
        {/* The Modal focuses the first focusable element on open, which is this field. */}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search Foundry"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-labelledby={`${listId}-label`}
          aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
          // Inline, because the app's global :focus-visible ring is unlayered CSS that a utility
          // cannot override (CLAUDE.md §69). The field sits in a ruled header and needs no ring.
          style={{ outline: "none" }}
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none sm:text-[15px]"
        />
        <kbd className="hidden shrink-0 rounded-[4px] border border-[var(--border-1)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-4)] sm:inline">
          esc
        </kbd>
      </div>

      <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <li className="px-3 py-10 text-center text-[13.5px] text-[var(--text-3)]">
            {loading ? "Loading…" : `Nothing matches “${query.trim()}”.`}
          </li>
        ) : (
          COMMAND_GROUPS.map((group) => {
            const rows = results.filter((r) => r.group === group);
            if (rows.length === 0) return null;
            return (
              <li key={group} role="presentation">
                <div className="px-3 pb-1 pt-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                  {group}
                </div>
                <ul role="presentation">
                  {rows.map((item) => {
                    const Icon = iconFor(item);
                    const on = item.id === active?.id;
                    return (
                      <li
                        key={item.id}
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={on}
                        onMouseMove={() => setHighlight(results.indexOf(item))}
                        onClick={() => run(item)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2",
                          on ? "bg-[var(--brand-50)] text-[var(--text-1)]" : "text-[var(--text-2)]",
                        )}
                      >
                        <Icon aria-hidden className={cn("h-4 w-4 shrink-0", on ? "text-[var(--brand-600)]" : "text-[var(--text-4)]")} />
                        <span className="min-w-0 flex-1 truncate text-[14px]" title={item.label}>
                          {item.label}
                        </span>
                        {item.hint ? (
                          <span className="hidden max-w-[45%] shrink truncate text-[12.5px] text-[var(--text-4)] sm:block" title={item.hint}>
                            {item.hint}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex shrink-0 items-center gap-4 border-t border-[var(--border-2)] px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--text-4)]">
        <span>↑↓ move</span>
        <span>↵ open</span>
        <span className="ml-auto hidden sm:inline">{query.trim() ? "" : "Type to search clients and documents"}</span>
      </div>
    </Modal>
  );
}

/** The header button that opens the menu, so it can be found without knowing the shortcut. */
export function CommandMenuButton({ className }: { className?: string }) {
  const [mac, setMac] = useState(true);
  // Read after mount: the server cannot know the platform, so it renders the Mac label.
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)), []);
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-label="Search Foundry"
      title={`Search Foundry (${mac ? "⌘" : "Ctrl+"}K)`}
      className={cn(
        "flex items-center gap-2 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
        className,
      )}
    >
      <MagnifyingGlassIcon aria-hidden className="h-4 w-4" />
      <span className="hidden xl:inline">Search</span>
      <kbd className="hidden rounded-[4px] border border-[var(--border-1)] px-1 font-mono text-[10.5px] text-[var(--text-4)] xl:inline">
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
