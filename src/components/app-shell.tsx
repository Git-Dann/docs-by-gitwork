"use client";

import {
  AcademicCapIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  CodeBracketIcon,
  ChevronUpDownIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  HomeModernIcon,
  LifebuoyIcon,
  SignalIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { useAccount } from "@/hooks/use-account";
import { isAtLeast } from "@/types/auth";
import { useViewAs, VIEW_AS_PERMISSIONS, VIEW_AS_OPTIONS, type ViewAsRole } from "@/lib/view-as";
import { AiSpendCard } from "@/components/ai-spend-card";

type NavItem = {
  href?: string;
  label: string;
  description?: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  disabled?: boolean;
  /** Module permission gating this item. Omit = always visible (e.g. HQ). */
  module?: string;
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const account = useAccount();
  const isAdmin = isAtLeast(account.data?.role ?? "", "ADMIN");
  const { viewAs, setViewAs } = useViewAs(isAdmin);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const primaryNav = useMemo<NavItem[]>(() => {
    const all: NavItem[] = [
      {
        href: "/app",
        label: "Foundry HQ",
        icon: HomeModernIcon,
      },
      {
        href: "/app/pulse",
        label: "Pulse",
        description: "Health and delivery tracking",
        icon: SignalIcon,
        module: "pulse",
      },
      {
        href: "/app/code",
        label: "Code",
        description: "Dev review and validation",
        icon: CodeBracketIcon,
        module: "codeclear",
      },
      {
        href: "/app/docs",
        label: "Docs",
        description: "Proposals, SLAs, SOWs and other documents",
        icon: DocumentTextIcon,
        module: "proposals",
      },
      {
        href: "/app/portal",
        label: "Portal",
        description: "Client management",
        icon: UserGroupIcon,
        module: "clients",
      },
      {
        href: "/app/care",
        label: "Care",
        description: "Support and aftercare",
        icon: LifebuoyIcon,
        module: "support",
      },
      {
        href: "/app/study",
        label: "Study",
        description: "AI-powered user research",
        icon: AcademicCapIcon,
        module: "study",
      },
      {
        href: "/app/backstage",
        label: "Backstage",
        description: "Internal team ops — leave, expenses, availability",
        icon: WrenchScrewdriverIcon,
        module: "backstage",
      },
    ];
    // When an admin is previewing as another role, apply that role's permissions.
    // Otherwise admins see everything; restricted staff/devs see only their modules.
    if (account.isPending) return all;
    if (isAdmin && !viewAs) return all;
    const permissions = isAdmin && viewAs
      ? VIEW_AS_PERMISSIONS[viewAs]
      : (account.data?.permissions ?? []);
    return all.filter((item) => !item.module || permissions.includes(item.module));
  }, [isAdmin, viewAs, account.isPending, account.data]);

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
    <div className="flex h-[100dvh] flex-col bg-[#FAFAF9] text-[var(--text-1)]">
      {/* ── Mobile top bar (hidden on lg+) ── */}
      <div className="flex items-center justify-between border-b border-[var(--border-2)] bg-white px-4 py-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foundry-logo.svg" alt="Foundry" className="h-8 w-auto" />
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="rounded-[6px] p-2 text-[var(--text-2)] hover:bg-[var(--surface-1)]"
        >
          <Bars3Icon className="h-6 w-6" />
        </button>
      </div>

      {/* ── Mobile page title (hidden on lg+) ── */}
      {!hideContentHeader && (
        <div className="border-b border-[var(--border-2)] bg-white px-4 py-4 lg:hidden">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-[var(--text-3)]">{subtitle}</p>
          ) : null}
        </div>
      )}

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer panel */}
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,#ffffff_38%)]">
            <div className="flex items-center justify-between border-b border-[var(--border-2)] px-5 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/foundry-logo.svg" alt="Foundry" className="h-8 w-auto" />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="rounded-[6px] p-2 text-[var(--text-2)] hover:bg-[var(--surface-1)]"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
              <nav className="space-y-1">
                {primaryNav.map((item) => (
                  <SidebarNavItem
                    key={item.label}
                    item={item}
                    active={Boolean(item.href && isActivePath(pathname, item.href))}
                  />
                ))}
              </nav>
            </div>
            <div className="border-t border-[var(--border-2)] px-3 py-3">
              <AiSpendCard />
              <SidebarNavItem
                item={{ href: "/app/settings/account", label: "Settings", icon: Cog8ToothIcon }}
                active={Boolean(isActivePath(pathname, "/app/settings"))}
              />
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 w-full lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* ── Desktop sidebar (full height, always visible) ── */}
        <aside className="hidden border-r border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,#ffffff_38%)] lg:flex lg:min-h-0">
          <ExpandedRail
            pathname={pathname}
            primaryNav={primaryNav}
            secondaryNav={secondaryNav}
            viewAs={viewAs}
            setViewAs={setViewAs}
            isAdmin={isAdmin}
          />
        </aside>

        {/* ── Content column ── */}
        <div className="flex min-h-0 flex-col bg-[#FAFAF9]">
          {/* View-as preview banner */}
          {isAdmin && viewAs && (
            <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-6 py-2">
              <p className="text-xs font-medium text-amber-800">
                👁 Previewing as <strong>{VIEW_AS_OPTIONS.find(o => o.role === viewAs)?.label ?? viewAs}</strong> — you&apos;re seeing a restricted view of the platform
              </p>
              <button
                onClick={() => setViewAs(null)}
                className="shrink-0 rounded-[6px] bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-200"
              >
                Exit preview
              </button>
            </div>
          )}
          {!hideContentHeader && (
            <header className="hidden lg:block border-b border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-brand-soft)_100%)] px-6 pb-5 pt-7 sm:px-8">
              <div className="max-w-4xl">
                <h1 className="text-[44px] font-normal leading-[1.15] tracking-[-0.03em] text-[var(--text-1)]">
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
  viewAs,
  setViewAs,
  isAdmin,
}: {
  pathname: string | null;
  primaryNav: ReadonlyArray<NavItem>;
  secondaryNav: ReadonlyArray<NavItem>;
  viewAs: ViewAsRole;
  setViewAs: (role: ViewAsRole) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center justify-center border-b border-[var(--border-2)] px-6 pb-5 pt-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foundry-logo.svg" alt="Foundry" className="h-12 w-auto" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <nav className="space-y-1">
            {primaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
              />
            ))}
          </nav>

          <div className="space-y-1">
            {secondaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
              />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <AiSpendCard />
          <div className="space-y-2">
            <SidebarNavItem
              item={{ href: "/app/settings/account", label: "Settings", icon: Cog8ToothIcon }}
              active={Boolean(isActivePath(pathname, "/app/settings"))}
            />
            <ProfileMenu viewAs={viewAs} setViewAs={setViewAs} isAdmin={isAdmin} />
          </div>
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
    "flex w-full items-start gap-3 rounded-[6px] border px-3 py-2 text-sm font-medium transition",
    active
      ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)] shadow-[var(--shadow-xs)]"
      : "border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
    item.disabled ? "cursor-default opacity-70 hover:bg-transparent" : "",
  );

  const content = (
    <>
      <Icon
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
        )}
      />
      <span className="min-w-0">
        <span className="block">{item.label}</span>
        {item.description ? (
          <span className="mt-0.5 block text-xs font-normal text-[var(--text-4)]">
            {item.description}
          </span>
        ) : null}
      </span>
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

