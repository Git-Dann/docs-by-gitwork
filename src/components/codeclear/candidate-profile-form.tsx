"use client";

import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTechStacks } from "@/hooks/use-codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { cn } from "@/lib/format";
import {
  TECH_STACK_OPTIONS,
  type CandidateAvailability,
  type CandidateOrigin,
} from "@/types/codeclear";
import { ClientAvatar } from "@/components/codeclear/client-avatar";

export interface CandidateProfileValue {
  name: string;
  githubHandle: string;
  email: string;
  primaryStack: string;
  techStacks: string[];
  location: string;
  bio: string;
  linkedinUrl: string;
  cvUrl: string;
  portfolioUrl: string;
  yearsExperience: string;
  hourlyRate: string;
  currency: string;
  timezone: string;
  availability: CandidateAvailability | "";
  origin: CandidateOrigin;
  /** Pre-create client assignment — Portal client IDs to attach to this dev. */
  clientIds: string[];
}

export const emptyCandidateProfile: CandidateProfileValue = {
  name: "",
  githubHandle: "",
  email: "",
  primaryStack: "",
  techStacks: [],
  location: "",
  bio: "",
  linkedinUrl: "",
  cvUrl: "",
  portfolioUrl: "",
  yearsExperience: "",
  hourlyRate: "",
  currency: "USD",
  timezone: "",
  availability: "",
  origin: "INTERNAL",
  clientIds: [],
};

const COMMON_CURRENCIES = ["USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD"] as const;

const AVAILABILITY_LABELS: Record<CandidateAvailability, string> = {
  AVAILABLE: "Available",
  ENGAGED: "Engaged",
  UNAVAILABLE: "Unavailable",
};

/**
 * Shared add + edit form for a Candidate. Controlled: hand it `value` +
 * `onChange` and you own state. Used by both the Add Dev modal in the
 * candidates workspace and the Edit modal on the profile page.
 *
 * The "Clients" section + admin origin toggle are gated by props because
 * the profile page already has a live current-client picker in the hero
 * and shouldn't double-up.
 */
