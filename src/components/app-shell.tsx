"use client";

import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BookOpenIcon,
  ChartBarIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  CodeBracketIcon,
  ChevronUpDownIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  HomeModernIcon,
  LifebuoyIcon,
  PhotoIcon,
  RectangleStackIcon,
  SignalIcon,
  CheckBadgeIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { avatarPosition, resolveAvatar } from "@/lib/avatar";
import { useAccount } from "@/hooks/use-account";
import { isAtLeast, isSuperAdmin } from "@/types/auth";
import { useViewAs, type ViewAsRole, type ViewAsUser } from "@/lib/view-as";
import { listSupportClients, listTeamMembers } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { AiSpendCard } from "@/components/ai-spend-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushPromptBanner } from "@/components/notifications/push-prompt-banner";

// The Desk is a client-only interactive drawer that pulls in a heavy subtree
// (globe world-land data ~28KB, the Brief + morning-brief ~29KB). It renders its
// collapsed dock on every /app page but nothing above the fold depends on it, so
// load it lazily (ssr:false) to keep it out of the initial route bundle.
const DeskDrawer = dynamic(
  () => import("@/components/desk/desk-drawer").then((m) => m.DeskDrawer),
  { ssr: false },
);

type NavItem = {
  href?: string;
  label: string;
  description?: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
  disabled?: boolean;
  /** Module permission gating this item. Omit = always visible (e.g. HQ). */
  module?: string;
};

