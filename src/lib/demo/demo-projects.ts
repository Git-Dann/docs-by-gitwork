/**
 * Demo projects for /demo/portal and /demo/money (CLAUDE.md §150), run through the real rules
 * (src/lib/project-budget.ts, src/lib/money.ts) so the demo shows what production would.
 * Writes from the popups land in memory, so an edit survives the refetch. Every name is invented.
 */

import { docTerms, type DocLine, type FxRates } from "@/lib/money";
import {
  overlappingProjects,
  projectFigures,
  timeElapsed,
  workProgress,
  type PlacementCost,
  type ProjectStatus,
} from "@/lib/project-budget";
import type { LinkableDocument, ProjectBudgetRow, ProjectDetailDTO, ProjectDTO, ProjectTaskRow } from "@/types/projects";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const FX: FxRates = { base: "GBP", rates: { USD: 0.79, EUR: 0.85 }, asOf: null, error: null };

const role = (unitCost: number, months: number): DocLine => ({ itemName: "proposal-role:dev", quantity: months, unitCost, subtotal: unitCost * months, costKind: "ONE_OFF" });
const once = (subtotal: number): DocLine => ({ itemName: "Discovery", quantity: 1, unitCost: subtotal, subtotal, costKind: "ONE_OFF" });

const DOCS: Array<LinkableDocument & { lines: DocLine[] }> = [
  { id: "doc-northwind-build", title: "Northwind platform build", wonAt: at(-128), total: null, currency: "GBP", lines: [role(6200, 6), role(4100, 6), once(4500)] },
  { id: "doc-northwind-support", title: "Northwind support and hosting", wonAt: at(-20), total: null, currency: "GBP", lines: [role(1800, 12)] },
].map((d) => ({ ...d, total: docTerms(d.lines, null).total }));

/** Who has been placed on Northwind: two priced developers and one with no rate yet. */
const PLACEMENTS: PlacementCost[] = [
  { candidateId: "dev-amira", start: at(-130), end: null, monthly: 5200, currency: "GBP", proBono: false },
  { candidateId: "dev-tomasz", start: at(-110), end: null, monthly: 4000, currency: "GBP", proBono: false },
  { candidateId: "dev-noor", start: at(-40), end: null, monthly: null, currency: "GBP", proBono: false },
];

type DemoProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string | null;
  documentId: string | null;
  budget: { amount: number; currency: string } | null;
  categories: string[];
  archived: boolean;
  tasks: ProjectTaskRow[];
};

function tasks(prefix: string, rows: Array<[string, boolean, number | null]>): ProjectTaskRow[] {
  return rows.map(([title, done, estimateHours], i) => ({ id: `${prefix}-${i}`, title, status: done ? "DONE" : i % 3 === 0 ? "DOING" : "TODO", done, estimateHours, via: i % 2 ? "release" : "task" }));
}

let projects: DemoProject[] = [
  {
    id: "proj-platform",
    name: "Platform build",
    status: "ACTIVE",
    startDate: at(-125),
    endDate: at(58),
    documentId: "doc-northwind-build",
    budget: null,
    categories: ["b1", "b2"],
    archived: false,
    tasks: tasks("pb", [
      ["Project scaffolding", true, 6],
      ["Auth + session", true, 14],
      ["CI/CD pipeline", true, 8],
      ["Design system tokens", true, 10],
      ["Members directory", true, 18],
      ["Booking flow", true, 26],
      ["Payments with Stripe", false, 22],
      ["Push notifications", false, 12],
      ["Admin reporting", false, 20],
      ["Offline mode", false, null],
      ["App Store submission", false, 6],
      ["Accessibility pass", false, 10],
    ]),
  },
  {
    id: "proj-support",
    name: "Support and hosting",
    status: "PLANNED",
    startDate: at(40),
    endDate: null,
    documentId: "doc-northwind-support",
    budget: null,
    categories: [],
    archived: false,
    tasks: [],
  },
];

function docFor(id: string | null) {
  return id ? DOCS.find((d) => d.id === id) ?? null : null;
}

