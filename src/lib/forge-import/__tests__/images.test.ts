import { describe, expect, it } from "vitest";
import { acceptableContentType, copiedImages, imageFilename, imageJobs, isFetchableImageUrl, sniffImage } from "../images";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');
const HTML = new TextEncoder().encode("<!doctype html><html>");

describe("what counts as an image", () => {
  it("is decided by the file's own first bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(GIF)).toBe("image/gif");
    expect(sniffImage(WEBP)).toBe("image/webp");
  });

  it("refuses SVG, HTML and anything else, whatever it claims to be", () => {
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(HTML)).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(acceptableContentType("image/svg+xml")).toBe(false);
    expect(acceptableContentType("text/html")).toBe(false);
    expect(acceptableContentType("image/jpeg; charset=binary")).toBe(true);
  });

  it("only ever fetches http(s)", () => {
    expect(isFetchableImageUrl("https://ops.example.com/a.png")).toBe(true);
    expect(isFetchableImageUrl("javascript:alert(1)")).toBe(false);
    expect(isFetchableImageUrl("file:///etc/passwd")).toBe(false);
    expect(isFetchableImageUrl("not a url")).toBe(false);
  });
});

describe("which images a card still needs", () => {
  const feed = {
    items: [
      { id: "348", images: ["https://ops.example.com/a.jpeg", "https://ops.example.com/b.png", "https://ops.example.com/a.jpeg", "data:image/png;base64,xx"] },
      { id: "999", images: ["https://ops.example.com/c.png"] },
    ],
  } as never;

  it("is each http(s) image the card hasn't copied, once, and nothing for an item with no card", () => {
    const jobs = imageJobs(feed, [{ id: "t1", externalRef: "forge:348", metadata: null }]);
    expect(jobs).toEqual([
      { forgeId: "348", taskId: "t1", url: "https://ops.example.com/a.jpeg" },
      { forgeId: "348", taskId: "t1", url: "https://ops.example.com/b.png" },
    ]);
  });

  it("skips what the card already recorded, so a re-run copies nothing twice", () => {
    const meta = { forge: { images: { "https://ops.example.com/a.jpeg": "att1" } } };
    expect(copiedImages(meta)).toEqual({ "https://ops.example.com/a.jpeg": "att1" });
    const jobs = imageJobs(feed, [{ id: "t1", externalRef: "forge:348", metadata: meta }]);
    expect(jobs.map((j) => j.url)).toEqual(["https://ops.example.com/b.png"]);
  });

  it("names the attachment from the address", () => {
    expect(imageFilename("https://ops.example.com/wp-content/uploads/WhatsApp%20Image.jpeg")).toBe("WhatsApp Image.jpeg");
  });
});
