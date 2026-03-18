"use client";

import {
  ArrowRightOnRectangleIcon,
  ChartBarSquareIcon,
  ChevronRightIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  LifebuoyIcon,
  Squares2X2Icon,
  StarIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

  function toggleCollapsed() {
    if (forceCollapsedSidebar) {
      return;
    }

    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem("gitwork.sidebar.collapsed", next ? "1" : "0");
  }

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

  const primaryNav = [
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
  ] as const;

  return (
    <div className="h-screen bg-[var(--surface-0)] p-4 text-[var(--text-1)]">
      <div className="mx-auto grid h-[calc(100vh-2rem)] max-w-[1800px] grid-cols-1 gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <aside
          className={cn(
            "hidden h-full flex-col rounded-[24px] border border-[var(--border-1)] bg-white p-3 lg:flex",
            isCollapsed ? "w-[96px]" : "w-[332px]",
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
              account={settings.account}
            />
          )}
        </aside>

        <div className="flex min-h-0 flex-col rounded-[24px] bg-transparent">
          {hideContentHeader ? null : (
            <header className="border-b border-[var(--border-1)] px-5 py-4 sm:px-7">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-[var(--text-3)]">{subtitle}</p> : null}
            </header>
          )}

          <main className={mainClassName ?? "min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-7 sm:py-6"}>{children}</main>
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
  primaryNav: ReadonlyArray<{
    href: string;
    label: string;
    icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
    badge?: string;
  }>;
  account: AccountSettings;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center gap-4">
        {canExpand ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expand sidebar"
            className={buttonStyles({
              variant: "secondary",
              size: "icon-md",
              className: "mt-1 h-16 w-16 rounded-2xl",
            })}
          >
            <BrandGlyph className="h-10 w-10" />
          </button>
        ) : (
          <div className="mt-1 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-1)] bg-white">
            <BrandGlyph className="h-10 w-10" />
          </div>
        )}

        <nav className="mt-14 flex flex-col items-center gap-2">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/app" && Boolean(pathname?.startsWith(item.href)));

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "inline-flex h-12 w-12 items-center justify-center rounded-xl border transition",
                  active
                    ? "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-2)]"
                    : "border-transparent text-[var(--text-3)] hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]",
                )}
              >
                <Icon className="h-6 w-6" />
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-2">
        <button
          className={buttonStyles({
            variant: "tertiary",
            size: "icon-md",
            className: "h-11 w-11 text-[var(--text-3)]",
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
            className: "h-11 w-11 text-[var(--text-3)]",
          })}
          title="Settings"
        >
          <Cog8ToothIcon className="h-5 w-5" />
        </Link>
        {canExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className={buttonStyles({
              variant: "secondary",
              size: "icon-md",
              className: "h-11 w-11",
            })}
            title="Expand sidebar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={account.avatarUrl}
              alt={account.name}
              className="h-8 w-8 rounded-full object-cover"
            />
          </button>
        ) : (
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-1)] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={account.avatarUrl}
              alt={account.name}
              className="h-8 w-8 rounded-full object-cover"
            />
          </div>
        )}
      </div>
    </>
  );
}

function ExpandedRail({
  pathname,
  onCollapse,
  primaryNav,
  clientRows,
  account,
}: {
  pathname: string | null;
  onCollapse: () => void;
  primaryNav: ReadonlyArray<{
    href: string;
    label: string;
    icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
    badge?: string;
  }>;
  clientRows: Array<{
    name: string;
    href: string;
    logoClass: string;
    logoText: string;
  }>;
  account: AccountSettings;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[20px] bg-white p-4">
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Collapse sidebar"
        className={buttonStyles({
          variant: "tertiary",
          size: "sm",
          className: "h-auto w-fit gap-3 p-2",
        })}
      >
        <BrandGlyph className="h-12 w-12" />
        <p className="whitespace-nowrap text-[24px] leading-none tracking-[-0.02em] text-[var(--text-1)]">
          <span className="font-semibold">Docs</span>
          <span className="font-normal"> by Gitwork</span>
        </p>
      </button>

      <div className="mt-7 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <section>
            <p className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-[var(--text-3)] uppercase">General</p>
            <ul className="space-y-1.5">
              {primaryNav.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  badge={"badge" in item ? item.badge : undefined}
                  active={pathname === item.href || (item.href !== "/app" && Boolean(pathname?.startsWith(item.href)))}
                />
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-semibold tracking-[0.08em] text-[var(--text-3)] uppercase">Clients</p>
              <Link href="/app/clients" className="text-xs font-medium text-[var(--text-3)] hover:text-[var(--text-1)]">
                Manage
              </Link>
            </div>
            <ul className="space-y-1.5">
              {clientRows.map((client) => (
                <li key={client.name}>
                  <Link
                    href={client.href}
                    className={buttonStyles({
                      variant: "tertiary",
                      size: "sm",
                      className: "w-full justify-start gap-2.5 px-3 text-[18px] font-semibold tracking-[-0.02em]",
                    })}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold text-white",
                          client.logoClass,
                        )}
                      >
                        {client.logoText}
                      </span>
                      {client.name}
                    </span>
                    <ChevronRightIcon className="ml-auto h-5 w-5 text-[var(--text-3)]" />
                  </Link>
                </li>
              ))}
            </ul>
            {!clientRows.length ? (
              <p className="px-3 pt-1 text-sm text-[var(--text-3)]">
                Add clients in the Clients area, or create a proposal with a client name.
              </p>
            ) : null}
          </section>
        </div>

        <div className="mt-6 space-y-1.5">
          <Button type="button" variant="tertiary" size="sm" className="w-full justify-start gap-2.5 px-3 text-[18px] font-semibold tracking-[-0.02em]">
            <LifebuoyIcon className="h-5 w-5 text-[var(--text-3)]" />
            Support
          </Button>

          <Link
            href="/app/settings"
            className={buttonStyles({
              variant: "tertiary",
              size: "sm",
              className: "w-full justify-start gap-2.5 px-3 text-[18px] font-semibold tracking-[-0.02em]",
            })}
          >
            <Cog8ToothIcon className="h-5 w-5 text-[var(--text-3)]" />
            Settings
          </Link>
        </div>

        <ProfileMenu account={account} />
      </div>
    </div>
  );
}

