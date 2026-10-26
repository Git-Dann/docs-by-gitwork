// @vitest-environment node
/**
 * supabase_rls_enforced and firebase_rules_locked were withheld because answers that say
 * nothing about access control read as "protected":
 *  - Supabase: a 404 (table name scraped wrongly / missing), a 5xx, or a 401 from a rotated
 *    key all counted as RLS enforced.
 *  - Firebase: a 200 with an empty collection (the rules ALLOW the read) and a 404 (no
 *    default database) both PASSed; Realtime Database was never probed.
 * Only an explicit permission denial now counts as protected.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Response("", { status: 404 });

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

const { runVibeSecurityChecks, classifySupabaseProbe, classifyFirestoreProbe, classifyRtdbProbe } = await import("../vibe-security");

const json = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const anonJwt = `eyJhbGciOiJIUzI1NiJ9.${b64({ role: "anon", iss: "supabase" })}.c2lnbmF0dXJlc2lnbmF0dXJl`;
const SUPA = "https://abcdefghijkl.supabase.co";

function ctx(html: string) {
  return {
    pageResult: { html, status: 200, headers: {}, finalUrl: "https://site.test/" },
    httpsUrl: "https://site.test",
    hostname: "site.test",
    platform: "WEB_APP",
    ctx: {},
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  } as unknown as Parameters<typeof runVibeSecurityChecks>[0];
}
const supaPage = (tables: string[]) =>
  `<script>const s = createClient("${SUPA}", "${anonJwt}"); ${tables.map((t) => `s.from("${t}")`).join(";")}</script>`;
const check = async (html: string, key: string) => (await runVibeSecurityChecks(ctx(html))).find((c) => c.checkKey === key)!;

beforeEach(() => { route = () => new Response("", { status: 404 }); });

describe("classifySupabaseProbe", () => {
  it.each([
    [200, "[{\"id\":1}]", "exposed"],
    [200, "[]", "empty"],
    [401, "{\"code\":\"42501\",\"message\":\"permission denied for table orders\"}", "protected"],
    [403, "{\"message\":\"permission denied for table orders\"}", "protected"],
    [404, "{\"code\":\"PGRST205\",\"message\":\"Could not find the table 'public.ordrs'\"}", "unestablished"],
    [401, "{\"message\":\"Invalid API key\"}", "unestablished"],
    [503, "", "unestablished"],
    [200, "<html>", "unestablished"],
  ] as const)("%i %s → %s", (status, body, out) => {
    expect(classifySupabaseProbe(status, body)).toBe(out);
  });
});

describe("classifyFirestoreProbe / classifyRtdbProbe", () => {
  it.each([
    [200, "{\"documents\":[{\"name\":\"x\"}]}", "exposed"],
    [200, "{}", "readable_empty"],
    [403, "{\"error\":{\"status\":\"PERMISSION_DENIED\",\"message\":\"Missing or insufficient permissions.\"}}", "protected"],
    [403, "{\"error\":{\"status\":\"PERMISSION_DENIED\",\"message\":\"Cloud Firestore API has not been used in project x before or it is disabled.\"}}", "unestablished"],
    [404, "{\"error\":{\"message\":\"The database (default) does not exist for project x\"}}", "unestablished"],
    // A project id scraped wrongly: Firestore says PERMISSION_DENIED, but it is not the rules (live, Oct 2026).
    [403, "{\"error\":{\"code\":403,\"message\":\"Permission denied on resource project wrong-id.\",\"status\":\"PERMISSION_DENIED\",\"details\":[{\"reason\":\"CONSUMER_INVALID\"}]}}", "unestablished"],
  ] as const)("Firestore %i → %s", (status, body, out) => {
    expect(classifyFirestoreProbe(status, body)).toBe(out);
  });
  it.each([
    [200, "{\"users\":true}", "exposed"],
    [200, "null", "readable_empty"],
    [401, "{\"error\":\"Permission denied\"}", "protected"],
    [404, "Firebase error. Please ensure that you have the URL of your Firebase Realtime Database instance configured correctly.", "unestablished"],
    [423, "{\"error\":\"database deactivated\"}", "unestablished"],
  ] as const)("RTDB %i → %s", (status, body, out) => {
    expect(classifyRtdbProbe(status, body)).toBe(out);
  });
});

describe("supabase_rls_enforced", () => {
  it("FAILs when a table returns rows to the anon key", async () => {
    route = (u) => (u.includes("/rest/v1/orders") ? json(200, [{ id: 1 }]) : json(401, { code: "42501", message: "permission denied" }));
    expect((await check(supaPage(["orders", "users"]), "supabase_rls_enforced")).status).toBe("FAIL");
  });

  it("PASSes only when every probed table explicitly denied the read", async () => {
    route = () => json(401, { code: "42501", message: "permission denied for table x" });
    const c = await check(supaPage(["orders", "users"]), "supabase_rls_enforced");
    expect(c.status).toBe("PASS");
  });

  it("a 404 (wrongly scraped table) is NOT protection — INCONCLUSIVE", async () => {
    route = () => json(404, { code: "PGRST205", message: "Could not find the table" });
    expect((await check(supaPage(["ordrs"]), "supabase_rls_enforced")).status).toBe("INCONCLUSIVE");
  });

  it("a rotated key (401 Invalid API key) is NOT protection — INCONCLUSIVE", async () => {
    route = () => json(401, { message: "Invalid API key" });
    expect((await check(supaPage(["orders"]), "supabase_rls_enforced")).status).toBe("INCONCLUSIVE");
  });

  it("a 5xx is NOT protection — INCONCLUSIVE", async () => {
    route = () => json(503, "");
    expect((await check(supaPage(["orders"]), "supabase_rls_enforced")).status).toBe("INCONCLUSIVE");
  });

  it("one denial plus one unanswered table is WARN, not PASS", async () => {
    route = (u) => (u.includes("/orders") ? json(401, { code: "42501", message: "permission denied" }) : json(500, ""));
    expect((await check(supaPage(["orders", "users"]), "supabase_rls_enforced")).status).toBe("WARN");
  });

  it("no anon key in the bundle is INCONCLUSIVE, not a WARN", async () => {
    const c = await check(`<script>createClient("${SUPA}")</script>`, "supabase_rls_enforced");
    expect(c.status).toBe("INCONCLUSIVE");
  });
});

describe("firebase_rules_locked", () => {
  const fbPage = (extra = "") =>
    `<script>const firebaseConfig = { projectId: "demo-proj", authDomain: "demo-proj.firebaseapp.com" ${extra} }; collection(db, "orders");</script>`;

  it("an empty 200 means the rules ALLOW the read — WARN, never PASS", async () => {
    route = () => json(200, {});
    const c = await check(fbPage(), "firebase_rules_locked");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/accepted an unauthenticated read/);
  });

  it("documents returned is a FAIL", async () => {
    route = () => json(200, { documents: [{ name: "x" }] });
    expect((await check(fbPage(), "firebase_rules_locked")).status).toBe("FAIL");
  });

  it("the rules' own denial is a PASS", async () => {
    route = () => json(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "Missing or insufficient permissions." } });
    expect((await check(fbPage(), "firebase_rules_locked")).status).toBe("PASS");
  });

  it("a wrong project id (403 CONSUMER_INVALID) is INCONCLUSIVE, not a PASS", async () => {
    route = () => json(403, { error: { code: 403, message: "Permission denied on resource project demo-proj.", status: "PERMISSION_DENIED", details: [{ reason: "CONSUMER_INVALID" }] } });
    expect((await check(fbPage(), "firebase_rules_locked")).status).toBe("INCONCLUSIVE");
  });

  it("a 404 (no default database) is INCONCLUSIVE, not a PASS", async () => {
    route = () => json(404, { error: { message: "The database (default) does not exist" } });
    expect((await check(fbPage(), "firebase_rules_locked")).status).toBe("INCONCLUSIVE");
  });

  it("probes the Realtime Database too: an open root is a FAIL even when Firestore is locked", async () => {
    route = (u) => (u.includes("firebaseio.com") ? json(200, { users: true }) : json(403, { error: { status: "PERMISSION_DENIED", message: "Missing or insufficient permissions." } }));
    const c = await check(fbPage(`, databaseURL: "https://demo-proj-default-rtdb.firebaseio.com"`), "firebase_rules_locked");
    expect(c.status).toBe("FAIL");
    expect(c.detail).toMatch(/Realtime Database/);
  });
});
