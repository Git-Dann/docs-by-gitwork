"use client";

import {
  ArrowRightOnRectangleIcon,
  ChartBarSquareIcon,
  ChevronRightIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  LifebuoyIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  StarIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { useClientList, useProposalList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import { useLocalSettings, type AccountSettings } from "@/lib/local-settings";

const clientAccentClasses = [
  "bg-indigo-600",
  "bg-zinc-900",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-500",
  "bg-rose-600",
] as const;

type NavItem = {
  href: string;
  label: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  badge?: string;
};

export function AppShell({
  children,
  title,
  subtitle,
  hideContentHeader = false,
  forceCollapsedSidebar = false,
  mainClassName,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  hideContentHeader?: boolean;
  forceCollapsedSidebar?: boolean;
  mainClassName?: string;
}) {
  const pathname = usePathname();
  const { settings } = useLocalSettings();
  const { data: proposalListData } = useProposalList({
    status: "ALL",
    sort: "updatedAt:desc",
  });
  const { data: clientListData } = useClientList();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("gitwork.sidebar.collapsed") === "1";
  });

  const isCollapsed = forceCollapsedSidebar ? true : collapsed;
  const proposals = proposalListData?.proposals ?? [];
  const proposalCount = proposals.length;
  const clientRows = useMemo(() => {
    return (clientListData?.clients ?? []).map((client, index) => ({
      name: client.name,
      href: `/app/clients/${client.slug}`,
      logoClass: clientAccentClasses[index % clientAccentClasses.length],
      logoText: client.name.charAt(0).toUpperCase(),
    }));
  }, [clientListData?.clients]);
  const primaryNav = useMemo<NavItem[]>(
    () => [
      {
        href: "/app",
        label: "Dashboard",
        icon: Squares2X2Icon,
      },
      {
        href: "/app/proposals",
        label: "Proposals",
        icon: ChartBarSquareIcon,
        badge: proposalCount ? String(proposalCount) : undefined,
      },
      {
        href: "/app/proof",
        label: "Proof",
        icon: DocumentTextIcon,
      },
      {
        href: "/app/templates",
        label: "Saved Docs",
        icon: StarIcon,
      },
    ],
    [proposalCount],
  );

  function toggleCollapsed() {
    if (forceCollapsedSidebar) {
      return;
    }

    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem("gitwork.sidebar.collapsed", next ? "1" : "0");
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--surface-canvas)] p-3 text-[var(--text-1)] sm:p-4">
      <div
        className={cn(
          "mx-auto grid h-full w-full max-w-[1800px] grid-cols-1 overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_24px_64px_rgba(15,23,42,0.08)] backdrop-blur-sm",
          isCollapsed
            ? "lg:grid-cols-[88px_minmax(0,1fr)]"
            : "lg:grid-cols-[296px_minmax(0,1fr)]",
        )}
      >
        <aside
          className={cn(
            "hidden min-h-0 shrink-0 overflow-hidden lg:flex",
            isCollapsed
              ? "w-[88px] min-w-[88px] max-w-[88px] border-r border-[var(--border-2)] bg-white p-3"
              : "w-[296px] min-w-[296px] max-w-[296px] border-r border-[var(--border-2)] bg-white",
          )}
        >
          {isCollapsed ? (
            <CollapsedRail
              pathname={pathname}
              onExpand={toggleCollapsed}
              canExpand={!forceCollapsedSidebar}
              primaryNav={primaryNav}
              account={settings.account}
            />
          ) : (
            <ExpandedRail
              pathname={pathname}
              onCollapse={toggleCollapsed}
              primaryNav={primaryNav}
              clientRows={clientRows}
              proposalCount={proposalCount}
              account={settings.account}
            />
          )}
        </aside>

        <div className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#fcfcfd_100%)]">
          {hideContentHeader ? null : (
            <header className="px-6 pt-8 sm:px-8">
              <div className="max-w-3xl">
                <p className="app-eyebrow">Workspace</p>
                <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-3)]">{subtitle}</p>
                ) : null}
              </div>
            </header>
          )}

          <main
            className={
              mainClassName ??
              cn(
                "min-h-0 flex-1 overflow-auto px-6 pb-8 sm:px-8",
                hideContentHeader ? "pt-6" : "pt-8",
              )
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function CollapsedRail({
  pathname,
  onExpand,
  canExpand,
  primaryNav,
  account,
}: {
  pathname: string | null;
  onExpand: () => void;
  canExpand: boolean;
  primaryNav: ReadonlyArray<NavItem>;
  account: AccountSettings;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-between rounded-[24px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,#fcfcfd_100%)] px-2.5 py-4 shadow-[var(--shadow-sm)]">
      <div className="space-y-6">
        <div className="flex justify-center">
          {canExpand ? (
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand sidebar"
              className={buttonStyles({
                variant: "secondary",
                size: "icon-md",
                className:
                  "h-14 w-14 rounded-[20px] border-[var(--border-2)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_10px_18px_rgba(16,24,40,0.08)]",
              })}
            >
              <BrandGlyph className="h-11 w-11 border-0 shadow-none" />
            </button>
          ) : (
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--border-2)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_10px_18px_rgba(16,24,40,0.08)]">
              <BrandGlyph className="h-11 w-11 border-0 shadow-none" />
            </div>
          )}
        </div>

        <nav className="flex flex-col items-center gap-3">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/app" && Boolean(pathname?.startsWith(item.href)));

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "relative inline-flex items-center justify-center text-[var(--text-3)] transition",
                  active
                    ? "h-14 w-14 rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-1)] shadow-[var(--shadow-xs)]"
                    : "h-11 w-11 rounded-[14px] hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]",
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-[var(--text-1)]" : "text-[var(--text-2)]")} />
                {item.badge ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--border-2)] bg-white px-1.5 text-[11px] font-semibold text-[var(--text-4)] shadow-[var(--shadow-xs)]">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2">
        <button
          className={buttonStyles({
            variant: "tertiary",
            size: "icon-md",
            className:
              "h-11 w-11 rounded-[14px] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
          })}
          title="Support"
          type="button"
        >
          <LifebuoyIcon className="h-5 w-5" />
        </button>
        <Link
          href="/app/settings"
          className={buttonStyles({
            variant: "tertiary",
            size: "icon-md",
            className:
              "h-11 w-11 rounded-[14px] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
          })}
          title="Settings"
        >
          <Cog8ToothIcon className="h-5 w-5" />
        </Link>
        {canExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white shadow-[var(--shadow-xs)]"
            title="Expand sidebar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={account.avatarUrl}
              alt={account.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          </button>
        ) : (
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-white shadow-[var(--shadow-xs)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={account.avatarUrl}
              alt={account.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedRail({
  pathname,
  onCollapse,
  primaryNav,
  clientRows,
  proposalCount,
  account,
}: {
  pathname: string | null;
  onCollapse: () => void;
  primaryNav: ReadonlyArray<NavItem>;
  clientRows: Array<{
    name: string;
    href: string;
    logoClass: string;
    logoText: string;
  }>;
  proposalCount: number;
  account: AccountSettings;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredPrimaryNav = useMemo(() => {
    const value = deferredQuery.trim().toLowerCase();

    if (!value) {
      return primaryNav;
    }

    return primaryNav.filter((item) => item.label.toLowerCase().includes(value));
  }, [deferredQuery, primaryNav]);

  const filteredClients = useMemo(() => {
    const value = deferredQuery.trim().toLowerCase();

    if (!value) {
      return clientRows;
    }

    return clientRows.filter((client) => client.name.toLowerCase().includes(value));
  }, [clientRows, deferredQuery]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="border-b border-[var(--border-2)] px-5 pb-5 pt-6">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          className="flex items-center gap-3 rounded-[12px] p-1 text-left transition hover:bg-[var(--surface-1)]"
        >
          <BrandGlyph className="h-10 w-10" />
          <div>
            <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Docs by Gitwork
            </p>
            <p className="text-sm text-[var(--text-4)]">Workspace control centre</p>
          </div>
        </button>

        <label className="relative mt-5 block">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search navigation or clients"
            className="app-input pl-10"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-6">
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto pr-1">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="app-eyebrow">Workspace</p>
              {proposalCount ? (
                <span className="app-chip">{proposalCount} active docs</span>
              ) : null}
            </div>
            <div className="space-y-1.5">
              {filteredPrimaryNav.map((item) => (
                <SidebarPrimaryLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  badge={item.badge}
                  active={
                    pathname === item.href ||
                    (item.href !== "/app" && Boolean(pathname?.startsWith(item.href)))
                  }
                />
              ))}
              {!filteredPrimaryNav.length ? (
                <p className="px-3 py-2 text-sm text-[var(--text-4)]">No navigation matches.</p>
              ) : null}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="app-eyebrow">Clients</p>
              <Link
                href="/app/clients"
                className="text-sm font-medium text-[var(--text-4)] transition hover:text-[var(--text-2)]"
              >
                Manage
              </Link>
            </div>
            <div className="space-y-1.5">
              {filteredClients.slice(0, 8).map((client) => (
                <SidebarClientLink key={client.name} {...client} />
              ))}
              {!filteredClients.length ? (
                <p className="rounded-[12px] border border-dashed border-[var(--border-2)] px-3 py-3 text-sm text-[var(--text-4)]">
                  Add clients in the Clients area to keep proposal work tied to accounts.
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-6 space-y-1.5">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <LifebuoyIcon className="h-5 w-5 text-[var(--text-4)]" />
            Support
          </button>

          <Link
            href="/app/settings"
            className="flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <Cog8ToothIcon className="h-5 w-5 text-[var(--text-4)]" />
            Settings
          </Link>
        </div>

        <ProfileMenu account={account} />
      </div>
    </div>
  );
}

function SidebarPrimaryLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  active: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between rounded-[12px] px-3 py-2 text-sm font-semibold transition",
        active
          ? "bg-[var(--surface-1)] text-[var(--text-1)]"
          : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      <span className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-[var(--text-4)]" />
        {label}
      </span>
      {badge ? (
        <span className="app-chip border-[var(--border-1)] bg-white px-2 text-[11px] font-semibold text-[var(--text-4)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarClientLink({
  name,
  href,
  logoClass,
  logoText,
}: {
  name: string;
  href: string;
  logoClass: string;
  logoText: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white",
          logoClass,
        )}
      >
        {logoText}
      </span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <ChevronRightIcon className="h-4 w-4 text-[var(--text-4)]" />
    </Link>
  );
}


function ProfileMenu({ account }: { account: AccountSettings }) {
  const { settings, updateSettings } = useLocalSettings();
  const [open, setOpen] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative mt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-[16px] border border-[var(--border-2)] bg-white px-3 py-3 text-left shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={account.avatarUrl}
          alt={account.name}
          className="h-10 w-10 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{account.name}</p>
          <p className="truncate text-sm text-[var(--text-4)]">{account.email}</p>
        </div>
      </button>

      {open ? (
        <div className="absolute bottom-0 left-[calc(100%+12px)] z-50 w-[360px] rounded-[20px] border border-[var(--border-2)] bg-white p-2 shadow-[var(--shadow-lg)]">
          <Link
            href="/app/account-settings"
            className="flex items-center gap-3 rounded-[12px] px-4 py-3 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <Cog8ToothIcon className="h-5 w-5 text-[var(--text-4)]" />
            <span>Account settings</span>
          </Link>

          <div className="my-2 border-t border-[var(--border-2)]" />

          <Button
            className="w-full justify-center"
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              setOpen(false);
              setShowInviteModal(true);
            }}
          >
            + Add user
          </Button>

          {settings.workspace.invitedUsers.length ? (
            <div className="mt-2 rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3">
              <p className="app-eyebrow">Pending invites</p>
              <div className="mt-2 space-y-1">
                {settings.workspace.invitedUsers.slice(0, 3).map((email) => (
                  <p key={email} className="truncate text-sm text-[var(--text-2)]">
                    {email}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="my-2 border-t border-[var(--border-2)]" />

          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-[12px] px-4 py-3 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 text-[var(--text-4)]" />
            Sign out
          </button>
        </div>
      ) : null}

      {showInviteModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="app-dialog-backdrop absolute inset-0" />
          <div className="app-dialog-panel relative z-10 w-full max-w-md p-6">
            <div>
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">Add user</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                Add an email address to the invited users list.
              </p>
            </div>

            <label className="mt-5 block space-y-1.5">
              <span className="app-field-label">Email address</span>
              <input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                type="email"
                className="app-input"
                placeholder="name@company.com"
              />
            </label>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowInviteModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  const nextEmail = inviteEmail.trim().toLowerCase();
                  if (!nextEmail) {
                    return;
                  }

                  updateSettings((current) => ({
                    ...current,
                    workspace: {
                      ...current.workspace,
                      invitedUsers: current.workspace.invitedUsers.includes(nextEmail)
                        ? current.workspace.invitedUsers
                        : [...current.workspace.invitedUsers, nextEmail],
                    },
                  }));
                  setInviteEmail("");
                  setShowInviteModal(false);
                }}
              >
                Add user
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BrandGlyph({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-[12px] border border-[rgba(10,13,18,0.12)] bg-white shadow-[0_1px_1px_rgba(10,13,18,0.08),0_4px_10px_rgba(10,13,18,0.08)]",
        className,
      )}
    >
      <span className="absolute inset-1/4 rounded-full bg-[linear-gradient(135deg,#53389e_0%,#7f56d9_52%,#9e77ed_100%)]" />
    </div>
  );
}