function SidebarLink({
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
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center justify-between rounded-xl border px-3 py-2 text-[18px] font-semibold tracking-[-0.02em] transition",
          active
            ? "border-[var(--border-1)] bg-white text-[var(--text-1)] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            : "border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        )}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="h-5 w-5" />
          {label}
        </span>
        {badge ? (
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-[var(--border-1)] px-2 text-xs font-medium text-[var(--text-3)]">
            {badge}
          </span>
        ) : null}
      </Link>
    </li>
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
        className={buttonStyles({ variant: "secondary", size: "md", className: "h-auto w-full justify-start p-3 text-left" })}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={account.avatarUrl}
            alt={account.name}
            className="h-11 w-11 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-[var(--text-1)]">{account.name}</p>
            <p className="truncate text-sm text-[var(--text-3)]">{account.email}</p>
          </div>
        </div>
      </button>

      {open ? (
        <div className="absolute bottom-0 left-[calc(100%+12px)] z-50 w-[380px] rounded-[20px] border border-[var(--border-1)] bg-white p-2 shadow-[0_20px_45px_rgba(15,23,42,0.12)]">
          <Link
            href="/app/settings"
            className={buttonStyles({
              variant: "tertiary",
              size: "sm",
              className: "w-full justify-end gap-3 px-4 text-sm text-[var(--text-2)]",
            })}
          >
            <UserCircleIcon className="h-5 w-5" />
            <span>View profile</span>
          </Link>

          <Link
            href="/app/settings"
            className={buttonStyles({
              variant: "tertiary",
              size: "sm",
              className: "mt-1 w-full justify-end gap-3 px-4 text-sm text-[var(--text-2)]",
            })}
          >
            <Cog8ToothIcon className="h-5 w-5" />
            <span>Account settings</span>
          </Link>

          <div className="my-2 border-t border-[var(--border-1)]" />

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
            + Add User
          </Button>

          {settings.workspace.invitedUsers.length ? (
            <div className="mt-2 rounded-xl border border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-3)]">Pending invites</p>
              <div className="mt-2 space-y-1">
                {settings.workspace.invitedUsers.slice(0, 3).map((email) => (
                  <p key={email} className="truncate text-sm text-[var(--text-2)]">
                    {email}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="my-2 border-t border-[var(--border-1)]" />

          <button
            type="button"
            className={buttonStyles({
              variant: "tertiary",
              size: "sm",
              className: "w-full justify-start px-4 text-sm text-[var(--text-2)]",
            })}
          >
            <span className="flex items-center gap-2">
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              Sign out
            </span>
          </button>
        </div>
      ) : null}

      {showInviteModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-1)] bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.18)]">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-1)]">Add user</h3>
              <p className="mt-1 text-sm text-[var(--text-3)]">Add an email address to the invited users list.</p>
            </div>

            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">Email address</span>
              <input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                type="email"
                className="w-full"
                placeholder="name@company.com"
              />
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
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
    <div className={cn("relative rounded-[14px] border border-[var(--border-1)] bg-white shadow-[0_4px_10px_rgba(15,23,42,0.08)]", className)}>
      <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_45%_30%,#a78bfa_0%,#7c3aed_45%,#4c1d95_100%)]" />
    </div>
  );
}