function toDTO(p: DemoProject, money: boolean): ProjectDetailDTO {
  const now = new Date();
  const progress = workProgress(p.tasks);
  const doc = docFor(p.documentId);
  const budget = doc
    ? { amount: docTerms(doc.lines, null).total, currency: "GBP", source: "document" as const }
    : p.budget
      ? { ...p.budget, source: "manual" as const }
      : null;
  const live = projects.filter((x) => !x.archived);
  return {
    id: p.id,
    clientId: "cl-northwind",
    name: p.name,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    document: doc ? { id: doc.id, title: doc.title } : null,
    progress,
    timeShare: timeElapsed(p.startDate, p.endDate, now),
    releases: p.id === "proj-platform" ? [{ id: "rel-v140", label: "v1.4.0" }, { id: "rel-v150", label: "v1.5.0" }] : [],
    categories: p.categories.map((id) => ({ id, name: id === "b1" ? "Foundations & auth" : id === "b2" ? "Search & discovery" : id === "b3" ? "Analytics dashboard" : id === "b4" ? "Mobile polish" : id })),
    sharedWith: overlappingProjects(p, live),
    money: money
      ? {
          ...projectFigures({ start: p.startDate, end: p.endDate, now, budget, placements: PLACEMENTS, fx: FX, progress }),
          budgetProblem: null,
          manualBudget: !doc && p.budget ? p.budget : null,
        }
      : null,
    createdAt: p.startDate,
    updatedAt: p.startDate,
    tasks: [...p.tasks.filter((t) => !t.done), ...p.tasks.filter((t) => t.done)],
  };
}

type Body = Partial<{
  name: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string | null;
  documentId: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  featureBlockIds: string[];
}>;

function apply(p: DemoProject, b: Body): DemoProject {
  const next = { ...p };
  if (b.name !== undefined) next.name = b.name;
  if (b.status !== undefined) next.status = b.status;
  if (b.startDate !== undefined) next.startDate = new Date(b.startDate).toISOString();
  if (b.endDate !== undefined) next.endDate = b.endDate ? new Date(b.endDate).toISOString() : null;
  if (b.documentId !== undefined) next.documentId = b.documentId;
  if (next.documentId) next.budget = null;
  else if (b.budgetAmount !== undefined) next.budget = b.budgetAmount ? { amount: b.budgetAmount, currency: b.budgetCurrency || "GBP" } : null;
  if (b.featureBlockIds !== undefined) next.categories = b.featureBlockIds;
  return next;
}

/** Handles /api/clients/{slug}/projects(/id) and /api/money/projects for the demo. */
export function demoProjectsApi(pathname: string, search: URLSearchParams | null, init?: { method?: string; body?: unknown }): unknown {
  const body = (typeof init?.body === "string" ? JSON.parse(init.body) : {}) as Body;
  if (pathname === "/api/money/projects") {
    return {
      projects: projects
        .filter((p) => !p.archived)
        .map((p): ProjectBudgetRow => {
          const d = toDTO(p, true);
          return { id: d.id, name: d.name, status: d.status, clientName: "Northwind Studio", clientSlug: "northwind", startDate: d.startDate, endDate: d.endDate, progress: d.progress, timeShare: d.timeShare, money: d.money! };
        }),
    };
  }
  const one = pathname.match(/^\/api\/clients\/[^/]+\/projects\/([^/]+)$/);
  if (one) {
    const id = decodeURIComponent(one[1]);
    const p = projects.find((x) => x.id === id && !x.archived);
    if (!p) return { error: "Project not found", __status: 404 };
    if (init?.method === "DELETE") {
      projects = projects.map((x) => (x.id === id ? { ...x, archived: true } : x));
      return { ok: true };
    }
    if (init?.method === "PATCH") {
      const next = apply(p, body);
      projects = projects.map((x) => (x.id === id ? next : x));
      return { project: toDTO(next, true) };
    }
    return { project: toDTO(p, true) };
  }
  if (/^\/api\/clients\/[^/]+\/projects$/.test(pathname)) {
    if (init?.method === "POST") {
      const created = apply(
        { id: `proj-${projects.length + 1}-${Date.now()}`, name: "", status: "PLANNED", startDate: at(0), endDate: null, documentId: null, budget: null, categories: [], archived: false, tasks: [] },
        body,
      );
      projects = [...projects, created];
      return { project: toDTO(created, true) };
    }
    return {
      projects: projects.filter((p) => !p.archived).map((p) => toDTO(p, true) as ProjectDTO),
      documents: search?.get("documents") === "1" ? DOCS.map((d) => ({ id: d.id, title: d.title, wonAt: d.wonAt, total: d.total, currency: d.currency })) : null,
      canSeeMoney: true,
    };
  }
  return undefined;
}
