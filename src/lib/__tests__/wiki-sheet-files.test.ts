import { describe, expect, it } from "vitest";
import {
  SHEET_IMAGE_INPUT_MAX_BYTES,
  checkSheetImage,
  parseDriveFileId,
  cleanImageName,
  parseSheetFileUrl,
  sheetFileUrl,
  sniffImage,
} from "@/lib/wiki-sheet-files";
import { coerceMedia, mediaKind, mediaTitle, mediaEmbedUrl } from "@/lib/wiki-sheet-media";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const KEY = "a".repeat(40);

describe("checkSheetImage — the bytes decide", () => {
  it("accepts real PNG and JPEG and names them by their real type", () => {
    expect(checkSheetImage(PNG, "Checkout bug.png")).toEqual({ ok: true, mime: "image/png", filename: "Checkout-bug.png" });
    expect(checkSheetImage(JPEG, "photo")).toEqual({ ok: true, mime: "image/jpeg", filename: "photo.jpg" });
  });
  it("refuses SVG and HTML whatever they are called", () => {
    expect(checkSheetImage(SVG, "logo.svg").ok).toBe(false);
    expect(checkSheetImage(SVG, "logo.png").ok).toBe(false);
    expect(checkSheetImage(new TextEncoder().encode("<html>"), "x.png").ok).toBe(false);
  });
  it("refuses a wrong image extension, an empty file and an oversized one", () => {
    expect(checkSheetImage(JPEG, "x.png").ok).toBe(false);
    expect(checkSheetImage(new Uint8Array(), "x.png").ok).toBe(false);
    const big = new Uint8Array(SHEET_IMAGE_INPUT_MAX_BYTES + 1);
    big.set(PNG);
    expect(checkSheetImage(big, "x.png").ok).toBe(false);
  });
  it("sniffs GIF and WebP", () => {
    expect(sniffImage(new TextEncoder().encode("GIF89a...."))?.mime).toBe("image/gif");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
  });
  it("cleans a name for a URL path and a header", () => {
    expect(cleanImageName('../../etc/"evil" name.png', "png")).toBe("evil-name.png");
    expect(cleanImageName("", "gif")).toBe("image.gif");
  });
});

describe("the upload URL is accepted in exactly one shape", () => {
  it("round-trips", () => {
    expect(parseSheetFileUrl(sheetFileUrl(KEY, "a.png"))).toEqual({ key: KEY, filename: "a.png" });
  });
  it("refuses other relative paths and short keys", () => {
    expect(parseSheetFileUrl("/api/wiki/files/abc/a.png")).toBeNull();
    expect(parseSheetFileUrl("/app/settings")).toBeNull();
    expect(parseSheetFileUrl(`/api/wiki/files/${KEY}/a.png?x=1`)).toBeNull();
    expect(parseSheetFileUrl(`//evil.com/api/wiki/files/${KEY}/a.png`)).toBeNull();
  });
  it("a media cell stores an upload as an image, titled by its file name, never embedded", () => {
    const url = sheetFileUrl(KEY, "checkout-bug.png");
    const res = coerceMedia([url]);
    expect(res).toEqual({ ok: true, value: [{ url }] });
    expect(mediaKind(url)).toBe("image");
    expect(mediaTitle({ url })).toBe("checkout-bug.png");
    expect(mediaEmbedUrl(url)).toBeNull();
  });
  it("a media cell still refuses any other relative URL and javascript:", () => {
    expect(coerceMedia(["/app/settings"]).ok).toBe(false);
    expect(coerceMedia(["javascript:alert(1)"]).ok).toBe(false);
  });
});

describe("parseDriveFileId", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  it("reads share links, open?id= links and bare ids", () => {
    expect(parseDriveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(parseDriveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(parseDriveFileId(ID)).toBe(ID);
  });
  it("never takes another host's URL for a Drive file", () => {
    expect(parseDriveFileId(`https://evil.example/file/d/${ID}/view`)).toBeNull();
    expect(parseDriveFileId("https://drive.google.com.evil.example/file/d/x")).toBeNull();
    expect(parseDriveFileId("short")).toBeNull();
  });
});
