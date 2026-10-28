import { describe, expect, it } from "vitest";
import type { drive_v3 } from "googleapis";
import {
  DriveReadError,
  classifyDriveError,
  crumbsTo,
  readClientDrive,
  readFileForClient,
  servedAs,
  walkFolders,
  FILE_MAX_BYTES,
  RECENT_MAX_FOLDERS,
} from "@/server/client-drive";

const FOLDER = "application/vnd.google-apps.folder";

interface Node {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  createdTime?: string;
  modifiedTime?: string;
}

/**
 * A fake Drive over a small tree. Understands the only queries client-drive.ts sends:
 * `'id' in parents` (OR'd), `mimeType = / != folder`, `trashed = false`.
 */
function fakeDrive(nodes: Node[], opts: { missing?: Set<string> } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const calls = { list: 0, get: 0 };
  const drive = {
    files: {
      async get({ fileId }: { fileId: string }) {
        calls.get++;
        const n = byId.get(fileId);
        if (!n || opts.missing?.has(fileId)) throw Object.assign(new Error("File not found"), { code: 404 });
        return { data: { ...n, thumbnailLink: null } };
      },
      async list({ q, orderBy }: { q: string; orderBy?: string }) {
        calls.list++;
        const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
        const wantFolders = q.includes(`mimeType = '${FOLDER}'`);
        const noFolders = q.includes(`mimeType != '${FOLDER}'`);
        let files = nodes.filter((n) => n.parents.some((p) => parents.includes(p)));
        if (wantFolders) files = files.filter((n) => n.mimeType === FOLDER);
        if (noFolders) files = files.filter((n) => n.mimeType !== FOLDER);
        if (orderBy?.startsWith("createdTime")) files.sort((a, b) => (b.createdTime ?? "").localeCompare(a.createdTime ?? ""));
        return { data: { files } };
      },
      async export() {
        return { data: null };
      },
    },
  } as unknown as drive_v3.Drive;
  return { drive, calls };
}

const tree: Node[] = [
  { id: "rootFolder00", name: "Acme — Client", mimeType: FOLDER, parents: ["myDrive"] },
  { id: "designsFold0", name: "Designs", mimeType: FOLDER, parents: ["rootFolder00"] },
  { id: "round2Folder", name: "Round 2", mimeType: FOLDER, parents: ["designsFold0"] },
  { id: "deepFile0000", name: "hero.png", mimeType: "image/png", parents: ["round2Folder"], createdTime: "2026-10-20T00:00:00Z" },
  { id: "topFile00000", name: "brief", mimeType: "application/vnd.google-apps.document", parents: ["rootFolder00"], createdTime: "2026-10-27T00:00:00Z" },
  { id: "otherFolder0", name: "Someone else's", mimeType: FOLDER, parents: ["myDrive"] },
  { id: "secretFile00", name: "salaries.xlsx", mimeType: "application/pdf", parents: ["otherFolder0"], createdTime: "2026-10-28T00:00:00Z" },
];

describe("only the client's folder, never anything else the reader can see", () => {
  it("a folder outside the client's folder has no crumbs", async () => {
    const { drive } = fakeDrive(tree);
    const root = { id: "rootFolder00", name: "Acme — Client" };
    expect(await crumbsTo(drive, root, "otherFolder0")).toBeNull();
    expect((await crumbsTo(drive, root, "round2Folder"))?.map((c) => c.name)).toEqual(["Acme — Client", "Designs", "Round 2"]);
  });

  it("browsing to an outside folder shows the client's folder instead", async () => {
    const { drive } = fakeDrive(tree);
    const res = await readClientDrive(drive, "rootFolder00", "folder", "otherFolder0");
    expect(res?.files.map((f) => f.id)).not.toContain("secretFile00");
    expect(res?.crumbs.map((c) => c.id)).toEqual(["rootFolder00"]);
  });

  it("the client's copy won't serve a file from outside the folder", async () => {
    const { drive } = fakeDrive(tree);
    expect(await readFileForClient(drive, "rootFolder00", "secretFile00")).toBeNull();
  });

  it("recent files come from every level of the folder, with their path, and nothing outside it", async () => {
    const { drive } = fakeDrive(tree);
    const res = await readClientDrive(drive, "rootFolder00", "added", null);
    expect(res?.files.map((f) => [f.name, f.path])).toEqual([
      ["brief", null],
      ["hero.png", "Designs / Round 2"],
    ]);
  });

  it("a saved link that points at a file, not a folder, is no folder", async () => {
    const { drive } = fakeDrive(tree);
    expect(await readClientDrive(drive, "topFile00000", "added", null)).toBeNull();
  });
});

