import { beforeAll, describe, expect, it } from "vitest";
import { UPLOAD_TICKET_TTL_MS, issueUploadTicket, readUploadTicket } from "@/server/wiki-sheet-upload-ticket";
import { shrinkToFit } from "@/server/wiki-sheet-files";
import { SHEET_IMAGE_MAX_BYTES, sniffImage } from "@/lib/wiki-sheet-files";

beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= "test-secret-for-upload-tickets";
});

const base = { c: "client1", s: "sheet1", r: "row1", k: "col-9", n: "Harry", u: "user1" };

describe("upload links", () => {
  it("round-trips and keeps its scope", () => {
    const res = readUploadTicket(issueUploadTicket(base));
    expect(res.ok && res.ticket).toMatchObject(base);
  });
  it("expires", () => {
    const t = issueUploadTicket(base, 1_000);
    expect(readUploadTicket(t, 1_000 + UPLOAD_TICKET_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });
  it("cannot be re-pointed at another sheet or client", () => {
    const [body, sig] = issueUploadTicket(base).split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), s: "someone-elses-sheet" }),
    ).toString("base64url");
    expect(readUploadTicket(`${forged}.${sig}`)).toEqual({ ok: false, reason: "invalid" });
    expect(readUploadTicket("garbage")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("shrinkToFit", () => {
  it("re-encodes an oversized screenshot to fit, keeping its pixels", async () => {
    const sharp = (await import("sharp")).default;
    // Noise doesn't compress, so this PNG is well over the 10 MB storage limit.
    const png = await sharp({ create: { width: 2600, height: 2400, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 60 } } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(png.length).toBeGreaterThan(SHEET_IMAGE_MAX_BYTES);
    const out = await shrinkToFit({ bytes: new Uint8Array(png), filename: "map-screen.png" });
    expect(out.bytes.length).toBeLessThanOrEqual(SHEET_IMAGE_MAX_BYTES);
    expect(sniffImage(out.bytes)?.mime).toBe("image/jpeg");
    expect(out.filename).toBe("map-screen.jpg");
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    expect(meta.width).toBe(2600);
  }, 30_000);
});
