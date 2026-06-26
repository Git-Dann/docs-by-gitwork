"use client";

// Shared contact/identity form controls used by the client forms:
//  - CountrySelect: full country dropdown, United Kingdom pinned at the top.
//  - PhoneInput: country dial-code selector + national-number input (leading 0 stripped).
//  - WebsiteInput: hides the https:// scheme, auto-prefixes it, cleanses pasted URLs.

import { useState } from "react";
import { cn } from "@/lib/format";
import { COUNTRIES, DIAL_BY_ISO, flagEmoji, parsePhone } from "@/lib/countries";

export function CountrySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const known = value && COUNTRIES.some((c) => c.name === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("app-select", className)}
    >
      <option value="">— Select country —</option>
      {/* Quick-select: UK first (most common), then a divider into the full list. */}
      <option value="United Kingdom">United Kingdom</option>
      <option disabled>──────────────</option>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.name}>
          {c.name}
        </option>
      ))}
      {/* Preserve a stored value that isn't in the list rather than silently dropping it. */}
      {value && !known ? <option value={value}>{value}</option> : null}
    </select>
  );
}

export function PhoneInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [iso, setIso] = useState(() => parsePhone(value).iso);
  const [national, setNational] = useState(() => parsePhone(value).national);

  function emit(nextIso: string, rawNational: string) {
    // Strip leading zeros so a stored "+44 7903…" never carries the trunk 0.
    const cleaned = rawNational.replace(/^0+/, "");
    setIso(nextIso);
    setNational(cleaned);
    const dial = DIAL_BY_ISO[nextIso] ?? "+44";
    onChange(cleaned.trim() ? `${dial} ${cleaned.trim()}` : "");
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <select
        value={iso}
        onChange={(e) => emit(e.target.value, national)}
        className="app-select w-24 shrink-0 px-2"
        aria-label="Country dial code"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {flagEmoji(c.code)} {c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        value={national}
        onChange={(e) => emit(iso, e.target.value)}
        className="app-input flex-1"
        placeholder="7903 076159"
      />
    </div>
  );
}

export function WebsiteInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  // Display without the scheme; store with https:// (cleansing any pasted scheme).
  const display = (value ?? "").replace(/^https?:\/\//i, "");
  function handle(raw: string) {
    const cleaned = raw.replace(/^https?:\/\//i, "").trim();
    onChange(cleaned ? `https://${cleaned}` : "");
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-4)]">
        https://
      </span>
      <input
        type="text"
        inputMode="url"
        value={display}
        onChange={(e) => handle(e.target.value)}
        className={cn("app-input pl-[4.5rem]", className)}
        placeholder={placeholder ?? "client.com"}
      />
    </div>
  );
}