function Avatar({ name, url }: { name: string; url: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="h-9 w-9 rounded-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextSibling as HTMLElement | null)?.style.setProperty("display", "flex"); }}
      />
    );
  }

  return (
    <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] text-sm font-semibold text-[var(--brand-700)]">
      {initials}
    </div>
  );
}

function ProfileMenu({
  viewAs,
  setViewAs,
  isAdmin,
}: {
  viewAs: ViewAsRole;
  setViewAs: (role: ViewAsRole) => void;
  isAdmin: boolean;
}) {
  const { data: session } = useSession();
  const accountQuery = useAccount();
  const account = accountQuery.data;
  const [open, setOpen] = useState(false);

  // Identity reads from the live Google session by default. The account hook supplies the
  // user's custom avatar (if they've uploaded one in Account settings); React Query caches
  // it aggressively so it's a once-per-session fetch in practice.
  const displayName = session?.user?.name || "";
  const displayEmail = session?.user?.email || "";
  const displayAvatar = account?.avatarUrl || session?.user?.image || "";
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
        className="flex w-full items-center gap-3 rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 text-left transition hover:bg-[var(--surface-1)]"
      >
        <Avatar name={displayName} url={displayAvatar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text-1)]">{displayName}</p>
          <p className="truncate text-xs text-[var(--text-4)]">{displayEmail}</p>
        </div>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
      </button>

      {open ? (
        <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-2 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">

          {/* View as — admin only, tucked away */}
          {isAdmin && (
            <div className="mb-1 border-b border-[rgba(0,0,0,0.06)] pb-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[1px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
                View platform as
              </p>
              {VIEW_AS_OPTIONS.map(({ role, label, description }) => {
                const active = viewAs === role;
                return (
                  <button
                    key={String(role)}
                    type="button"
                    onClick={() => { setViewAs(role); setOpen(false); }}
                    className={`flex w-full items-start justify-between gap-2 rounded-[6px] px-3 py-2 text-left transition ${
                      active
                        ? "bg-[#EFF6FF] text-[#1D4ED8]"
                        : "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                    }`}
                  >
                    <div>
                      <p className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>{label}</p>
                      <p className={`text-[11px] ${active ? "text-[#3B82F6]" : "text-[#94A3B8]"}`}>{description}</p>
                    </div>
                    {active && <span className="mt-1 shrink-0 text-[10px] text-[#1D4ED8]">●</span>}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => { setOpen(false); import("next-auth/react").then(({ signOut }) => signOut()); }}
            className="flex w-full items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 text-[var(--text-4)]" />
            Sign out
          </button>
        </div>
      ) : null}

    </div>
  );
}


function isActivePath(pathname: string | null, href: string) {
  if (href === "/app") {
    return pathname === "/app" || Boolean(pathname?.startsWith("/app/projects/"));
  }

  return pathname === href || (href !== "/app" && Boolean(pathname?.startsWith(href)));
}
