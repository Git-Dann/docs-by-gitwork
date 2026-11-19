"use client";

/**
 * Design your business card (Backstage → Me → Public profile, CLAUDE.md §139): layout, font,
 * colour and pattern, with a live card above that tilts and turns over just like the page's.
 * Every option is shown as itself, drawn with your own name, not as an abstract swatch.
 */
import { useState } from "react";
import { CardFace, ProfileBusinessCard, type CardPerson } from "@/components/profile/profile-card";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/format";
import { CARD_COLOURS, CARD_FONTS, CARD_LAYOUTS, CARD_PATTERNS, DEFAULT_CARD, type ProfileCard } from "@/lib/profile-card";

type Tab = "layout" | "font" | "colour" | "pattern";
const TABS = [
  { value: "layout", label: "Layout" },
  { value: "font", label: "Font" },
  { value: "colour", label: "Colour" },
  { value: "pattern", label: "Pattern" },
] as const;

function Thumb({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={cn(
        "group flex flex-col gap-1.5 rounded-[10px] p-1 text-left transition",
        selected ? "bg-[var(--brand-50)]" : "hover:bg-[var(--surface-1)]",
      )}
    >
      <span
        className={cn(
          "block overflow-hidden rounded-[8px] [container-type:inline-size] ring-1 transition",
          selected ? "ring-2 ring-[var(--brand-600)]" : "ring-[var(--border-2)] group-hover:ring-[var(--border-3)]",
        )}
        style={{ aspectRatio: "1.75 / 1" }}
      >
        {children}
      </span>
      <span className={cn("truncate px-0.5 text-[12px]", selected ? "font-medium text-[var(--brand-700)]" : "text-[var(--text-3)]")}>{label}</span>
    </button>
  );
}

export function ProfileCardDesigner({
  card,
  person,
  url,
  onChange,
}: {
  card: ProfileCard | null;
  person: CardPerson;
  url: string;
  onChange: (card: ProfileCard | null) => void;
}) {
  const [tab, setTab] = useState<Tab>("layout");
  const on = card !== null;
  const c = card ?? DEFAULT_CARD;
  const set = (patch: Partial<ProfileCard>) => onChange({ ...c, ...patch });

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand-600)]" checked={on} onChange={(e) => onChange(e.target.checked ? c : null)} />
        <span>
          <span className="block text-[13px] font-medium text-[var(--text-1)]">Business card</span>
          <span className="block text-[12px] text-[var(--text-3)]">
            The top of your page becomes a card you design. Tap it to turn it over to a QR code, for meeting people in person.
          </span>
        </span>
      </label>

      {on ? (
        <>
          <div className="mx-auto w-full max-w-[420px]">
            <ProfileBusinessCard card={c} person={person} url={url} />
          </div>
          <Segmented label="Card options" options={TABS} value={tab} onChange={setTab} className="w-full justify-between sm:w-auto" />

          {tab === "layout" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CARD_LAYOUTS.map((o) => (
                <Thumb key={o.id} label={o.label} selected={c.layout === o.id} onClick={() => set({ layout: o.id })}>
                  <CardFace card={{ ...c, layout: o.id }} person={person} />
                </Thumb>
              ))}
            </div>
          ) : tab === "font" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CARD_FONTS.map((o) => (
                <Thumb key={o.id} label={o.label} selected={c.font === o.id} onClick={() => set({ font: o.id })}>
                  <CardFace card={{ ...c, font: o.id }} person={person} />
                </Thumb>
              ))}
            </div>
          ) : tab === "colour" ? (
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2.5">
              {CARD_COLOURS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={c.colour === o.id}
                  title={o.label}
                  onClick={() => set({ colour: o.id })}
                  className={cn(
                    "relative h-10 w-10 rounded-full ring-1 ring-[var(--border-2)] transition",
                    c.colour === o.id && "ring-2 ring-[var(--brand-600)] ring-offset-2 ring-offset-[var(--surface-0)]",
                  )}
                  style={{ background: `linear-gradient(135deg, ${o.bg} 50%, ${o.fg} 50%)` }}
                >
                  <span className="sr-only">{o.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CARD_PATTERNS.map((o) => (
                <Thumb key={o.id} label={o.label} selected={c.pattern === o.id} onClick={() => set({ pattern: o.id })}>
                  <CardFace card={{ ...c, pattern: o.id }} person={person} />
                </Thumb>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
