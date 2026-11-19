"use client";

/**
 * Share and Save contact on a public profile (CLAUDE.md §139). Built for phones: Share opens the
 * device's own share sheet (copy the link where there isn't one), and Save contact downloads a
 * vCard so someone can keep you in their contacts. The vCard carries only what the page already
 * shows (name, role, company, links): never an email or a phone number.
 */
import { useState } from "react";
import { ArrowUpOnSquareIcon, UserPlusIcon } from "@heroicons/react/24/outline";

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

const btn =
  "inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold transition";

export function ProfileShareActions({ data }: { data: ProfileShareData }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data.name} · ${data.company}`, url });
        return;
      } catch {
        // Cancelled, or not allowed: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  function saveContact() {
    const blob = new Blob([profileVCard(data, window.location.href)], { type: "text/vcard;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "contact"}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={() => void share()} className={`${btn} bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)]`}>
        <ArrowUpOnSquareIcon aria-hidden className="h-5 w-5" />
        {copied ? "Link copied" : "Share profile"}
      </button>
      <button
        type="button"
        onClick={saveContact}
        className={`${btn} border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-1)] hover:border-[var(--brand-500)]`}
      >
        <UserPlusIcon aria-hidden className="h-5 w-5" />
        Save contact
      </button>
    </div>
  );
}
