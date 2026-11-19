/**
 * Wallet passes for public profiles (CLAUDE.md §139): Apple Wallet (.pkpass, signed here) and
 * Google Wallet (a signed "save" link). Each is OFF until its credentials are set, and the page
 * only offers a button for a wallet that is on (`walletAvailability`).
 *
 * Apple:  APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_P12 (base64 of the .p12),
 *         APPLE_PASS_CERT_PASSWORD (the .p12's password; may be empty).
 * Google: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT (base64 of the key JSON).
 *
 * Pass content is built by the pure functions in src/lib/profile-wallet.ts.
 */
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { applePassJson, googleSaveClaims, type WalletPerson } from "@/lib/profile-wallet";
import { decodeDataUrl } from "@/server/avatar-response";
import { loadPublicProfile, publicAvatarUserId } from "@/server/public-profile";
import { APPLE_WWDR_G4_PEM } from "@/server/wallet/apple-wwdr";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://foundry.gitwork.co.uk").replace(/\/$/, "");

function appleEnv() {
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_ID?.trim();
  const teamIdentifier = process.env.APPLE_TEAM_ID?.trim();
  const p12 = process.env.APPLE_PASS_CERT_P12?.trim();
  return passTypeIdentifier && teamIdentifier && p12 ? { passTypeIdentifier, teamIdentifier, p12, password: process.env.APPLE_PASS_CERT_PASSWORD ?? "" } : null;
}

function googleEnv(): { issuerId: string; email: string; key: string } | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT?.trim();
  if (!issuerId || !raw) return null;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as { client_email?: string; private_key?: string };
    return json.client_email && json.private_key ? { issuerId, email: json.client_email, key: json.private_key } : null;
  } catch {
    return null;
  }
}

/** Which wallets are switched on. The page shows a button only for these. */
export function walletAvailability(): { apple: boolean; google: boolean } {
  return { apple: appleEnv() !== null, google: googleEnv() !== null };
}

async function walletPerson(slug: string): Promise<WalletPerson | null> {
  const p = await loadPublicProfile(slug);
  if (!p) return null;
  return {
    slug: p.slug,
    name: p.name,
    headline: p.headline,
    company: p.company,
    location: p.location,
    pageUrl: `${appUrl()}/u/${p.slug}`,
    bookingUrl: p.bookingUrl,
    links: p.links,
    card: p.card,
  };
}

/** The .p12 → the PEM certificate and key passkit-generator wants. */
async function appleCertificates(env: NonNullable<ReturnType<typeof appleEnv>>) {
  const forge = (await import("node-forge")).default;
  const der = forge.util.decode64(env.p12);
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), env.password);
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  const key =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!cert || !key) throw new Error("APPLE_PASS_CERT_P12 has no certificate and key in it");
  return { wwdr: APPLE_WWDR_G4_PEM, signerCert: forge.pki.certificateToPem(cert), signerKey: forge.pki.privateKeyToPem(key) };
}

async function png(input: Buffer, size: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(input).resize(size, size, { fit: "cover" }).png().toBuffer();
}

/** The person's photo for the pass, when it's stored here. */
async function photo(slug: string): Promise<Buffer | null> {
  const userId = await publicAvatarUserId(slug);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarImage: true } });
  const decoded = user?.avatarImage ? decodeDataUrl(user.avatarImage) : null;
  return decoded?.body ?? null;
}

/** A signed .pkpass for a public profile, or null when the page isn't public or Apple is off. */
export async function buildApplePass(slug: string): Promise<Buffer | null> {
  const env = appleEnv();
  const person = env ? await walletPerson(slug) : null;
  if (!env || !person) return null;
  const { PKPass } = await import("passkit-generator");
  const icon = await readFile(join(process.cwd(), "public", "foundry-icon.png"));
  const face = await photo(slug);
  const files: Record<string, Buffer> = {
    "pass.json": Buffer.from(JSON.stringify(applePassJson(person, env))),
    "icon.png": await png(icon, 29),
    "icon@2x.png": await png(icon, 58),
    "icon@3x.png": await png(icon, 87),
  };
  if (face) {
    files["thumbnail.png"] = await png(face, 90);
    files["thumbnail@2x.png"] = await png(face, 180);
  }
  const pass = new PKPass(files, await appleCertificates(env));
  return pass.getAsBuffer();
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The "Add to Google Wallet" address for a public profile, or null when off or not public. */
export async function googleSaveUrl(slug: string): Promise<string | null> {
  const env = googleEnv();
  const person = env ? await walletPerson(slug) : null;
  if (!env || !person) return null;
  const claims = googleSaveClaims(person, {
    issuerId: env.issuerId,
    serviceAccountEmail: env.email,
    appUrl: appUrl(),
    logoUrl: `${appUrl()}/foundry-icon.png`,
  });
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ ...claims, iat: Math.floor(Date.now() / 1000) }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(env.key);
  return `https://pay.google.com/gp/v/save/${unsigned}.${b64url(signature)}`;
}
