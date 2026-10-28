import { describe, expect, it } from "vitest";
import {
  clientCanOpen,
  clientPreviewKind,
  driveFileKind,
  driveFolderIdFromUrl,
  driveOpenUrl,
  drivePreviewUrl,
  parseDriveView,
  sortRecent,
  type ClientDriveFile,
} from "@/lib/client-drive";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("driveFolderIdFromUrl — every shape a folder link is pasted in", () => {
  it.each([
    [`https://drive.google.com/drive/folders/${ID}`],
    [`https://drive.google.com/drive/folders/${ID}?usp=sharing`],
    [`https://drive.google.com/drive/u/1/folders/${ID}`],
    [`https://drive.google.com/drive/mobile/folders/${ID}`],
    [`https://drive.google.com/folderview?id=${ID}`],
    [`https://drive.google.com/open?id=${ID}`],
    [`drive.google.com/drive/folders/${ID}`],
    [`  ${ID}  `],
  ])("%s", (url) => {
    expect(driveFolderIdFromUrl(url)).toBe(ID);
  });

  it("accepts a shared drive's short root id", () => {
    expect(driveFolderIdFromUrl("https://drive.google.com/drive/folders/0AbCdEfGhIjKlUk9PVA")).toBe("0AbCdEfGhIjKlUk9PVA");
  });

  it.each([
    [null],
    [""],
    ["https://example.com/drive/folders/" + ID],
    ["https://drive.google.com.evil.com/drive/folders/" + ID],
    ["https://docs.google.com/document/d/" + ID + "/edit"],
    ["https://drive.google.com/drive/my-drive"],
    ["javascript:alert(1)"],
  ])("refuses %s", (url) => {
    expect(driveFolderIdFromUrl(url)).toBeNull();
  });
});

describe("preview and open links are built, never passed through", () => {
  it("Google formats use their own viewer; everything else Drive's", () => {
    expect(drivePreviewUrl({ id: ID, mimeType: "application/vnd.google-apps.document" })).toBe(
      `https://docs.google.com/document/d/${ID}/preview`,
    );
    expect(drivePreviewUrl({ id: ID, mimeType: "application/vnd.google-apps.spreadsheet" })).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/preview`,
    );
    expect(drivePreviewUrl({ id: ID, mimeType: "application/pdf" })).toBe(`https://drive.google.com/file/d/${ID}/preview`);
  });

  it("a folder and a Form have no preview", () => {
    expect(drivePreviewUrl({ id: ID, mimeType: "application/vnd.google-apps.folder" })).toBeNull();
    expect(drivePreviewUrl({ id: ID, mimeType: "application/vnd.google-apps.form" })).toBeNull();
  });

  it("an id that isn't a Drive id produces no URL at all", () => {
    expect(drivePreviewUrl({ id: "../../evil", mimeType: "application/pdf" })).toBeNull();
    expect(driveOpenUrl({ id: "x/../y?z", mimeType: "application/pdf" })).toBeNull();
  });
});

describe("what the client's copy can show", () => {
  it("Docs and Slides preview as PDF (the file route exports them); a Word file doesn't", () => {
    expect(clientPreviewKind("application/vnd.google-apps.document")).toBe("pdf");
    expect(clientPreviewKind("application/vnd.google-apps.presentation")).toBe("pdf");
    expect(clientPreviewKind("application/pdf")).toBe("pdf");
    expect(clientPreviewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("none");
  });

  it("only safe image types preview as images — never SVG", () => {
    expect(clientPreviewKind("image/png")).toBe("image");
    expect(clientPreviewKind("image/svg+xml")).toBe("none");
  });

  it("folders and Forms can't be opened by the client", () => {
    expect(clientCanOpen("application/vnd.google-apps.folder")).toBe(false);
    expect(clientCanOpen("application/vnd.google-apps.form")).toBe(false);
    expect(clientCanOpen("application/pdf")).toBe(true);
  });
});

describe("kinds, views and order", () => {
  it("names a file's family", () => {
    expect(driveFileKind("application/vnd.google-apps.spreadsheet")).toBe("sheet");
    expect(driveFileKind("text/csv")).toBe("sheet");
    expect(driveFileKind("video/mp4")).toBe("video");
    expect(driveFileKind(null)).toBe("file");
  });

  it("an unknown view is 'recently added'", () => {
    expect(parseDriveView("edited")).toBe("edited");
    expect(parseDriveView("folder")).toBe("folder");
    expect(parseDriveView("anything")).toBe("added");
    expect(parseDriveView(null)).toBe("added");
  });

  const f = (id: string, created: string, modified: string): ClientDriveFile => ({
    id,
    name: id,
    mimeType: "application/pdf",
    kind: "pdf",
    createdTime: created,
    modifiedTime: modified,
    modifiedBy: null,
    path: null,
    size: null,
    hasThumbnail: false,
  });

  it("sorts by the view's own clock, newest first", () => {
    const old = f("old-added-new-edit", "2026-01-01T00:00:00Z", "2026-10-01T00:00:00Z");
    const fresh = f("new-added-old-edit", "2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z");
    expect(sortRecent([old, fresh], "added").map((x) => x.id)).toEqual(["new-added-old-edit", "old-added-new-edit"]);
    expect(sortRecent([old, fresh], "edited").map((x) => x.id)).toEqual(["old-added-new-edit", "new-added-old-edit"]);
  });
});