// Last-known set of module keys this viewer is allowed to see, cached so the
// sidebar renders the CORRECT filtered nav on first paint — before /api/account
// resolves — instead of flashing the full list then collapsing it.
const NAV_CACHE_KEY = "gitwork.nav.modules.v1";
// Persists the desktop sidebar's collapsed/expanded state across sessions.
const SIDEBAR_COLLAPSED_KEY = "gitwork.sidebar.collapsed.v1";
// Every module key a nav item can gate on. Admins/super-admins with full access
// cache this whole set. Keep in sync with the `module` fields in `primaryNav`.
const ALL_NAV_MODULES = [
  "pulse",
  "codeclear",
  "proposals",
  "clients",
  "support",
  "backstage",
  "studio",
];

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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* storage unavailable — stays expanded */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable — non-fatal, just won't persist */
      }
      return next;
    });
  }
  const account = useAccount();
  const isAdmin = isAtLeast(account.data?.role ?? "", "ADMIN");
  const isSuper = isSuperAdmin(account.data?.role ?? "");
  const { viewAs, viewAsUser, setViewAs, setViewAsUser, effectivePermissions, previewLabel } = useViewAs(isAdmin);
  const realPermissions = useMemo(() => account.data?.permissions ?? [], [account.data?.permissions]);
  const isFullAccessAdmin = isAdmin && realPermissions.length === 0;
  const shouldScopeCareNav =
    Boolean(account.data) &&
    realPermissions.includes("support") &&
    !realPermissions.includes("seeAllClients") &&
    !isFullAccessAdmin;
  const scopedCareClients = useQuery({
    queryKey: ["support", "clients", "nav-scope"],
    queryFn: () => listSupportClients(),
    enabled: shouldScopeCareNav,
    staleTime: 60_000,
  });
  const hideCareForScopedUser = shouldScopeCareNav && (scopedCareClients.data?.clients.length ?? 0) === 0;

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Hydrate the cached allowed-module list on mount so first paint filters the
  // nav correctly (no full-list → filtered flash). SSR/first render is null →
  // shows only always-on items, then this fills in, then /api/account confirms.
  const [cachedModules, setCachedModules] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((m) => typeof m === "string")) {
          setCachedModules(parsed as string[]);
        }
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, []);

  // Persist this viewer's OWN resolved modules once known (never a view-as
  // preview set — that would poison the next real load).
  useEffect(() => {
    if (account.isPending) return;
    if (effectivePermissions !== null) return; // previewing another role/user
    const allowed = isFullAccessAdmin ? ALL_NAV_MODULES : realPermissions;
    try {
      localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(allowed));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [account.isPending, effectivePermissions, isFullAccessAdmin, realPermissions]);

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
        href: "/app/assay",
        label: "Assay",
        description: "Hallmark attestations for delivered software",
        icon: CheckBadgeIcon,
        module: "assay",
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
        href: "/app/backstage",
        label: "Backstage",
        description: "Leave, public holidays and team availability",
        icon: WrenchScrewdriverIcon,
        module: "backstage",
      },
      {
        href: "/app/studio",
        label: "Studio",
        description: "Brand social assets — carousels, banners, posts",
        icon: PhotoIcon,
        module: "studio",
      },
    ];
    if (account.isPending) {
      // Pre-/api/account first paint: render from the cached module list if we
      // have one (returning users get their correct nav instantly), else show
      // only the always-on items. Never render the full list then collapse it —
      // that collapse is the flash. Progressive reveal reads clean.
      if (cachedModules) {
        return all.filter((item) => !item.module || cachedModules.includes(item.module));
      }
      return all.filter((item) => !item.module);
    }

    // When previewing as another role/user, use the effective permissions from the hook.
    // Super Admin (isAdmin, no viewAs, empty permissions) → full access.
    // Admin with non-empty permissions array → respect those permissions.
    // Staff/Developer → filtered by their permissions.
    if (effectivePermissions !== null) {
      // In preview mode — apply whatever permissions the preview role/user has
      return all.filter((item) => !item.module || effectivePermissions.includes(item.module));
    }
    if (isAdmin && realPermissions.length === 0) return all; // Super Admin / full-access admin
    return all.filter((item) => {
      if (item.module === "support" && hideCareForScopedUser) return false;
      return !item.module || realPermissions.includes(item.module);
    });
  }, [isAdmin, effectivePermissions, account.isPending, realPermissions, hideCareForScopedUser, cachedModules]);

  const secondaryNav = useMemo<NavItem[]>(
    () =>
      isSuper
        ? [
            {
              href: "/app/analytics",
              label: "Analytics",
              description: "Delivery, output & AI usage",
              icon: ChartBarIcon,
            },
            {
              href: "/app/starters",
              label: "Starters",
              description: "Prompt→Production library",
              icon: RectangleStackIcon,
            },
          ]
        : [],
    [isSuper],
  );

  return (
    // overflow-hidden is load-bearing: the shell is a fixed h-[100dvh] frame and <main> is the
    // scroll container. Without it, any tall absolutely-positioned descendant that escapes <main>
    // (e.g. the paged-document's off-screen measurer at left:-99999) attaches to this root and
    // grows the whole PAGE — the page then scrolls past the viewport even though <main> is bounded.
    // demo-shell.tsx already clips here; keep the two in sync.
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-1)]">
      {/* ── Mobile top bar (hidden on lg+) ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foundry-logo.svg" alt="Foundry" width={245} height={64} className="h-8 w-auto dark:brightness-0 dark:invert" />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-[6px] p-2 text-[var(--text-2)] hover:bg-[var(--surface-1)]"
          >
            {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* ── Mobile nav dropdown (drops below header, overlays content) ── */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="absolute inset-0 top-[56px] z-30 bg-[var(--surface-canvas)]/60 backdrop-blur-[1px] lg:hidden"
        />
      )}
      {mobileOpen && (
        <div className="absolute inset-x-0 top-[56px] z-40 flex max-h-[calc(100dvh-56px)] flex-col overflow-y-auto border-b border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,var(--surface-0)_60%)] shadow-xl lg:hidden">
          <div className="px-3 py-4">
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
          <div className="mt-auto space-y-1 border-t border-[var(--border-2)] px-3 py-3">
            <AiSpendCard />
            {secondaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
              />
            ))}
            <SidebarNavItem
              item={{
                href: "/app/handbook",
                label: "Handbook",
                description: "Developer knowledgebase",
                icon: BookOpenIcon,
              }}
              active={Boolean(isActivePath(pathname, "/app/handbook"))}
            />
            <SidebarNavItem
              item={{ href: "/app/settings/account", label: "Settings", icon: Cog8ToothIcon }}
              active={Boolean(isActivePath(pathname, "/app/settings"))}
            />
          </div>
        </div>
      )}

      {/* ── Mobile page title (hidden on lg+) ── */}
      {!hideContentHeader && (
        <div className="shrink-0 border-b border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-4 lg:hidden">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-[var(--text-3)]">{subtitle}</p>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          // grid-rows-[minmax(0,1fr)] makes the single row (and therefore <main>) a DEFINITE height
          // bounded to the viewport, so <main overflow-auto> becomes the scroll container instead of
          // the body growing. Without it, height-framed pages (the Docs editor) can't bound to the
          // viewport and the whole page scrolls. (demo-shell already does this — keep them in sync.)
          "min-h-0 flex-1 w-full lg:grid lg:grid-rows-[minmax(0,1fr)]",
          collapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)]",
        )}
      >
        {/* ── Desktop sidebar (full height, always visible) ── */}
        <aside className="hidden border-r border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,var(--surface-0)_38%)] lg:flex lg:min-h-0">
          <ExpandedRail
            pathname={pathname}
            primaryNav={primaryNav}
            secondaryNav={secondaryNav}
            viewAs={viewAs}
            viewAsUser={viewAsUser}
            setViewAs={setViewAs}
            setViewAsUser={setViewAsUser}
            isAdmin={isAdmin}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        </aside>

        {/* ── Content column ── */}
        {/* pb-12 reserves the 48px height of the fixed "On Your Desk" dock so page
            content (and any bottom pagination bars) never sits underneath it. */}
        <div className="flex min-h-0 flex-col bg-[var(--surface-canvas)] pb-12">
          {/* View-as preview banner */}
          {isAdmin && viewAs && previewLabel && (
            <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-6 py-2">
              <p className="text-xs font-medium text-amber-800">
                👁 Previewing as <strong>{previewLabel}</strong> — you&apos;re seeing a restricted view of the platform
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
            <header className="hidden lg:block border-b border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-0)_0%,var(--surface-brand-soft)_100%)] px-6 pb-5 pt-7 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-4xl">
                  <h1 className="text-[44px] font-normal leading-[1.15] tracking-[-0.03em] text-[var(--text-1)]">
                    {title}
                  </h1>
                  {subtitle ? (
                    <p className="mt-1.5 text-sm leading-6 text-[var(--text-3)]">{subtitle}</p>
                  ) : null}
                </div>
                <div className="shrink-0 pt-1">
                  <NotificationBell />
                </div>
              </div>
            </header>
          )}
          <PushPromptBanner />
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

      {/* The Desk — persistent internal aggregator drawer (fixed to the viewport). */}
      <DeskDrawer sidebarCollapsed={collapsed} />
    </div>
  );
}

