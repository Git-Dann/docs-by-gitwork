"use client";

import {
  AcademicCapIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  ChartBarSquareIcon,
  ChevronUpDownIcon,
  CodeBracketIcon,
  Cog8ToothIcon,
  HomeIcon,
  LifebuoyIcon,
  MagnifyingGlassIcon,
  SignalIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useLocalSettings, type AccountSettings } from "@/lib/local-settings";

type NavItem = {
  href?: string;
  label: string;
  subtitle?: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  disabled?: boolean;
  moduleId?: string;
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
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const isAdmin = session?.user?.role === "ADMIN";

  const allModuleNav: NavItem[] = useMemo(
    () => [
      {
        href: "/app/pulse",
        label: "Pulse",
        subtitle: "Health and delivery tracking",
        icon: SignalIcon,
        moduleId: "pulse",
      },
      {
        href: "/app/codeclear",
        label: "Code",
        subtitle: "Dev review and validation",
        icon: CodeBracketIcon,
        moduleId: "codeclear",
      },
      {
        href: "/app/proposals",
        label: "Docs",
        subtitle: "Documentation and client outputs",
        icon: ChartBarSquareIcon,
        moduleId: "proposals",
      },
      {
        href: "/app/clients",
        label: "Portal",
        subtitle: "Client-support workspace",
        icon: UsersIcon,
        moduleId: "clients",
      },
      {
        href: "/app/support",
        label: "Care",
        subtitle: "Support and aftercare",
        icon: LifebuoyIcon,
        moduleId: "support",
      },
      {
        href: "/app/study",
        label: "Study",
        subtitle: "AI-powered user research",
        icon: AcademicCapIcon,
        moduleId: "study",
      },
    ],
    [],
  );

  const primaryNav = useMemo<NavItem[]>(() => {
    const userPermissions = session?.user?.permissions ?? [];
    const modules = isAdmin
      ? allModuleNav
      : allModuleNav.filter((item) => userPermissions.includes(item.moduleId ?? ""));
    return [
      { href: "/app", label: "Foundry HQ", icon: HomeIcon },
      ...modules,
    ];
  }, [isAdmin, session?.user?.permissions, allModuleNav]);

  const secondaryNav = useMemo<NavItem[]>(
    () => [
      // {
      //   href: "/app/templates",
      //   label: "Library",
      //   icon: StarIcon,
      // },
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
            account={settings.account}
          />
        </aside>

        <div className="flex min-h-0 flex-col bg-white">
          {/* Mobile top bar */}
          <div className="flex items-center justify-between border-b border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3 lg:hidden">
            <FoundryLogo compact />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              aria-label="Open menu"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
          </div>

          {hideContentHeader ? null : (
            <header className="border-b border-[var(--border-2)] px-6 pb-5 pt-7 sm:px-8">
              <div className="max-w-4xl">
                <h1 className="text-[32px] font-normal tracking-[-0.02em] text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
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

      {/* Mobile drawer overlay */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[var(--surface-0)]">
            <div className="flex items-center justify-between border-b border-[var(--border-2)] px-5 py-4">
              <FoundryLogo compact />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                aria-label="Close menu"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
              <nav className="space-y-1">
                {primaryNav.map((item) => (
                  <SidebarNavItem
                    key={item.label}
                    item={item}
                    active={Boolean(item.href && isActivePath(pathname, item.href))}
                  />
                ))}
              </nav>

              <div className="mt-auto space-y-2 pt-4">
                <SidebarNavItem
                  item={{ href: "/app/settings", label: "Settings", icon: Cog8ToothIcon }}
                  active={Boolean(isActivePath(pathname, "/app/settings"))}
                />
                <ProfileMenu account={settings.account} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExpandedRail({
  pathname,
  primaryNav,
  secondaryNav,
  account,
}: {
  pathname: string | null;
  primaryNav: ReadonlyArray<NavItem>;
  secondaryNav: ReadonlyArray<NavItem>;
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
        <FoundryLogo />

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

        <div className="mt-4 space-y-2">
          <SidebarNavItem
            item={{ href: "/app/settings", label: "Settings", icon: Cog8ToothIcon }}
            active={Boolean(isActivePath(pathname, "/app/settings"))}
          />
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
      ? "bg-[var(--mist)] text-[var(--brand-700)]"
      : "text-[var(--text-2)] hover:bg-[var(--mist-light)]",
    item.disabled ? "cursor-default opacity-70 hover:bg-transparent" : "",
  );

  const content = (
    <>
      <Icon className={cn("h-5 w-5 shrink-0", active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]")} />
      <div className="min-w-0 flex-1">
        <span className="block leading-tight">{item.label}</span>
        {item.subtitle ? (
          <span className="mt-0.5 block text-[11px] font-normal leading-tight text-[var(--text-4)]">
            {item.subtitle}
          </span>
        ) : null}
      </div>
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
  const { data: session } = useSession();
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
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">
            {session?.user?.name ?? account.name}
          </p>
          <p className="truncate text-xs text-[var(--text-4)]">
            {session?.user?.email ?? account.email}
          </p>
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
            onClick={() => signOut({ callbackUrl: "/login" })}
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

function FoundryLogo({ compact = false }: { compact?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/foundry-logo.png"
      alt="Foundry by Gitwork"
      className={compact ? "h-7 w-auto" : "h-8 w-auto"}
    />
  );
}

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/app" && Boolean(pathname?.startsWith(href)));
}
