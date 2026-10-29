"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTheme } from "@/components/providers/theme-provider";
import { EasyCommandMenu, type EasyCommandItem } from "@/components/ui/easyui/command-menu";
import { useClientList, useProposalList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import { isCommandMenuShortcut, rankCommands, type CommandItem } from "@/lib/command-menu";

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

/** The label shown beside each result, in EasyUI's category slot. */
const CATEGORY_LABEL: Record<CommandItem["group"], string> = {
  "Go to": "Page",
  Clients: "Client",
  Documents: "Document",
  Actions: "Action",
};

/**
 * ⌘K / Ctrl+K: jump to any product, client or document, or run an action, without the mouse.
 * The palette itself is EasyUI's Command Menu (src/components/ui/easyui/command-menu.tsx); this
 * file decides what is in it.
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

  const clients = useClientList(undefined, { enabled: everOpened && canSeeClients });
  const docs = useProposalList({}, { enabled: everOpened && canSeeDocs });

  const show = useCallback(() => {
    setEverOpened(true);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCommandMenuShortcut(e)) return;
      e.preventDefault();
      setOpen((wasOpen) => {
        if (!wasOpen) setEverOpened(true);
        return !wasOpen;
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [show]);

  const commands = useMemo<CommandItem[]>(() => {
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

  const items = useMemo<EasyCommandItem[]>(() => {
    const iconFor = (item: CommandItem) => {
      if (item.group === "Go to") {
        if (item.href === "/app/settings") return Cog6ToothIcon;
        return pages.find((p) => p.href === item.href)?.icon ?? ArrowRightIcon;
      }
      if (item.group === "Clients") return BuildingOffice2Icon;
      if (item.group === "Documents") return DocumentTextIcon;
      return resolved === "dark" ? SunIcon : MoonIcon;
    };
    return commands.map((item) => {
      const Icon = iconFor(item);
      return {
        id: item.id,
        title: item.label,
        category: CATEGORY_LABEL[item.group],
        icon: <Icon aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-3)]" />,
        onSelect: () => {
          setOpen(false);
          if (item.action === "toggle-theme") setMode(resolved === "dark" ? "light" : "dark");
          else if (item.href) router.push(mapHref(item.href));
        },
      };
    });
  }, [commands, pages, resolved, setMode, router, mapHref]);

  // Foundry's ranking, not EasyUI's substring filter: grouped, capped, typo-tolerant, and clients
  // and documents only once you type.
  const rank = useCallback(
    (list: EasyCommandItem[], query: string) => {
      const byId = new Map(list.map((i) => [i.id, i]));
      return rankCommands(commands, query).flatMap((c) => byId.get(c.id) ?? []);
    },
    [commands],
  );

  return (
    <EasyCommandMenu
      isOpen={open}
      onClose={close}
      items={items}
      rank={rank}
      placeholder="Search Foundry"
      footerLabel="Foundry"
    />
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