function ExpandedRail({
  pathname,
  primaryNav,
  secondaryNav,
  viewAs,
  viewAsUser,
  setViewAs,
  setViewAsUser,
  isAdmin,
  collapsed,
  onToggleCollapsed,
}: {
  pathname: string | null;
  primaryNav: ReadonlyArray<NavItem>;
  secondaryNav: ReadonlyArray<NavItem>;
  viewAs: ViewAsRole;
  viewAsUser: ViewAsUser | null;
  setViewAs: (role: "STAFF" | "DEVELOPER" | null) => void;
  setViewAsUser: (name: string, permissions: string[], role?: string, id?: string) => void;
  isAdmin: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-[var(--border-2)] px-3 pb-5 pt-7",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/foundry-logo.svg" alt="Foundry" width={245} height={64} className="h-12 w-auto dark:brightness-0 dark:invert" />
        ) : null}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
        >
          {collapsed ? (
            <ChevronDoubleRightIcon className="h-4 w-4" />
          ) : (
            <ChevronDoubleLeftIcon className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <nav className="space-y-1">
            {primaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
                collapsed={collapsed}
              />
            ))}
          </nav>

          <div className="space-y-1">
            {secondaryNav.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                active={Boolean(item.href && isActivePath(pathname, item.href))}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>

        <div className="mt-4">
          {!collapsed ? <AiSpendCard /> : null}
          <div className="space-y-2">
            <SidebarNavItem
              item={{
                href: "/app/handbook",
                label: "Handbook",
                description: "Developer knowledgebase",
                icon: BookOpenIcon,
              }}
              active={Boolean(isActivePath(pathname, "/app/handbook"))}
              collapsed={collapsed}
            />
            <SidebarNavItem
              item={{ href: "/app/settings/account", label: "Settings", icon: Cog8ToothIcon }}
              active={Boolean(isActivePath(pathname, "/app/settings"))}
              collapsed={collapsed}
            />
            <ProfileMenu
              viewAs={viewAs}
              viewAsUser={viewAsUser}
              setViewAs={setViewAs}
              setViewAsUser={setViewAsUser}
              isAdmin={isAdmin}
              collapsed={collapsed}
            />
          </div>
          <AppVersion collapsed={collapsed} />
        </div>
      </div>
    </div>
  );
}

function AppVersion({ collapsed }: { collapsed: boolean }) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;
  // Format the build stamp in the viewer's local time so timezones read naturally.
  // Guarded so a bad/missing env doesn't crash the sidebar.
  const built = (() => {
    if (!buildTime) return null;
    const d = new Date(buildTime);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  })();
  if (collapsed) {
    return (
      <p
        title={built ? `v${version} · ${built}` : `v${version}`}
        className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-4)]"
      >
        v{version}
      </p>
    );
  }
  return (
    <p className="mt-3 border-t border-[var(--border-3)] pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">
      v{version}
      {built ? <span className="ml-1.5 normal-case tracking-normal text-[var(--text-4)]">· {built}</span> : null}
    </p>
  );
}