export function CandidateProfileForm({
  value,
  onChange,
  showOriginToggle = false,
  showClientsPicker = false,
}: {
  value: CandidateProfileValue;
  onChange: (next: CandidateProfileValue) => void;
  /** Admin-only toggle. Surface in Settings or the Drawer's admin section. */
  showOriginToggle?: boolean;
  /** Pre-create client assignment. Off by default so the Edit modal doesn't
   *  duplicate the live picker on the profile hero. */
  showClientsPicker?: boolean;
}) {
  const stacksQuery = useTechStacks();
  const stackOptions =
    stacksQuery.data?.stacks.map((stack) => stack.name) ?? TECH_STACK_OPTIONS;

  function patch<K extends keyof CandidateProfileValue>(key: K, next: CandidateProfileValue[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    // Two-column outer grid on wide screens, stacked on narrow.
    // Sections each pick whether to span 1 column or both via `span`.
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
      {/* Identity */}
      <Section title="Identity" span="full">
        <Field label="Name">
          <input
            value={value.name}
            onChange={(event) => patch("name", event.target.value)}
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="GitHub handle">
          <input
            value={value.githubHandle}
            onChange={(event) => patch("githubHandle", event.target.value.replace(/^@+/, ""))}
            placeholder="username"
            className="app-input font-mono"
            autoComplete="off"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={value.email}
            onChange={(event) => patch("email", event.target.value)}
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="Location">
          <input
            value={value.location}
            onChange={(event) => patch("location", event.target.value)}
            className="app-input"
            autoComplete="off"
          />
        </Field>
      </Section>

      {/* Tech */}
      <Section title="Tech stack" span="half">
        <Field label="Primary stack" span="full">
          <input
            value={value.primaryStack}
            onChange={(event) => patch("primaryStack", event.target.value)}
            placeholder="e.g. TypeScript, Swift"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <div className="col-span-full">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
            Additional stacks
          </p>
          <div className="mt-2">
            <TagChipPicker
              options={stackOptions}
              selected={value.techStacks}
              onChange={(next) => patch("techStacks", next)}
              placeholder="No additional stacks"
            />
          </div>
        </div>
      </Section>

      {/* Clients (create-time only) — multi-select dropdown.
          One control to pick all the clients this dev is engaged with
          right now. They land in those clients' columns in the Pipeline. */}
      {showClientsPicker ? (
        <Section title="Clients" span="half">
          <Field label="Current clients" span="full">
            <ClientMultiSelect
              selectedIds={value.clientIds}
              onChange={(next) => patch("clientIds", next)}
            />
            <span className="mt-1 block text-[11px] text-[var(--text-4)]">
              Optional. Devs land in these clients&apos; columns in the Pipeline.
            </span>
          </Field>
        </Section>
      ) : null}

      {/* Profile links */}
      <Section title="Profile links" span="half">
        <Field label="LinkedIn URL">
          <input
            value={value.linkedinUrl}
            onChange={(event) => patch("linkedinUrl", event.target.value)}
            placeholder="https://linkedin.com/in/…"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="CV URL">
          <input
            value={value.cvUrl}
            onChange={(event) => patch("cvUrl", event.target.value)}
            placeholder="https://…"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        <Field label="Portfolio URL" span="full">
          <input
            value={value.portfolioUrl}
            onChange={(event) => patch("portfolioUrl", event.target.value)}
            placeholder="https://…"
            className="app-input"
            autoComplete="off"
          />
        </Field>
      </Section>

      {/* Rate & availability */}
      <Section title="Rate & availability" span="half">
        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            max={60}
            value={value.yearsExperience}
            onChange={(event) => patch("yearsExperience", event.target.value)}
            className="app-input"
          />
        </Field>
        <Field label="Timezone">
          <input
            value={value.timezone}
            onChange={(event) => patch("timezone", event.target.value)}
            placeholder="e.g. Europe/London"
            className="app-input"
            autoComplete="off"
          />
        </Field>
        {/* Hourly rate: explicit grid track for the currency (110px) + 1fr
            for the number input. `flex-1` on the input wasn't winning
            against the `app-input` class's intrinsic sizing — using a CSS
            grid with a fixed first track is unambiguous. USD sits on the
            left, the number on the right. */}
        <Field label="Hourly rate" span="full">
          <div className="grid grid-cols-[110px_1fr] gap-1.5">
            <select
              value={value.currency}
              onChange={(event) => patch("currency", event.target.value.toUpperCase())}
              // `app-select` reserves ~38px on the right for the chevron icon;
              // explicit `pr-9` keeps the 3-letter ISO code clear of it.
              className="app-select pr-9"
              aria-label="Currency"
            >
              {COMMON_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={value.hourlyRate}
              onChange={(event) => patch("hourlyRate", event.target.value)}
              className="app-input w-full"
              placeholder="0"
            />
          </div>
        </Field>
        {/* Full-width so "Auto (from placements)" never truncates behind the
            chevron — the placeholder was getting clipped to "Auto (from placem…". */}
        <Field label="Availability" span="full">
          <select
            value={value.availability}
            onChange={(event) =>
              patch("availability", event.target.value as CandidateAvailability | "")
            }
            className="app-select pr-9"
          >
            <option value="">Auto (from placements)</option>
            {(Object.keys(AVAILABILITY_LABELS) as CandidateAvailability[]).map((entry) => (
              <option key={entry} value={entry}>
                {AVAILABILITY_LABELS[entry]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Bio */}
      <Section title="About" span="full">
        <Field label="Bio" span="full">
          <textarea
            value={value.bio}
            onChange={(event) => patch("bio", event.target.value)}
            rows={3}
            className="app-input min-h-[88px] resize-y"
            placeholder="A short note about this dev — strengths, focus areas, anything worth remembering."
          />
        </Field>
      </Section>

      {showOriginToggle ? (
        <Section title="Origin (admin)" span="full">
          <Field label="Roster" span="full">
            <div className="flex gap-1.5">
              {(["INTERNAL", "EXTERNAL"] as const).map((origin) => (
                <button
                  key={origin}
                  type="button"
                  onClick={() => patch("origin", origin)}
                  className={cn(
                    "rounded-[6px] border px-3 py-1.5 text-xs font-semibold transition",
                    value.origin === origin
                      ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:border-[var(--border-1)]",
                  )}
                >
                  {origin === "INTERNAL" ? "Internal (Gitwork team)" : "External (catalogue)"}
                </button>
              ))}
            </div>
          </Field>
        </Section>
      ) : null}
    </div>
  );
}

/**
 * Section block. `span` decides whether the section occupies one column
 * of the outer 2-col grid ("half") or both ("full"). On narrow screens
 * the outer grid collapses to one column, so span is a no-op there.
 */
function Section({
  title,
  children,
  span = "full",
}: {
  title: string;
  children: React.ReactNode;
  span?: "half" | "full";
}) {
  return (
    <div className={span === "full" ? "lg:col-span-2" : "lg:col-span-1"}>
      <p className="widget-data-label mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  span = "half",
}: {
  label: string;
  children: React.ReactNode;
  span?: "half" | "full";
}) {
  return (
    <label className={cn("space-y-1.5", span === "full" ? "col-span-full" : "")}>
      <span className="text-xs font-medium text-[var(--text-3)]">{label}</span>
      {children}
    </label>
  );
}

// ─── Tag chip picker ──────────────────────────────────────────────────────────

/**
 * Generic chip picker: shows selected tags as chips with × to remove, plus a
 * "+ Add" button that opens a searchable portal dropdown of the unselected
 * options. Same UX as CurrentClientPicker but pure-controlled (no mutations).
 */
function TagChipPicker({
  options,
  selected,
  onChange,
  placeholder = "None selected",
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const available = options.filter(
    (option) =>
      !selected.includes(option) &&
      (!search.trim() || option.toLowerCase().includes(search.toLowerCase())),
  );

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      setSearch("");
      return;
    }
    function reposition() {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!menuRef.current || !btnRef.current) return;
      const target = event.target as Node;
      if (menuRef.current.contains(target) || btnRef.current.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function add(option: string) {
    onChange([...selected, option]);
    setSearch("");
  }
  function remove(option: string) {
    onChange(selected.filter((entry) => entry !== option));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.length === 0 ? (
        <span className="text-xs italic text-[var(--text-4)]">{placeholder}</span>
      ) : (
        selected.map((option) => (
          <span
            key={option}
            className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-2)]"
          >
            {option}
            <button
              type="button"
              onClick={() => remove(option)}
              aria-label={`Remove ${option}`}
              className="rounded-full text-[var(--text-4)] transition hover:text-rose-500"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))
      )}

      {options.some((o) => !selected.includes(o)) ? (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-0.5 rounded-[4px] border border-dashed border-[var(--border-1)] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)] hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]"
          aria-expanded={open}
        >
          <PlusIcon className="h-3 w-3" />
          Add
        </button>
      ) : null}

      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                minWidth: menuPosition.width,
                zIndex: 9999,
              }}
              className="rounded-[8px] border border-[var(--border-2)] bg-white p-1.5 shadow-[var(--shadow-lg)]"
            >
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search…"
                className="app-input mb-1 h-8 w-full text-xs"
                autoFocus
              />
              <ul className="max-h-[220px] overflow-y-auto">
                {available.length === 0 ? (
                  <li className="px-2.5 py-1.5 text-xs italic text-[var(--text-4)]">
                    No matches
                  </li>
                ) : (
                  available.map((option) => (
                    <li key={option}>
                      <button
                        type="button"
                        onClick={() => add(option)}
                        className="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        {option}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ─── Client multi-select dropdown (pure controlled) ──────────────────────────

/**
 * Multi-select dropdown for clients. Looks like a single `app-select`
 * control — clicking opens a portal-positioned panel with a search input
 * and a checkbox per client. Toggling a row updates selection without
 * closing the panel (true multi-select). Pure-controlled.
 */
function ClientMultiSelect({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const clientsQuery = useClientList();
  const clients = clientsQuery.data?.clients ?? [];
  const selected = clients.filter((client) => selectedIds.includes(client.id));

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const filtered = clients.filter(
    (client) =>
      !search.trim() || client.name.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      setSearch("");
      return;
    }
    function reposition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!menuRef.current || !triggerRef.current) return;
      const target = event.target as Node;
      if (menuRef.current.contains(target) || triggerRef.current.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((existing) => existing !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  // Summary text for the trigger:
  //   0 selected   → placeholder
  //   1-2 selected → comma-joined names
  //   3+ selected  → "N clients selected"
  const summary =
    selected.length === 0
      ? clientsQuery.isLoading
        ? "Loading clients…"
        : "Select clients"
      : selected.length <= 2
        ? selected.map((c) => c.name).join(", ")
        : `${selected.length} clients selected`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        // Matches the `app-select` chrome so this reads as a dropdown field.
        // Left-aligned summary, pr-9 keeps the chevron clear of text.
        className="app-select flex w-full items-center pr-9 text-left text-xs"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={cn(
            "truncate",
            selected.length === 0 ? "text-[var(--text-4)]" : "text-[var(--text-1)]",
          )}
        >
          {summary}
        </span>
      </button>

      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                zIndex: 9999,
              }}
              className="rounded-[8px] border border-[var(--border-2)] bg-white p-1.5 shadow-[var(--shadow-lg)]"
              role="listbox"
              aria-multiselectable
            >
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search clients…"
                className="app-input mb-1 h-8 w-full text-xs"
                autoFocus
              />
              <ul className="max-h-[240px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="px-2.5 py-1.5 text-xs italic text-[var(--text-4)]">
                    {clients.length === 0 ? "No clients in workspace" : "No matches"}
                  </li>
                ) : (
                  filtered.map((client) => {
                    const checked = selectedIds.includes(client.id);
                    return (
                      <li key={client.id}>
                        <button
                          type="button"
                          onClick={() => toggle(client.id)}
                          role="option"
                          aria-selected={checked}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs font-medium transition hover:bg-[var(--surface-1)]",
                            checked ? "text-[var(--text-1)]" : "text-[var(--text-2)]",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            tabIndex={-1}
                            className="h-3.5 w-3.5 rounded-[3px] border-[var(--border-2)]"
                          />
                          <ClientAvatar name={client.name} logoUrl={client.logoUrl ?? null} size="sm" />
                          <span className="truncate">{client.name}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              {selected.length > 0 ? (
                <div className="mt-1 flex items-center justify-between border-t border-[var(--border-3)] px-2 pt-1.5">
                  <span className="text-[11px] text-[var(--text-4)]">
                    {selected.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-[11px] font-medium text-[var(--text-3)] transition hover:text-rose-500"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
