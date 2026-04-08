"use client";

import {
  ArrowRightOnRectangleIcon,
  ChartBarSquareIcon,
  CheckCircleIcon,
  ChevronUpDownIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  StarIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProposalList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import { useLocalSettings, type AccountSettings } from "@/lib/local-settings";

type NavItem = {
  href?: string;
  label: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  disabled?: boolean;
};

export function AppShell({
  children,
  title,
  subtitle,
  hideContentHeader = false,
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

  const proposalCount = proposalListData?.proposals.length ?? 0;
  const primaryNav = useMemo<NavItem[]>(
    () => [
      {
        href: "/app",
        label: "Dashboard",
        icon: Squares2X2Icon,
      },
      {
        href: "/app/proposals",
        label: "Docs",
        icon: ChartBarSquareIcon,
      },
      {
        href: "/app/proof",
        label: "Proof",
        icon: DocumentTextIcon,
      },
      {
        href: "/app/codeclear",
        label: "CodeClear",
        icon: CheckCircleIcon,
      },
      {
        href: "/app/clients",
        label: "People",
        icon: UsersIcon,
      },
    ],
    [],
  );

  const secondaryNav = useMemo<NavItem[]>(
    () => [
      {
        href: "/app/settings",
        label: "Settings",
        icon: Cog8ToothIcon,
      },
      {
        href: "/app/templates",
        label: "Library",
        icon: StarIcon,
      },
    ],
    [],
  );

  return (
    <div className="h-[100dvh] bg-white text-[var(--text-1)]">
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--border-2)] bg-[var(--surface-0)] lg:flex lg:min-h-0">
          <ExpandedRail
            pathname={pathname}
            primaryNav={primaryNav}
            secondaryNav={secondaryNav}
            proposalCount={proposalCount}
            account={settings.account}
          />
        </aside>

        <div className="flex min-h-0 flex-col bg-white">
          {hideContentHeader ? null : (
            <header className="border-b border-[var(--border-2)] px-6 pb-5 pt-7 sm:px-8">
              <div className="max-w-4xl">
                <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1.5 text-sm leading-6 text-[var(--text-3)]">{subtitle}</p>
                ) : null}
              </div>
            </header>
          )}

          <main
            className={
              mainClassName ??
              cn(
                "min-h-0 flex-1 overflow-auto px-6 pb-8 pt-6 sm:px-8",
                hideContentHeader ? "pt-6" : "pt-7",
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

function ExpandedRail({
  pathname,
  primaryNav,
  secondaryNav,
  proposalCount,
  account,
}: {
  pathname: string | null;
  primaryNav: ReadonlyArray<NavItem>;
  secondaryNav: ReadonlyArray<NavItem>;
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

  const filteredSecondaryNav = useMemo(() => {
    const value = deferredQuery.trim().toLowerCase();
    if (!value) {
      return secondaryNav;
    }

    return secondaryNav.filter((item) => item.label.toLowerCase().includes(value));
  }, [deferredQuery, secondaryNav]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-b border-[var(--border-2)] px-5 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <BrandGlyph className="h-8 w-8 shrink-0" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Gitwork</p>
          </div>
        </div>

        <label className="relative mt-4 block">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="app-input pl-10"
          />
        </label>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <nav className="space-y-1">
            {filteredPrimaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
              />
            ))}

            {!filteredPrimaryNav.length ? (
              <p className="px-3 py-2 text-sm text-[var(--text-4)]">No matches in the main navigation.</p>
            ) : null}
          </nav>

          <div className="space-y-1">
            {filteredSecondaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-[16px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] p-4 shadow-[var(--shadow-xs)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">Source of truth</p>
                <p className="mt-2 text-[13px] leading-5 text-[var(--text-3)]">
                  Gitwork Standard Library governs Dashboard, Docs, Proof, CodeClear, and People.
                </p>
              </div>
              {proposalCount ? (
                <span className="rounded-full border border-[var(--border-2)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--text-3)]">
                  {proposalCount} docs
                </span>
              ) : null}
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-1)]">
              <div className="h-full w-[72%] rounded-full bg-[linear-gradient(90deg,var(--brand-500)_0%,var(--brand-700)_100%)]" />
            </div>

            <div className="mt-4 flex items-center gap-3 text-sm">
              <Link href="/app/templates" className="font-medium text-[var(--text-2)] transition hover:text-[var(--text-1)]">
                Open library
              </Link>
              <Link href="/app/settings" className="font-medium text-[var(--brand-600)] transition hover:text-[var(--brand-700)]">
                View settings
              </Link>
            </div>
          </div>

          <ProfileMenu account={account} />
        </div>
      </div>
    </div>
  );
}

function SidebarNavItem({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const classes = cn(
    "flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium transition",
    active
      ? "bg-[var(--surface-1)] text-[var(--text-1)]"
      : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
    item.disabled ? "cursor-default opacity-70 hover:bg-transparent" : "",
  );

  const content = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-[var(--text-4)]" />
      <span>{item.label}</span>
    </>
  );

  if (!item.href || item.disabled) {
    return (
      <div aria-disabled="true" className={classes}>
        {content}
      </div>
    );
  }

  return (
    <Link href={item.href} className={classes}>
      {content}
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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-[12px] border border-[var(--border-2)] bg-white px-3 py-3 text-left shadow-[var(--shadow-xs)] transition hover:bg-[var(--surface-1)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={account.avatarUrl} alt={account.name} className="h-9 w-9 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{account.name}</p>
          <p className="truncate text-xs text-[var(--text-4)]">{account.email}</p>
        </div>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
      </button>

      {open ? (
        <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 rounded-[16px] border border-[var(--border-2)] bg-white p-2 shadow-[var(--shadow-lg)]">
          <Link
            href="/app/account-settings"
            className="flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
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
            <div className="mt-2 rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-3">
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
            className="flex w-full items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
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
        "relative overflow-hidden rounded-[8px] border border-[rgba(10,13,18,0.08)] bg-white shadow-[0_1px_2px_rgba(10,13,18,0.06)]",
        className,
      )}
    >
      <div className="absolute inset-[22%] rounded-[4px] bg-[linear-gradient(135deg,var(--brand-700)_0%,var(--brand-500)_100%)]" />
      <div className="absolute inset-0 rounded-[inherit] border border-white/60" />
    </div>
  );
}

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/app" && Boolean(pathname?.startsWith(href)));
}