function SidebarNavItem({
  item,
  active,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  /** Icon-only mode for the collapsed sidebar rail. */
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const classes = cn(
    "flex w-full items-start gap-3 rounded-[6px] border px-3 py-2 text-sm font-medium transition",
    collapsed && "items-center justify-center px-2 py-2.5",
    active
      ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)] shadow-[var(--shadow-xs)]"
      : "border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
    item.disabled ? "cursor-default opacity-70 hover:bg-transparent" : "",
  );

  const icon = (
    <Icon
      className={cn(
        collapsed ? "h-5 w-5 shrink-0" : "mt-0.5 h-5 w-5 shrink-0",
        active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]",
      )}
    />
  );

  const content = collapsed ? (
    icon
  ) : (
    <>
      {icon}
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
      <div aria-disabled="true" className={classes} title={collapsed ? item.label : undefined}>
        {content}
      </div>
    );
  }

  return (
    <Link href={item.href} className={classes} title={collapsed ? item.label : undefined}>
      {content}
    </Link>
  );
}

function Avatar({ name, url, position }: { name: string; url: string; position?: string }) {
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
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        className="h-9 w-9 rounded-full object-cover"
        style={position ? { objectPosition: position } : undefined}
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
  viewAsUser,
  setViewAs,
  setViewAsUser,
  isAdmin,
  collapsed = false,
}: {
  viewAs: ViewAsRole;
  viewAsUser: ViewAsUser | null;
  setViewAs: (role: "STAFF" | "DEVELOPER" | null) => void;
  setViewAsUser: (name: string, permissions: string[], role?: string, id?: string) => void;
  isAdmin: boolean;
  collapsed?: boolean;
}) {
  const { data: session } = useSession();
  const accountQuery = useAccount();
  const account = accountQuery.data;
  const [open, setOpen] = useState(false);

  // Fetch team members so we can show real admin users in the preview switcher
  const { data: teamData } = useQuery({
    queryKey: ["team-members"],
    queryFn: listTeamMembers,
    enabled: isAdmin && open, // only fetch when the menu is open
    staleTime: 1000 * 60 * 5,
  });
  // Only show admins who have actual restrictions (non-empty permissions array).
  // Full-access admins (empty = Super Admin equivalent) are identical to your own view — no point previewing.
  // Also exclude the bootstrap placeholder (owner@gitwork.io) and yourself.
  const BOOTSTRAP_EMAIL = "owner@gitwork.io";
  const selectableMembers = (teamData?.members ?? []).filter(
    (m) => m.email !== session?.user?.email && m.email !== BOOTSTRAP_EMAIL,
  );
  const adminMembers = selectableMembers.filter(
    (m) => m.role === "ADMIN" && m.permissions.length > 0,
  );
  // Individual staff + developers — drill into one teammate to see their exact view.
  const teammateMembers = selectableMembers.filter(
    (m) => m.role === "STAFF" || m.role === "DEVELOPER",
  );

  // Identity reads from the live Google session by default. The account hook supplies the
  // user's custom avatar (if they've uploaded one in Account settings); React Query caches
  // it aggressively so it's a once-per-session fetch in practice.
  const displayName = session?.user?.name || "";
  const displayEmail = session?.user?.email || "";
  const resolvedAvatar = resolveAvatar(account?.avatarUrl, session?.user?.image);
  const displayAvatar = resolvedAvatar.src;
  const displayAvatarPosition = avatarPosition(account?.avatarPosition);
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
        title={collapsed ? displayName : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-3 text-left transition hover:bg-[var(--surface-1)]",
          collapsed && "justify-center px-2",
        )}
      >
        <Avatar name={displayName} url={displayAvatar} position={displayAvatarPosition} />
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-1)]">{displayName}</p>
              <p className="truncate text-xs text-[var(--text-4)]">{displayEmail}</p>
            </div>
            <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute bottom-[calc(100%+12px)] z-50 max-h-[70vh] overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-2 shadow-[var(--shadow-lg)]",
            collapsed ? "left-0 w-72" : "left-0 right-0",
          )}
        >

          {/* View as — Super Admin only, tucked away */}
          {isAdmin && (
            <div className="mb-1 border-b border-[var(--border-3)] pb-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                View platform as
              </p>

              {/* Super Admin — always first, clears any preview */}
              <button
                type="button"
                onClick={() => { setViewAs(null); setOpen(false); }}
                className={`flex w-full items-start justify-between gap-2 rounded-[6px] px-3 py-2 text-left transition ${
                  viewAs === null ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                }`}
              >
                <div>
                  <p className={`text-sm ${viewAs === null ? "font-semibold" : "font-medium"}`}>Super Admin (you)</p>
                  <p className={`text-[11px] ${viewAs === null ? "text-[var(--brand-500)]" : "text-[var(--text-4)]"}`}>Full platform access</p>
                </div>
                {viewAs === null && <span className="mt-1 shrink-0 text-[10px] text-[var(--brand-700)]">●</span>}
              </button>

              {/* Real admin users — each with their actual stored permissions */}
              {adminMembers.length > 0 && (
                <div className="my-1 border-t border-[var(--border-3)] pt-1">
                  <p className="px-3 pb-0.5 text-[9px] font-medium uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    Admins
                  </p>
                  {adminMembers.map((m) => {
                    const label = m.name ?? m.email;
                    const active = viewAs === "USER" && viewAsUser?.name === label;
                    const perms = m.permissions as string[];
                    return (
                      <button
                        key={m.memberId}
                        type="button"
                        onClick={() => { setViewAsUser(label, perms, m.role, m.userId); setOpen(false); }}
                        className={`flex w-full items-start justify-between gap-2 rounded-[6px] px-3 py-2 text-left transition ${
                          active ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                        }`}
                      >
                        <div>
                          <p className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>{m.name}</p>
                          <p className={`text-[11px] ${active ? "text-[var(--brand-500)]" : "text-[var(--text-4)]"}`}>
                            {perms.length === 0 ? "Full access" : `${perms.length} module${perms.length !== 1 ? "s" : ""} enabled`}
                          </p>
                        </div>
                        {active && <span className="mt-1 shrink-0 text-[10px] text-[var(--brand-700)]">●</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Individual teammates — drill into a specific staff member or developer via a dropdown */}
              {teammateMembers.length > 0 && (
                <div className="my-1 border-t border-[var(--border-3)] pt-1">
                  <p className="px-3 pb-1 text-[9px] font-medium uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                    Specific teammate
                  </p>
                  <div className="px-3 pb-1">
                    <select
                      value={
                        viewAs === "USER" && teammateMembers.some((m) => (m.name ?? m.email) === viewAsUser?.name)
                          ? viewAsUser?.name ?? ""
                          : ""
                      }
                      onChange={(e) => {
                        const m = teammateMembers.find((x) => (x.name ?? x.email) === e.target.value);
                        if (!m) return;
                        setViewAsUser(m.name ?? m.email, m.permissions as string[], m.role, m.userId);
                        setOpen(false);
                      }}
                      className="app-select-compact w-full text-sm"
                    >
                      <option value="">Select a teammate…</option>
                      {teammateMembers.map((m) => {
                        const label = m.name ?? m.email;
                        const perms = m.permissions as string[];
                        const roleTag = m.role === "STAFF" ? "Staff" : "Developer";
                        const modules = perms.length === 0 ? "no modules" : `${perms.length} module${perms.length !== 1 ? "s" : ""}`;
                        return (
                          <option key={m.memberId} value={label}>
                            {label} — {roleTag}, {modules}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {/* Preset role previews */}
              <div className="my-1 border-t border-[var(--border-3)] pt-1">
                <p className="px-3 pb-0.5 text-[9px] font-medium uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                  Preset roles
                </p>
                {(["STAFF", "DEVELOPER"] as const).map((role) => {
                  const label = role === "STAFF" ? "Staff" : "Developer";
                  const desc = role === "STAFF" ? "All modules, no admin tools" : "Task board + assigned clients only";
                  const active = viewAs === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => { setViewAs(role); setOpen(false); }}
                      className={`flex w-full items-start justify-between gap-2 rounded-[6px] px-3 py-2 text-left transition ${
                        active ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                      }`}
                    >
                      <div>
                        <p className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>{label}</p>
                        <p className={`text-[11px] ${active ? "text-[var(--brand-500)]" : "text-[var(--text-4)]"}`}>{desc}</p>
                      </div>
                      {active && <span className="mt-1 shrink-0 text-[10px] text-[var(--brand-700)]">●</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Appearance — quick Light / Dark / System toggle */}
          <div className="mb-1 flex items-center justify-between gap-2 border-b border-[var(--border-3)] px-3 py-2">
            <span
              className="text-[10px] font-medium uppercase tracking-[1px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Theme
            </span>
            <ThemeToggle iconOnly />
          </div>

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
