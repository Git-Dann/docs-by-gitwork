/**
 * Who can read a request's screenshot, or a reply's, on the INTERNAL routes.
 *
 * Both GETs used to resolve no user at all, so any signed-in member — including a
 * developer scoped to other clients (`seeAllClients` off, no ClientAssignment) — could
 * read a client's screenshots by naming its slug and a request id. They now run the
 * same `assertClientAccessBySlug` gate as the rest of /api/clients/[slug]/…, and a
 * trusted API-key caller (no per-user identity → null) keeps access, per convention.
 *
 * Drives the real route handlers and the real access helper; only identity, Prisma
 * and the byte loaders are faked. `@/auth` is mocked because next-auth's ESM entry
 * points don't resolve in the Node test environment (see duplicate-auth.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectiveUser } from "@/server/auth/effective-user";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

const workspaceClientFindFirst = vi.fn();
const workspaceClientFindUnique = vi.fn();
const clientAssignmentFindFirst = vi.fn();
const placementFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst: workspaceClientFindFirst, findUnique: workspaceClientFindUnique },
    clientAssignment: { findFirst: clientAssignmentFindFirst },
    placement: { findMany: placementFindMany },
  },
}));

vi.mock("@/server/bootstrap", () => ({
  ensureBaseRecords: vi.fn(async () => ({ workspace: { id: WORKSPACE } })),
}));

const getWikiIntakeItemImageBytes = vi.fn();
const getWikiIntakeCommentImageBytes = vi.fn();
vi.mock("@/server/wiki", () => ({
  getWikiIntakeItemImageBytes,
  getWikiIntakeCommentImageBytes,
  attachWikiIntakeItemImage: vi.fn(),
  attachWikiIntakeCommentImage: vi.fn(),
}));

const getEffectiveUserOrNull = vi.fn();
vi.mock("@/server/auth/effective-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/effective-user")>();
  return { ...original, getEffectiveUserOrNull };
});

const WORKSPACE = "ws-gitwork";
const CLIENT_ID = "client-acme";
const SLUG = "acme";
const PNG = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mime: "image/png" };

function developer(overrides: Partial<EffectiveUser> = {}): EffectiveUser {
  return {
    id: "dev-1",
    email: "dev@gitwork.co.uk",
    name: "Dev",
    avatarUrl: null,
    role: "DEVELOPER",
    permissions: [],
    workspaceId: WORKSPACE,
    membershipId: "mem-1",
    ...overrides,
  };
}

const itemParams = { params: Promise.resolve({ slug: SLUG, id: "item-1" }) };
const commentParams = { params: Promise.resolve({ slug: SLUG, id: "item-1", commentId: "c-1" }) };

async function getItemImage() {
  const { GET } = await import("../image/route");
  return GET(new Request(`http://x/api/clients/${SLUG}/wiki/intake-items/item-1/image`), itemParams);
}

async function getCommentImage() {
  const { GET } = await import("../comments/[commentId]/image/route");
  const { NextRequest } = await import("next/server");
  return GET(
    new NextRequest(`http://x/api/clients/${SLUG}/wiki/intake-items/item-1/comments/c-1/image`),
    commentParams,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceClientFindFirst.mockResolvedValue({ id: CLIENT_ID });
  workspaceClientFindUnique.mockResolvedValue({ id: CLIENT_ID });
  clientAssignmentFindFirst.mockResolvedValue(null);
  placementFindMany.mockResolvedValue([]);
  getWikiIntakeItemImageBytes.mockResolvedValue(PNG);
  getWikiIntakeCommentImageBytes.mockResolvedValue(PNG);
});

describe.each([
  ["a request's screenshot", getItemImage, getWikiIntakeItemImageBytes],
  ["a reply's screenshot", getCommentImage, getWikiIntakeCommentImageBytes],
])("internal GET of %s", (_label, fetchImage, loader) => {
  it("refuses a developer who is not assigned to the client — and never loads the bytes", async () => {
    getEffectiveUserOrNull.mockResolvedValue(developer());
    const res = await fetchImage();
    expect(res.status).toBe(403);
    expect(loader).not.toHaveBeenCalled();
  });

  it("serves an assigned developer", async () => {
    getEffectiveUserOrNull.mockResolvedValue(developer());
    clientAssignmentFindFirst.mockResolvedValue({ id: "assign-1" });
    const res = await fetchImage();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("serves a developer placed on the client in Code", async () => {
    getEffectiveUserOrNull.mockResolvedValue(developer());
    placementFindMany.mockResolvedValue([{ clientId: CLIENT_ID }]);
    expect((await fetchImage()).status).toBe(200);
  });

  it("serves someone who sees all clients", async () => {
    getEffectiveUserOrNull.mockResolvedValue(developer({ permissions: ["seeAllClients"] }));
    expect((await fetchImage()).status).toBe(200);
  });

  it("serves a trusted API-key caller (no per-user identity)", async () => {
    getEffectiveUserOrNull.mockResolvedValue(null);
    expect((await fetchImage()).status).toBe(200);
  });

  it("404s when the request (or reply) does not belong to this client's wiki", async () => {
    getEffectiveUserOrNull.mockResolvedValue(null);
    loader.mockResolvedValue(null);
    expect((await fetchImage()).status).toBe(404);
  });
});

it("looks a request's screenshot up under the client the slug names", async () => {
  // getWikiIntakeItemImageBytes filters on `wiki: { clientId }`, so passing the
  // slug's client is what makes another client's request id 404 here.
  getEffectiveUserOrNull.mockResolvedValue(null);
  await getItemImage();
  expect(getWikiIntakeItemImageBytes).toHaveBeenCalledWith(CLIENT_ID, "item-1", "full");
});
