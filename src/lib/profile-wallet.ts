/**
 * A public profile as a wallet pass (CLAUDE.md §139): what goes on the Apple Wallet pass and the
 * Google Wallet pass. Pure: no keys, no network, so the content is tested without certificates.
 * Signing and serving are in src/server/profile-wallet.ts.
 *
 * Both passes carry only what the public page already shows: name, role, company, location, a
 * QR code of the page, the booking link and the person's links. Never an email or a phone number.
 */
import { cardColour, type ProfileCard } from "@/lib/profile-card";

export interface WalletPerson {
  slug: string;
  name: string;
  headline: string | null;
  company: string;
  location: string | null;
  pageUrl: string;
  bookingUrl: string | null;
  links: { label: string; url: string }[];
  card: ProfileCard | null;
}

/** "#1D4ED8" → "rgb(29, 78, 216)", the only colour form pass.json accepts. */
export function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** The pass's colours: the person's card when they have one, Foundry blue otherwise. */
export function walletColours(card: ProfileCard | null): { bg: string; fg: string } {
  return card ? cardColour(card.colour) : { bg: "#1D4ED8", fg: "#FFFFFF" };
}

/** The serial / object id: stable per profile, so re-adding updates rather than duplicates. */
export function walletPassId(slug: string): string {
  return `profile-${slug.replace(/[^a-z0-9-]/g, "")}`;
}

/** pass.json for an Apple Wallet generic pass, without the signing fields the library adds. */
export function applePassJson(p: WalletPerson, ids: { passTypeIdentifier: string; teamIdentifier: string }) {
  const { bg, fg } = walletColours(p.card);
  const back = [
    { key: "profile", label: "Profile", value: p.pageUrl },
    ...(p.bookingUrl ? [{ key: "booking", label: "Book a call", value: p.bookingUrl }] : []),
    ...p.links.slice(0, 8).map((l, i) => ({ key: `link${i}`, label: l.label, value: l.url })),
  ];
  return {
    formatVersion: 1,
    passTypeIdentifier: ids.passTypeIdentifier,
    teamIdentifier: ids.teamIdentifier,
    serialNumber: walletPassId(p.slug),
    organizationName: p.company,
    description: `${p.name} · ${p.company}`,
    logoText: p.company,
    backgroundColor: hexToRgb(bg),
    foregroundColor: hexToRgb(fg),
    labelColor: hexToRgb(fg),
    sharingProhibited: false,
    generic: {
      primaryFields: [{ key: "name", label: p.company.toUpperCase(), value: p.name }],
      secondaryFields: p.headline ? [{ key: "role", label: "Role", value: p.headline }] : [],
      auxiliaryFields: p.location ? [{ key: "location", label: "Based in", value: p.location }] : [],
      backFields: back,
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: p.pageUrl, messageEncoding: "iso-8859-1", altText: "Scan for my profile" }],
  };
}

/** The claims of a Google Wallet "save" JWT: one generic class and one object, inline. */
export function googleSaveClaims(p: WalletPerson, ids: { issuerId: string; serviceAccountEmail: string; appUrl: string; logoUrl: string }) {
  const { bg } = walletColours(p.card);
  const text = (value: string) => ({ defaultValue: { language: "en-GB", value } });
  const classId = `${ids.issuerId}.foundry_profile`;
  const uris = [
    { id: "profile", uri: p.pageUrl, description: "Profile" },
    ...(p.bookingUrl ? [{ id: "booking", uri: p.bookingUrl, description: "Book a call" }] : []),
    ...p.links.slice(0, 8).map((l, i) => ({ id: `link${i}`, uri: l.url, description: l.label })),
  ];
  return {
    iss: ids.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins: [ids.appUrl],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [
        {
          id: `${ids.issuerId}.${walletPassId(p.slug)}`,
          classId,
          state: "ACTIVE",
          cardTitle: text(p.company),
          header: text(p.name),
          ...(p.headline ? { subheader: text(p.headline) } : {}),
          hexBackgroundColor: bg,
          logo: { sourceUri: { uri: ids.logoUrl }, contentDescription: text(p.company) },
          barcode: { type: "QR_CODE", value: p.pageUrl, alternateText: "" },
          ...(p.location ? { textModulesData: [{ id: "location", header: "Based in", body: p.location }] } : {}),
          linksModuleData: { uris },
        },
      ],
    },
  };
}
