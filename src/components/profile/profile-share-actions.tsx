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

/** The same 56px tile as a profile link, so Share and Save sit on the links' row. */
const tile =
  "flex h-14 w-14 items-center justify-center rounded-[12px] border border-[var(--border-3)] bg-[var(--surface-1)] text-[var(--brand-700)] transition group-hover:border-[var(--brand-500)]";
const caption = "w-full truncate text-center text-[11px] text-[var(--text-3)]";
const cell = "group flex w-[56px] flex-col items-center gap-1.5 rounded-[12px] transition hover:-translate-y-0.5 focus-visible:-translate-y-0.5";

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
    <div className="ml-auto flex gap-x-1.5">
      <button type="button" onClick={() => void share()} aria-label="Share profile" className={cell}>
        <span className={tile}>
          <ArrowUpOnSquareIcon aria-hidden className="h-6 w-6" />
        </span>
        <span className={caption}>{copied ? "Copied" : "Share"}</span>
      </button>
      <button type="button" onClick={saveContact} aria-label="Save contact" className={cell}>
        <span className={tile}>
          <UserPlusIcon aria-hidden className="h-6 w-6" />
        </span>
        <span className={caption}>Save</span>
      </button>
    </div>
  );
}
