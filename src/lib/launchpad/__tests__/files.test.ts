import { describe, expect, it } from "vitest";
import {
  attachmentDisposition,
  classifyLaunchpadUpload,
  LAUNCHPAD_FILE_ACCEPT,
  LAUNCHPAD_FILE_MAX_BYTES,
  sanitizeLaunchpadFilename,
} from "@/lib/launchpad/files";
import { applyItemPatch } from "@/lib/launchpad/structure";

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = enc("%PDF-1.7\n%âãÏÓ\n");

const check = (filename: string, head: Uint8Array, size = head.byteLength) =>
  classifyLaunchpadUpload({ filename, size, head });

describe("what may be uploaded to a requirement", () => {
  it("accepts real PDFs and images, typed from the bytes", () => {
    expect(check("contract.pdf", PDF)).toEqual({
      ok: true,
      mime: "application/pdf",
      filename: "contract.pdf",
    });
    expect(check("Icon.PNG", PNG)).toMatchObject({ ok: true, mime: "image/png" });
    expect(check("photo.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({
      ok: true,
      mime: "image/jpeg",
    });
    expect(check("brief.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toMatchObject({
      ok: true,
    });
    expect(check("notes.txt", enc("Hello there"))).toMatchObject({ ok: true, mime: "text/plain" });
  });

  it("refuses SVG and HTML by extension, even with harmless-looking bytes", () => {
    for (const name of ["logo.svg", "logo.svgz", "page.html", "page.htm", "x.xhtml", "x.xml", "run.js"]) {
      expect(check(name, enc("hello")).ok, name).toBe(false);
    }
  });

  it("refuses markup disguised under an allowed extension", () => {
    expect(check("logo.png", enc("<svg xmlns='http://www.w3.org/2000/svg'>")).ok).toBe(false);
    expect(check("notes.txt", enc("<!doctype html><script>alert(1)</script>")).ok).toBe(false);
    expect(check("notes.txt", enc("  <svg onload=alert(1)>")).ok).toBe(false);
    expect(check("data.csv", enc("\uFEFF<html>")).ok).toBe(false);
    expect(check("contract.pdf", PNG).ok).toBe(false);
  });

  it("refuses anything over 10 MB, and empty files", () => {
    expect(check("big.pdf", PDF, LAUNCHPAD_FILE_MAX_BYTES + 1)).toMatchObject({ ok: false });
    expect(check("ok.pdf", PDF, LAUNCHPAD_FILE_MAX_BYTES)).toMatchObject({ ok: true });
    expect(check("empty.pdf", new Uint8Array(), 0)).toMatchObject({ ok: false });
  });

  it("never offers svg or html in the picker", () => {
    expect(LAUNCHPAD_FILE_ACCEPT).not.toMatch(/svg|html?|xml/);
  });

  it("strips paths and header-breaking characters from the name", () => {
    expect(sanitizeLaunchpadFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeLaunchpadFilename('C:\\fakepath\\a"b.pdf')).toBe("ab.pdf");
    expect(attachmentDisposition("Ünïcode \"file\".pdf")).toMatch(/^attachment; filename="_n_code file.pdf"; filename\*=UTF-8''/);
  });
});

describe("an uploaded file counts as providing the item, like a link", () => {
  const needed = { status: "NEEDED" as const, link: null, note: null, ownedByClient: null };

  it("a first file moves NEEDED → PROVIDED", () => {
    expect(applyItemPatch(needed, {}, { fileCount: 1, filesChanged: true }).status).toBe("PROVIDED");
  });

  it("removing the last file (no link) reverts PROVIDED → NEEDED", () => {
    const provided = { ...needed, status: "PROVIDED" as const };
    expect(applyItemPatch(provided, {}, { fileCount: 0, filesChanged: true }).status).toBe("NEEDED");
  });

  it("clearing the link keeps PROVIDED while a file remains", () => {
    const provided = { ...needed, status: "PROVIDED" as const, link: "https://x.test" };
    expect(applyItemPatch(provided, { link: "" }, { fileCount: 1 }).status).toBe("PROVIDED");
    expect(applyItemPatch(provided, { link: "" }).status).toBe("NEEDED");
  });

  it("never overrides an explicit NA", () => {
    const na = { ...needed, status: "NA" as const };
    expect(applyItemPatch(na, {}, { fileCount: 1, filesChanged: true }).status).toBe("NA");
  });
});
