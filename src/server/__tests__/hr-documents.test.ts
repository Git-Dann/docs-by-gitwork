/**
 * HR documents on the server (src/server/hr/documents.ts) against a mocked database: files
 * are checked by their contents, a person's own upload waits for HR, opens by others are
 * logged, and only HR deletes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  docs: [] as Array<Record<string, unknown>>,
  logs: [] as Array<Record<string, unknown>>,
  settings: { selfUploadTypes: ["PHOTO_ID"], driveEnabled: false } as unknown,
  seq: 0,
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/server/blob-storage", () => ({
  placeUpload: vi.fn(async (_ns: string, u: { bytes: Uint8Array }) => ({ storageKey: null, bytes: u.bytes, thumb: null })),
  readStoredUpload: vi.fn(async (row: { bytes: Uint8Array | null }) => (row.bytes ? Buffer.from(row.bytes) : null)),
  deleteStoredUpload: vi.fn(async () => undefined),
}));
vi.mock("@/server/hr/documents-drive", () => ({ copyDocumentToDrive: vi.fn(async () => undefined), trashDriveCopy: vi.fn(async () => undefined) }));

const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => v === undefined || row[k] === v);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.records.find((r) => matches(r, where)) ?? null),
    },
    workspace: { findUnique: vi.fn(async () => ({ hrDocumentSettings: db.settings })) },
    staffDocument: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.docs.filter((d) => matches(d, where))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.docs.find((d) => matches(d, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `d${++db.seq}`, createdAt: new Date(), link: null, note: null, driveFileId: null, driveError: null, expiresOn: null, ...data };
        db.docs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.docs.find((d) => d.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        db.docs = db.docs.filter((d) => d.id !== where.id);
      }),
    },
    hrAccessLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => db.logs.push(data)) },
  },
}));

import { addDocumentFile, deleteDocument, listDocuments, openDocument } from "@/server/hr/documents";
import type { EffectiveUser } from "@/server/auth/effective-user";

const PDF = new TextEncoder().encode("%PDF-1.7 fake but well-formed enough for the sniff");
const user = (over: Partial<EffectiveUser> = {}): EffectiveUser => ({
  id: "u-viewer",
  email: "v@gitwork.co.uk",
  name: "Viewer",
  avatarUrl: null,
  role: "STAFF",
  permissions: ["codeclear"],
  workspaceId: "w1",
  membershipId: "m-viewer",
  ...over,
});
const hr = () => user({ permissions: ["codeclear", "hr.manage"] });
const self = () => user({ id: "u-dev", membershipId: "m-dev", permissions: [] });

beforeEach(() => {
  db.records = [{ id: "r-dev", workspaceId: "w1", memberId: "m-dev", managerId: null, employmentType: "CONTRACTOR" }];
  db.docs = [];
  db.logs = [];
  db.seq = 0;
  db.settings = { selfUploadTypes: ["PHOTO_ID"], driveEnabled: false };
});

const file = (bytes = PDF, name = "id.pdf") => ({ name, size: bytes.byteLength, bytes });

describe("listDocuments", () => {
  it("shows a colleague nothing, not even the required list", async () => {
    db.docs.push({ id: "d0", workspaceId: "w1", recordId: "r-dev", type: "NDA", title: "NDA", status: "ON_FILE", visibility: "PERSON_HR", createdAt: new Date(), expiresOn: null, filename: "nda.pdf", size: 1, uploadedBySelf: false });
    const view = await listDocuments(user(), "r-dev", "2026-10-30");
    expect(view.documents).toEqual([]);
    expect(view.required).toEqual([]);
    expect(view.uploadTypes).toEqual([]);
  });

  it("shows the person their required list", async () => {
    const view = await listDocuments(self(), "r-dev", "2026-10-30");
    expect(view.required.map((r) => r.type)).toEqual(["NDA", "PHOTO_ID"]);
    expect(view.uploadTypes).toEqual(["PHOTO_ID"]);
  });
});

describe("addDocumentFile", () => {
  it("refuses a file whose contents aren't what its name says", async () => {
    const fake = new TextEncoder().encode("<html>not a pdf</html>");
    await expect(addDocumentFile(hr(), "r-dev", file(fake), { type: "NDA" })).rejects.toMatchObject({ status: 400 });
    expect(db.docs).toHaveLength(0);
  });

  it("refuses a type HR hasn't allowed the person to add", async () => {
    await expect(addDocumentFile(self(), "r-dev", file(), { type: "NDA" })).rejects.toMatchObject({ status: 403 });
  });

  it("holds the person's own upload for HR to check, and logs it", async () => {
    const doc = await addDocumentFile(self(), "r-dev", file(), { type: "PHOTO_ID" });
    expect(doc.status).toBe("TO_CHECK");
    expect(db.logs).toEqual([expect.objectContaining({ action: "ADD_DOCUMENT" })]);
  });

  it("fills HR's request rather than adding a second row", async () => {
    db.docs.push({ id: "req", workspaceId: "w1", recordId: "r-dev", type: "NDA", title: "NDA", status: "REQUESTED", visibility: "PERSON_HR", createdAt: new Date(), uploadedBySelf: false });
    const doc = await addDocumentFile(self(), "r-dev", file(), { type: "NDA" });
    expect(doc.id).toBe("req");
    expect(db.docs).toHaveLength(1);
  });

  it("puts HR's upload on file at once", async () => {
    expect((await addDocumentFile(hr(), "r-dev", file(), { type: "NDA" })).status).toBe("ON_FILE");
  });
});

describe("openDocument and deleteDocument", () => {
  beforeEach(() => {
    db.docs.push({ id: "d1", workspaceId: "w1", recordId: "r-dev", type: "NDA", title: "NDA", status: "ON_FILE", visibility: "PERSON_HR", createdAt: new Date(), filename: "nda.pdf", mime: "application/pdf", bytes: PDF, storageKey: null, uploadedBySelf: false });
  });

  it("logs HR opening someone's document, not the person opening their own", async () => {
    await openDocument(self(), "d1");
    expect(db.logs).toHaveLength(0);
    await openDocument(hr(), "d1");
    expect(db.logs).toEqual([expect.objectContaining({ action: "DOWNLOAD_DOCUMENT", recordId: "r-dev" })]);
  });

  it("is a 404 to a colleague and from another workspace", async () => {
    await expect(openDocument(user(), "d1")).rejects.toMatchObject({ status: 404 });
    await expect(openDocument(hr() && user({ workspaceId: "w2", permissions: ["hr.manage"] }), "d1")).rejects.toMatchObject({ status: 404 });
  });

  it("lets only HR delete", async () => {
    await expect(deleteDocument(self(), "d1")).rejects.toMatchObject({ status: 403 });
    await deleteDocument(hr(), "d1");
    expect(db.docs).toHaveLength(0);
  });
});
