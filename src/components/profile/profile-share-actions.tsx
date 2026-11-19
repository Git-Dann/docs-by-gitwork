"use client";

/**
 * Sharing a public profile (CLAUDE.md §139). Every profile has a QR code of its page, so someone
 * can be handed your profile in person. On a phone it lives in a Share sheet behind one tile on
 * the links row; on a desktop it sits in the sidebar. Both offer the same three things: the
 * device's share sheet (or copy the link), and Save contact, a vCard carrying only what the page
 * already shows (name, role, company, links), never an email or a phone number.
 */
import { useState } from "react";
import { ArrowUpOnSquareIcon, CheckIcon, LinkIcon, QrCodeIcon, UserPlusIcon, WalletIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { QrCode } from "./profile-card";

/** Which wallets are switched on for this server, and the profile they're for. */
export interface WalletOffer {
  slug: string;
  apple: boolean;
  google: boolean;
}

/**
 * Add to Apple Wallet / Add to Google Wallet. Google's is Google's own badge
 * (public/brand/add-to-google-wallet.svg, from its brand pack). Apple's official badge is behind
 * Apple's Wallet marketing agreement, so until it's downloaded and added this is a plain text
 * button with no Apple mark: never a redrawn logo.
 */
function WalletButtons({ wallet }: { wallet: WalletOffer }) {
  if (!wallet.apple && !wallet.google) return null;
  const base = `/api/u/${encodeURIComponent(wallet.slug)}/wallet`;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2">
      {wallet.apple ? (
        <a href={`${base}/apple`} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] bg-black px-3 text-[14px] font-medium text-white">
          <WalletIcon aria-hidden className="h-5 w-5" />
          Add to Apple Wallet
        </a>
      ) : null}
      {wallet.google ? (
        <a href={`${base}/google`} className="mx-auto block" aria-label="Add to Google Wallet">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/add-to-google-wallet.svg" alt="Add to Google Wallet" width={226} height={40} className="h-10 w-auto" />
        </a>
      ) : null}
    </div>
  );
}

export interface ProfileShareData {
  name: string;
  headline: string | null;
  company: string;
  links: { label: string; url: string }[];
}

/** vCard 3.0 text. Values are escaped per RFC 6350 (backslash, comma, semicolon, newline). */
export function profileVCard(p: ProfileShareData, pageUrl: string): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  const parts = p.name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1]! : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(p.name)}`,
    `ORG:${esc(p.company)}`,
    ...(p.headline ? [`TITLE:${esc(p.headline)}`] : []),
    `URL:${pageUrl}`,
    ...p.links.map((l) => `URL;TYPE=${esc(l.label)}:${l.url}`),
    "END:VCARD",
  ].join("\r\n");
}

function useShare(data: ProfileShareData, pageUrl: string) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", pageUrl);
    }
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data.name} · ${data.company}`, url: pageUrl });
        return;
      } catch {
        // Cancelled, or not allowed: fall through to copying.
      }
    }
    await copy();
  }
  function saveContact() {
    const blob = new Blob([profileVCard(data, pageUrl)], { type: "text/vcard;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "contact"}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return { copied, copy, share, saveContact };
}

const btn =
  "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 text-[14px] font-medium text-[var(--text-1)] transition hover:border-[var(--brand-500)]";

/** The QR code with the three actions under it: the sheet's body, and the desktop sidebar. */
export function ProfileSharePanel({ data, pageUrl, wallet }: { data: ProfileShareData; pageUrl: string; wallet?: WalletOffer }) {
  const s = useShare(data, pageUrl);
  return (
    <div>
      <div className="mx-auto w-full max-w-[200px] rounded-[14px] border border-[var(--border-1)] bg-white p-2.5">
        <QrCode value={pageUrl} className="block h-auto w-full" />
      </div>
      <p className="mt-2 text-center text-[12px] text-[var(--text-3)]">Scan to open this profile</p>
      <p className="mt-0.5 truncate text-center text-[12px] text-[var(--text-4)]" title={pageUrl} style={{ fontFamily: "var(--font-mono)" }}>
        {pageUrl.replace(/^https?:\/\//, "")}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2">
        <button type="button" className={btn} onClick={() => void s.copy()}>
          {s.copied ? <CheckIcon aria-hidden className="h-5 w-5 text-[var(--success-500)]" /> : <LinkIcon aria-hidden className="h-5 w-5" />}
          {s.copied ? "Link copied" : "Copy link"}
        </button>
        <button type="button" className={btn} onClick={() => void s.share()}>
          <ArrowUpOnSquareIcon aria-hidden className="h-5 w-5" />
          Share profile
        </button>
        <button type="button" className={btn} onClick={s.saveContact}>
          <UserPlusIcon aria-hidden className="h-5 w-5" />
          Save contact
        </button>
      </div>
      {wallet ? <WalletButtons wallet={wallet} /> : null}
    </div>
  );
}

/** One tile on the phone's links row that opens the Share sheet. */
export function ProfileShareTile({ data, pageUrl, wallet }: { data: ProfileShareData; pageUrl: string; wallet?: WalletOffer }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Share profile and QR code"
        className="group ml-auto flex w-[56px] flex-col items-center gap-1.5 rounded-[12px] transition hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-[12px] border border-[var(--border-3)] bg-[var(--surface-1)] text-[var(--brand-700)] transition group-hover:border-[var(--brand-500)]">
          <QrCodeIcon aria-hidden className="h-6 w-6" />
        </span>
        <span className="w-full truncate text-center text-[11px] text-[var(--text-3)]">Share</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Share profile" panelClassName="max-w-[360px]">
        <div className="p-5">
          <ProfileSharePanel data={data} pageUrl={pageUrl} wallet={wallet} />
        </div>
      </Modal>
    </>
  );
}
