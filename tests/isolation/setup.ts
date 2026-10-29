/**
 * Mocks for the isolation suite. They replace only the edges a route handler can't run without
 * outside a Next.js server: the session, request-scoped headers/cookies, `after()`, the network,
 * and first-time setup. Everything that decides access (requireAuthedUser, the assert helpers,
 * the Prisma queries) is the real code.
 */
import { vi } from "vitest";
import { ctx } from "./context";
import { IDS } from "./fixtures";

vi.mock("@/auth", () => ({
  auth: async () => ctx.session,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

vi.mock("next/headers", () => ({
  headers: async () => ctx.headers,
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  }),
  draftMode: async () => ({ isEnabled: false, enable: () => undefined, disable: () => undefined }),
}));

// `after()` schedules work past the response. It would outlive the call we are measuring and
// send mail, post to Slack or start scans, so it is dropped: the suite judges what a route
// returns and what it writes before it answers.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: () => undefined };
});

// unstable_cache needs Next's incremental cache, which only exists inside a server. Calling
// through uncached is the same answer, which is all the suite reads.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
  unstable_noStore: () => undefined,
}));

// First-time setup seeds Gitwork's real content (Starters, the handbook, golf clubs). The suite
// keeps only the lookup half: "the Gitwork workspace", which is business A.
vi.mock("@/server/bootstrap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/bootstrap")>();
  const { prisma } = await import("@/lib/prisma");
  const base = async () => ({
    user: await prisma.user.findUniqueOrThrow({ where: { id: IDS.a.user } }),
    workspace: await prisma.workspace.findUniqueOrThrow({ where: { id: IDS.a.workspace } }),
    template: await prisma.documentTemplate.findUniqueOrThrow({ where: { id: IDS.a.template } }),
  });
  return { ...actual, ensureBaseRecords: base, runFirstBootSetup: base };
});

// Nothing leaves the machine: Slack, Resend, the AI providers and GitHub all go through fetch.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return realFetch(input, init);
  return new Response(JSON.stringify({ error: "network disabled in the isolation suite" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;
