"use client";

/**
 * The banner at the top of every profile page in the app (a person on Staff, a Hiring
 * candidate): a band in the person's card colours, their photo overlapping it, name and
 * subtitle, the page's actions, a ⋯ menu for the rare ones, and tiles underneath.
 *
 * The pages own their data and actions; this owns the layout, so they can't drift apart.
 * Rare or risky actions (hide a page, merge two records, archive, delete) go in `menu`,
 * never as buttons: each opens its own confirm.
 */
import type { CSSProperties, ReactNode } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { CameraIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { Avatar } from "@/components/ui/avatar";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { Pattern } from "@/components/profile/profile-card";
import { cardColour, type ProfileCard } from "@/lib/profile-card";

/** The page's own look when a person hasn't designed a card: the same as the public page's. */
const DEFAULT_BAND: CSSProperties = {
  background: "radial-gradient(120% 160% at 0% 0%, var(--brand-500) 0%, transparent 60%), linear-gradient(135deg, var(--brand-700), #312E81)",
  color: "#fff",
};

export type BannerMenuItem = { label: string; onClick: () => void; danger?: boolean };

export function ProfileBannerShell({
  card = null,
  avatarUrl,
  name,
  title,
  subtitle,
  onChangePhoto,
  actions,
  menu = [],
  children,
}: {
  /** Their business card's colour and pattern; the brand gradient when they have none. */
  card?: ProfileCard | null;
  avatarUrl: string | null | undefined;
  name: string;
  /** Defaults to the name; pass a node to add a badge beside it. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Shows a camera button on the photo. Your own profile only. */
  onChangePhoto?: () => void;
  actions?: ReactNode;
  menu?: BannerMenuItem[];
  /** Tiles under the name row. */
  children?: ReactNode;
}) {
  const band = card ? cardColour(card.colour) : null;
  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-0)]" data-profile-banner>
      <div aria-hidden className="relative h-[92px] overflow-hidden sm:h-[112px]" style={band ? { background: band.bg, color: band.fg } : DEFAULT_BAND}>
        {card ? <Pattern id={card.pattern} /> : null}
      </div>

      <div className="px-5 pb-5 sm:px-6">
        {/* Items start at the band's edge, and the text and buttons sit 12px below it: the photo
            overlaps the band, the name never touches it. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-[260px] items-start gap-4">
            <div className="relative -mt-10 shrink-0 sm:-mt-12">
              <Avatar src={avatarUrl} name={name} size={88} className="ring-4 ring-[var(--surface-0)]" />
              {onChangePhoto ? (
                <button
                  type="button"
                  onClick={onChangePhoto}
                  aria-label="Change photo"
                  title="Change photo"
                  className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] shadow-sm hover:text-[var(--brand-700)]"
                >
                  <CameraIcon aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="min-w-0 pt-3">
              {title ?? (
                <h2 className="truncate font-display text-[26px] leading-[1.15] tracking-[-0.01em] text-[var(--text-1)] sm:text-[30px]" title={name}>
                  {name}
                </h2>
              )}
              {subtitle ? <div className="mt-0.5 text-[14px] text-[var(--text-3)]">{subtitle}</div> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
            {actions}
            {menu.length ? (
              <Menu>
                <MenuButton className="app-button app-button-secondary app-button-sm px-2" aria-label="More actions">
                  <EllipsisHorizontalIcon aria-hidden className="h-4 w-4" />
                </MenuButton>
                <MenuItems anchor="bottom end" className={`${menuPanel} w-52`}>
                  {menu.map((m) => (
                    <MenuItem key={m.label}>
                      <button type="button" onClick={m.onClick} className={`${menuItem} ${m.danger ? "text-[var(--danger-500)]" : ""}`}>
                        {m.label}
                      </button>
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            ) : null}
          </div>
        </div>

        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </section>
  );
}

/** A tile in the banner: a mono label, a status on the right, and its content. */
export function BannerTile({ label, status, children }: { label: string; status?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[var(--border-1)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="widget-data-label">{label}</span>
        {status ? <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--text-3)]">{status}</span> : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
