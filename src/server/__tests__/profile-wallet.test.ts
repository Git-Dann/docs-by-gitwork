import { createVerify, generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applePassJson, googleSaveClaims, hexToRgb, walletPassId, type WalletPerson } from "@/lib/profile-wallet";

const PERSON: WalletPerson = {
  slug: "dan-lindsay",
  name: "Dan Lindsay",
  headline: "Head of Product at Gitwork",
  company: "Gitwork",
  location: "Manchester, UK",
  pageUrl: "https://foundry.gitwork.co.uk/u/dan-lindsay",
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/x",
  links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/x" }],
  card: { layout: "photo-side", font: "clean", colour: "navy", pattern: "topo" },
};

vi.mock("@/server/public-profile", () => ({
  loadPublicProfile: vi.fn(async (slug: string) =>
    slug === "dan-lindsay"
      ? { ...PERSON, avatarUrl: null, pronouns: null, bio: null, summary: null, yearsExperience: null, skills: [], achievements: [], extras: { highlights: [], featured: [], testimonials: [], clients: [] } }
      : null,
  ),
  publicAvatarUserId: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("what goes on a pass", () => {
  it("Apple: the person's own colours, name, role, QR of the page, links on the back; never email or phone", () => {
    const j = applePassJson(PERSON, { passTypeIdentifier: "pass.co.uk.gitwork.profile", teamIdentifier: "ABCDE12345" });
    expect(j.backgroundColor).toBe(hexToRgb("#172554"));
    expect(j.generic.primaryFields[0]!.value).toBe("Dan Lindsay");
    expect(j.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: PERSON.pageUrl });
    expect(j.generic.backFields.map((f) => f.label)).toEqual(["Profile", "Book a call", "LinkedIn"]);
    expect(JSON.stringify(j)).not.toMatch(/@|mailto|tel:/);
  });

  it("Google: one class and one object, stable id per profile", () => {
    const c = googleSaveClaims(PERSON, { issuerId: "338800", serviceAccountEmail: "w@x.iam.gserviceaccount.com", appUrl: "https://foundry.gitwork.co.uk", logoUrl: "https://foundry.gitwork.co.uk/foundry-icon.png" });
    const o = c.payload.genericObjects[0]!;
    expect(o.id).toBe("338800.profile-dan-lindsay");
    expect(o.classId).toBe("338800.foundry_profile");
    expect(o.barcode.value).toBe(PERSON.pageUrl);
    expect(c.typ).toBe("savetowallet");
  });

  it("ids can't carry anything but the handle's own characters", () => {
    expect(walletPassId("dan-lindsay")).toBe("profile-dan-lindsay");
    expect(walletPassId("x/../y")).toBe("profile-xy");
  });
});

describe("signing, end to end", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_PASS_CERT_P12", "APPLE_PASS_CERT_PASSWORD", "GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT"]) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("both wallets are off until their credentials are set", async () => {
    const w = await import("@/server/profile-wallet");
    expect(w.walletAvailability()).toEqual({ apple: false, google: false });
    expect(await w.buildApplePass("dan-lindsay")).toBeNull();
    expect(await w.googleSaveUrl("dan-lindsay")).toBeNull();
  });

  it("Apple: a .p12 makes a signed pass (zip with pass.json, manifest and signature)", async () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    const attrs = [{ name: "commonName", value: "Pass Type ID: pass.test" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "pw", { algorithm: "3des" });
    process.env.APPLE_PASS_TYPE_ID = "pass.co.uk.gitwork.profile";
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    process.env.APPLE_PASS_CERT_P12 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());
    process.env.APPLE_PASS_CERT_PASSWORD = "pw";

    const w = await import("@/server/profile-wallet");
    expect(w.walletAvailability().apple).toBe(true);
    const buf = await w.buildApplePass("dan-lindsay");
    expect(buf).not.toBeNull();
    const text = buf!.toString("latin1");
    expect(buf!.subarray(0, 2).toString()).toBe("PK");
    for (const f of ["pass.json", "manifest.json", "signature", "icon.png"]) expect(text).toContain(f);
    expect(await w.buildApplePass("not-public")).toBeNull();
  }, 30_000);

  it("Google: the save link carries a JWT signed by the service account", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.GOOGLE_WALLET_ISSUER_ID = "338800";
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({ client_email: "w@x.iam.gserviceaccount.com", private_key: key })).toString("base64");

    const w = await import("@/server/profile-wallet");
    const url = await w.googleSaveUrl("dan-lindsay");
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    const [h, p, s] = url!.split("/").pop()!.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(p!, "base64url").toString()).iss).toBe("w@x.iam.gserviceaccount.com");
  });
});
