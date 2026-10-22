import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const user = vi.hoisted(() => ({ current: null as null | { avatarImage: string | null; avatarUrl: string | null } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => user.current } } }));

import { AVATAR_PX, avatarResponse, shrinkAvatar } from "@/server/avatar-response";

/** A phone-photo-sized JPEG with real detail, so it does not compress to nothing. */
async function phonePhoto(): Promise<Buffer> {
  const w = 3000, h = 2250;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe("avatars are shrunk on the way out", () => {
  it("⚠️ a multi-MB phone photo goes out as a small WebP no bigger than AVATAR_PX", async () => {
    const photo = await phonePhoto();
    expect(photo.length).toBeGreaterThan(1_000_000);
    const out = await shrinkAvatar("image/jpeg", photo);
    expect(out.mime).toBe("image/webp");
    expect(out.body.length).toBeLessThan(150_000);
    const meta = await sharp(out.body).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(AVATAR_PX);
  });

  it("a small image is never enlarged or made bigger", async () => {
    const tiny = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } }).png().toBuffer();
    const out = await shrinkAvatar("image/png", tiny);
    expect(out.body.length).toBeLessThanOrEqual(tiny.length);
  });

  it("SVG and unreadable bytes go out as stored — a failed resize is not a missing photo", async () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect(await shrinkAvatar("image/svg+xml", svg)).toEqual({ mime: "image/svg+xml", body: svg });
    const junk = Buffer.from("not an image at all");
    expect(await shrinkAvatar("image/jpeg", junk)).toEqual({ mime: "image/jpeg", body: junk });
  });

  it("the route serves the shrunk copy, and answers a repeat with 304", async () => {
    const photo = await phonePhoto();
    user.current = { avatarImage: `data:image/jpeg;base64,${photo.toString("base64")}`, avatarUrl: "/api/avatars/u1" };
    const first = await avatarResponse("u1");
    expect(first.headers.get("content-type")).toBe("image/webp");
    const body = Buffer.from(await first.arrayBuffer());
    expect(body.length).toBeLessThan(photo.length / 10);
    const etag = first.headers.get("etag")!;
    const again = await avatarResponse("u1", new Request("http://x", { headers: { "if-none-match": etag } }));
    expect(again.status).toBe(304);
  });
});
