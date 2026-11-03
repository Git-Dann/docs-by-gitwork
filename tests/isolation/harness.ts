/**
 * Finds every API route, fills its path with the OTHER business's ids, calls its handler as a
 * member of one business, and decides whether anything crossed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";
import { ctx } from "./context";
import { IDS, MARK, OTHER, identity, type Side, type SideIds } from "./fixtures";

export const API_ROOT = join(process.cwd(), "src", "app", "api");
export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export type RouteKind = "app" | "token" | "cron" | "webhook" | "auth" | "platform" | "public";

export type RouteInfo = {
  file: string;
  /** `/api/tasks/[id]` */
  pattern: string;
  segments: string[];
  params: string[];
  methods: Method[];
  kind: RouteKind;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

export function discoverRoutes(): RouteInfo[] {
  return walk(API_ROOT)
    .map((file) => {
      const segments = relative(API_ROOT, file).split(sep).slice(0, -1);
      const pattern = `/api/${segments.join("/")}`;
      const params = segments.filter((s) => s.startsWith("[")).map((s) => s.replace(/^\[\.{0,3}|\]$/g, ""));
      const src = readFileSync(file, "utf8");
      const methods = METHODS.filter((m) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`).test(src),
      );
      return { file, pattern, segments, params, methods, kind: kindOf(segments) };
    })
    .sort((x, y) => x.pattern.localeCompare(y.pattern));
}

function kindOf(segments: string[]): RouteKind {
  const [head] = segments;
  if (head === "cron") return "cron";
  if (head === "webhooks" || segments.includes("webhook")) return "webhook";
  if (head === "auth") return "auth";
  if (head === "platform") return "platform";
  if (segments.includes("[token]") || head === "public" || head === "badge" || head === "embed") return "token";
  return "app";
}

/**
 * What to put in each dynamic segment. Ids name the VICTIM's rows: the question is whether the
 * attacker can reach them. A `[token]` is the opposite: it is a credential the holder already has,
 * so it is the ATTACKER's own token, and the question is whether it reaches the victim's data.
 */
function fill(param: string, before: string[], attacker: SideIds, victim: SideIds): string | null {
  const parent = before.filter((s) => !s.startsWith("[")).join("/");
  const last = before[before.length - 1] ?? "";
  const inWiki = before.includes("wiki") || before.includes("[token]");
  switch (param) {
    case "slug":
      if (last === "clients") return victim.clientSlug;
      return null;
    case "clientId":
      if (parent.startsWith("support/clients")) return victim.supportClient;
      if (last === "summary") return victim.client;
      return null;
    case "token": {
      if (before[0] === "wiki" || before[0] === "public" && last === "wiki-items") return attacker.wikiToken;
      if (before[0] === "docs") return attacker.documentToken;
      if (before[0] === "onboarding") return attacker.onboardingToken;
      if (["report", "badge/pulse", "public/pulse/report"].includes(parent)) return attacker.scanShareToken;
      if (parent === "public/heartbeat") return attacker.heartbeatToken;
      return null;
    }
    case "scanId":
      return victim.scan;
    case "sheetId":
      return victim.sheet;
    case "rowId":
      return victim.sheetRow;
    case "convId":
      return victim.conversation;
    case "userId":
      return victim.user;
    case "platformId":
      return victim.platform;
    case "ticketId":
      return victim.ticket;
    case "taskId":
      return victim.task;
    case "studyId":
      return victim.study;
    case "incidentId":
      return victim.monitorIncident;
    case "monitorId":
      return inWiki ? victim.wikiMonitor : victim.monitor;
    case "placementId":
      return victim.placement;
    case "docId":
      return victim.staffDocument;
    case "id":
      return ID_BY_PARENT[stripParams(before)]?.(victim) ?? null;
    default:
      return null;
  }
}

function stripParams(before: string[]): string {
  return before.map((s) => (s.startsWith("[") ? "*" : s)).join("/");
}

const ID_BY_PARENT: Record<string, (v: SideIds) => string> = {
  documents: (v) => v.document,
  proposals: (v) => v.document,
  tasks: (v) => v.task,
  "feature-blocks": (v) => v.featureBlock,
  milestones: (v) => v.milestone,
  "codeclear/candidates": (v) => v.candidate,
  staff: (v) => v.candidate,
  "team/members": (v) => v.member,
  "team/invites": (v) => v.invite,
  messages: (v) => v.message,
  "backstage/leave": (v) => v.leave,
  "backstage/expenses": (v) => v.expense,
  "backstage/absences": (v) => v.absence,
  handbook: (v) => v.handbook,
  snippets: (v) => v.snippet,
  "rate-card/people": (v) => v.rateCardPerson,
  "desk/reminders": (v) => v.reminder,
  "clients/onboarding-links": (v) => v.onboarding,
  "clients/*/wiki/intake-items": (v) => v.intakeItem,
  "wiki/*/intake-items": (v) => v.intakeItem,
  "clients/*/wiki/monitors": (v) => v.wikiMonitor,
  "clients/*/wiki/documents": (v) => v.wikiDocument,
  "wiki/*/documents": (v) => v.wikiDocument,
  "clients/*/wiki/changelog": (v) => v.changelog,
  "clients/*/meetings": (v) => v.meeting,
  "clients/*/crm/actions": (v) => v.leadAction,
  "platform/workspaces": (v) => v.workspace,
  templates: (v) => v.template,
};

export type Planned = {
  route: RouteInfo;
  method: Method;
  attacker: Side;
  victim: Side;
  path: string;
  params: Record<string, string>;
  /** False when a segment couldn't be filled; the call still runs but proves nothing about isolation. */
  covered: boolean;
};

/**
 * GET runs on every route. Writes run only where the path names a victim row: a write with no
 * victim id lands in the attacker's own business, which is not this suite's question.
 */
export function plan(routes: RouteInfo[], attacker: Side): Planned[] {
  const victim = OTHER[attacker];
  const out: Planned[] = [];
  for (const route of routes) {
    if (route.kind === "cron" || route.kind === "webhook" || route.kind === "auth") continue;
    const params: Record<string, string> = {};
    let covered = true;
    route.segments.forEach((seg, idx) => {
      if (!seg.startsWith("[")) return;
      const name = seg.replace(/^\[\.{0,3}|\]$/g, "");
      const value = fill(name, route.segments.slice(0, idx), IDS[attacker], IDS[victim]);
      params[name] = value ?? `iso-unmapped-${name}`;
      if (value === null) covered = false;
    });
    const path = "/api/" + route.segments.map((s) => (s.startsWith("[") ? params[s.replace(/^\[\.{0,3}|\]$/g, "")] : s)).join("/");
    const victimIdInPath = route.params.some((p) => p !== "token") && covered;
    for (const method of route.methods) {
      if (method !== "GET" && !victimIdInPath) continue;
      out.push({ route, method, attacker, victim, path, params, covered });
    }
  }
  return out;
}

export type Verdict = "refused" | "rejected" | "isolated" | "LEAK" | "WROTE" | "error" | "uncovered";

export type Outcome = Planned & { status: number | null; verdict: Verdict; wrote: boolean; note?: string };

const CALL_TIMEOUT_MS = 15_000;
const BODY_LIMIT = 2_000_000;

async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 3_000;
  while (text.length < BODY_LIMIT && Date.now() < deadline) {
    const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), 1_000))]);
    if (!chunk || chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

/** Call one handler as `attacker`. Returns the status and body, or the error it threw. */
export async function call(p: Planned): Promise<{ status: number | null; body: string; error?: string }> {
  const who = identity(p.attacker);
  const headers = new Headers({
    "x-foundry-user-id": who.id,
    "x-foundry-user-email": who.email,
    "x-foundry-user-role": who.role,
    "x-foundry-user-workspace": who.workspaceId,
    "content-type": "application/json",
  });
  ctx.session = { user: { id: who.id, email: who.email, workspaceId: who.workspaceId, role: who.role } };
  ctx.headers = headers;
  const url = `http://localhost${p.path}`;
  const req = new NextRequest(url, {
    method: p.method,
    headers,
    body: p.method === "GET" || p.method === "DELETE" ? undefined : "{}",
  });
  try {
    const mod = (await import(p.route.file)) as Record<string, unknown>;
    const handler = mod[p.method] as ((r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>) | undefined;
    if (typeof handler !== "function") return { status: null, body: "", error: "no handler export" };
    const res = await Promise.race([
      handler(req, { params: Promise.resolve(p.params) }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), CALL_TIMEOUT_MS)),
    ]);
    return { status: res.status, body: await readBody(res) };
  } catch (err) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : null;
    return { status, body: "", error: err instanceof Error ? err.message : String(err) };
  }
}

export function judge(p: Planned, r: { status: number | null; body: string; error?: string }, wrote: boolean): Verdict {
  if (r.body.includes(MARK(p.victim))) return "LEAK";
  if (wrote) return "WROTE";
  if (!p.covered) return "uncovered";
  if (r.status === null) return "error";
  if (r.status === 401 || r.status === 403 || r.status === 404) return "refused";
  if (r.status >= 500) return "error";
  if (r.status >= 400) return "rejected";
  return "isolated";
}

export const keyOf = (o: Pick<Outcome, "method" | "route" | "attacker" | "victim">) =>
  `${o.method} ${o.route.pattern} ${o.attacker}→${o.victim}`;