describe("the folder walk is bounded and says when it stopped short", () => {
  it("stops at the folder cap and reports partial", async () => {
    const many: Node[] = [
      { id: "rootFolder00", name: "Root", mimeType: FOLDER, parents: ["myDrive"] },
      ...Array.from({ length: RECENT_MAX_FOLDERS + 20 }, (_, i) => ({
        id: `sub${String(i).padStart(9, "0")}`,
        name: `Sub ${i}`,
        mimeType: FOLDER,
        parents: ["rootFolder00"],
      })),
    ];
    const { drive } = fakeDrive(many);
    const { folders, partial } = await walkFolders(drive, { id: "rootFolder00", name: "Root" });
    expect(folders.size).toBe(RECENT_MAX_FOLDERS);
    expect(partial).toBe(true);
  });

  it("a small tree is complete", async () => {
    const { drive } = fakeDrive(tree);
    const { partial } = await walkFolders(drive, { id: "rootFolder00", name: "Acme" });
    expect(partial).toBe(false);
  });
});

describe("what a Drive failure means — 'we couldn't look' is never 'there's nothing here'", () => {
  it("404 and a plain 403 are 'no access'", () => {
    expect(classifyDriveError({ code: 404 })).toBe("no_access");
    expect(classifyDriveError({ response: { status: 403 }, message: "The user does not have sufficient permissions for file" })).toBe("no_access");
  });

  it("a missing scope or a revoked grant is a sign-in problem", () => {
    expect(classifyDriveError({ code: 403, errors: [{ reason: "insufficientPermissions" }] })).toBe("reconnect");
    expect(classifyDriveError({ code: 401 })).toBe("reconnect");
    expect(classifyDriveError({ message: "invalid_grant" })).toBe("reconnect");
  });

  it("anything else is Drive not answering", () => {
    expect(classifyDriveError({ code: 500 })).toBe("error");
    expect(classifyDriveError(new Error("ECONNRESET"))).toBe("error");
  });

  it("a folder the reader can't open throws no_access rather than returning an empty list", async () => {
    const { drive } = fakeDrive(tree, { missing: new Set(["rootFolder00"]) });
    await expect(readClientDrive(drive, "rootFolder00", "added", null)).rejects.toMatchObject({ state: "no_access" });
    await expect(readClientDrive(drive, "rootFolder00", "added", null)).rejects.toBeInstanceOf(DriveReadError);
  });
});

describe("what the client's copy serves a file as", () => {
  it("Google formats are exported; Docs and Slides as PDF, Sheets as Excel", () => {
    expect(servedAs("application/vnd.google-apps.document", null, "Brief")).toEqual({ mime: "application/pdf", filename: "Brief.pdf" });
    expect(servedAs("application/vnd.google-apps.presentation", null, "Deck")?.mime).toBe("application/pdf");
    expect(servedAs("application/vnd.google-apps.spreadsheet", null, "Budget")?.filename).toBe("Budget.xlsx");
  });

  it("a folder, a Form, an unexportable Google type or an oversized file isn't served", () => {
    expect(servedAs(FOLDER, null, "x")).toBeNull();
    expect(servedAs("application/vnd.google-apps.form", null, "x")).toBeNull();
    expect(servedAs("application/vnd.google-apps.site", null, "x")).toBeNull();
    expect(servedAs("video/mp4", FILE_MAX_BYTES + 1, "big.mp4")).toBeNull();
    expect(servedAs("video/mp4", 1000, "small.mp4")).toEqual({ mime: "video/mp4", filename: "small.mp4" });
  });
});
