/**
 * The Platform console's change rules — pure, so the server (src/server/platform) and
 * the demo (src/lib/demo/demo-platform.ts) apply exactly the same ones.
 */

import { WORKSPACE_MODULE_IDS } from "@/lib/workspace-modules";
import type { PlatformWorkspace, PlatformWorkspacePage, PlatformWorkspaceUpdate } from "@/lib/platform-types";

/**
 * Gitwork's own workspace. Mirrors DEFAULT_WORKSPACE_SLUG in src/server/proposals.ts,
 * which this file can't import (it is server-only); a test keeps the two equal.
 */
export const HOME_WORKSPACE_SLUG = "gitwork";

export class PlatformInputError extends Error {
  status = 400;
}

/** Someone else saved this business after the draft was opened. */
export class PlatformConflictError extends Error {
  status = 409;
}

interface CurrentSettings {
  slug: string;
  modulesRestricted: boolean;
  enabledModules: string[];
  platformAiKeysAllowed: boolean;
  /** ISO time it last changed, when known. */
  updatedAt?: string;
}

/**
 * Pure: what `input` would change on `current`, or a PlatformInputError saying why it
 * is refused. Separate from the write so the rules are testable without a database.
 */
export function planWorkspaceUpdate(current: CurrentSettings, input: PlatformWorkspaceUpdate) {
  // Two people with the same business open: the second save would silently undo the
  // first. Refuse it and let them see what changed.
  if (
    input.expectedUpdatedAt &&
    current.updatedAt &&
    Date.parse(input.expectedUpdatedAt) !== Date.parse(current.updatedAt)
  ) {
    throw new PlatformConflictError("Someone else changed this business since you opened it. Reload to see their change.");
  }
  const unknown = (input.enabledModules ?? []).filter((id) => !WORKSPACE_MODULE_IDS.includes(id));
  if (unknown.length) throw new PlatformInputError(`Unknown module: ${unknown.join(", ")}`);

  const next = {
    modulesRestricted: input.modulesRestricted ?? current.modulesRestricted,
    // De-duplicated and kept in catalogue order, so two saves of the same choice
    // store the same value and the audit log shows no phantom change.
    enabledModules: input.enabledModules
      ? WORKSPACE_MODULE_IDS.filter((id) => input.enabledModules!.includes(id))
      : current.enabledModules,
    platformAiKeysAllowed: input.platformAiKeysAllowed ?? current.platformAiKeysAllowed,
  };
  const before = {
    modulesRestricted: current.modulesRestricted,
    enabledModules: current.enabledModules,
    platformAiKeysAllowed: current.platformAiKeysAllowed,
  };
  const changed = JSON.stringify(before) !== JSON.stringify(next);

  // Gitwork's own workspace is where every Gitwork user works, this console included.
  // Restricting its modules or its AI keys by a slip would take features away from the
  // whole team, so it needs saying twice.
  if (changed && current.slug === HOME_WORKSPACE_SLUG && !input.confirmHome) {
    throw new PlatformInputError("This is Gitwork's own workspace. Confirm to change it.");
  }
  // "Chosen modules" with none chosen would lock everyone in the business out of
  // everything but Settings. That is never what was meant.
  if (next.modulesRestricted && next.enabledModules.length === 0) {
    throw new PlatformInputError("Pick at least one module, or give this business every module.");
  }
  return { changed, before, next };
}


// ─── Listing businesses ──────────────────────────────────────────────────────

export const PLATFORM_SORT_KEYS = ["name", "created", "members"] as const;
export type PlatformSortKey = (typeof PLATFORM_SORT_KEYS)[number];
export const PLATFORM_PAGE_SIZE = 20;
export const PLATFORM_MAX_PAGE_SIZE = 50;

export interface PlatformWorkspaceQuery {
  q: string;
  /** 0-based. */
  page: number;
  pageSize: number;
  sort: PlatformSortKey;
  dir: "asc" | "desc";
  /** "every" = unrestricted, "chosen" = a chosen set of modules. */
  modules: "any" | "every" | "chosen";
  /** "gitwork" = may use Gitwork's AI keys, "own" = its own keys only. */
  ai: "any" | "gitwork" | "own";
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T, label: string): T {
  if (value === null || value === "") return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new PlatformInputError(`${label} must be one of: ${allowed.join(", ")}`);
}

function wholeNumber(value: string | null, fallback: number, label: string, min: number, max: number): number {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new PlatformInputError(`${label} must be a whole number`);
  const n = Number(value);
  if (n < min || n > max) throw new PlatformInputError(`${label} must be between ${min} and ${max}`);
  return n;
}

/**
 * Reads and validates the list query (GET /api/platform/workspaces). A bad value is
 * refused with a sentence naming it, never silently replaced by a default.
 */
export function parsePlatformWorkspaceQuery(params: URLSearchParams): PlatformWorkspaceQuery {
  const q = (params.get("q") ?? "").trim();
  if (q.length > 100) throw new PlatformInputError("Search must be 100 characters or fewer");
  const sort = oneOf(params.get("sort"), PLATFORM_SORT_KEYS, "created", "sort");
  return {
    q,
    page: wholeNumber(params.get("page"), 0, "page", 0, 100_000),
    pageSize: wholeNumber(params.get("pageSize"), PLATFORM_PAGE_SIZE, "pageSize", 1, PLATFORM_MAX_PAGE_SIZE),
    sort,
    // Newest first by default; names read A→Z.
    dir: oneOf(params.get("dir"), ["asc", "desc"] as const, sort === "name" ? "asc" : "desc", "dir"),
    modules: oneOf(params.get("modules"), ["any", "every", "chosen"] as const, "any", "modules"),
    ai: oneOf(params.get("ai"), ["any", "gitwork", "own"] as const, "any", "ai"),
  };
}

/** The query back as URL parameters, leaving out defaults so links stay short. */
export function platformQueryString(q: Partial<PlatformWorkspaceQuery>): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize && q.pageSize !== PLATFORM_PAGE_SIZE) p.set("pageSize", String(q.pageSize));
  if (q.sort) p.set("sort", q.sort);
  if (q.dir) p.set("dir", q.dir);
  if (q.modules && q.modules !== "any") p.set("modules", q.modules);
  if (q.ai && q.ai !== "any") p.set("ai", q.ai);
  return p.toString();
}

/**
 * Pure version of the server's listing, for the demo and tests: search, filter, sort and
 * page. The server does the same in the database. The page is clamped to the last one,
 * so a filter that shrinks the list never shows an empty page.
 */
export function applyPlatformQuery(all: PlatformWorkspace[], q: PlatformWorkspaceQuery): PlatformWorkspacePage {
  const needle = q.q.toLowerCase();
  const matched = all.filter((w) => {
    if (needle && !w.name.toLowerCase().includes(needle) && !w.slug.toLowerCase().includes(needle)) return false;
    if (q.modules === "every" && w.modulesRestricted) return false;
    if (q.modules === "chosen" && !w.modulesRestricted) return false;
    if (q.ai === "gitwork" && !w.platformAiKeysAllowed) return false;
    if (q.ai === "own" && w.platformAiKeysAllowed) return false;
    return true;
  });
  const sign = q.dir === "asc" ? 1 : -1;
  const collator = new Intl.Collator("en-GB", { sensitivity: "base" });
  matched.sort((a, b) => {
    const c =
      q.sort === "name"
        ? collator.compare(a.name, b.name)
        : q.sort === "members"
          ? a.activeMembers - b.activeMembers
          : Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return c !== 0 ? c * sign : a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(matched.length / q.pageSize));
  const page = Math.min(q.page, pages - 1);
  return {
    workspaces: matched.slice(page * q.pageSize, (page + 1) * q.pageSize),
    total: matched.length,
    page,
    pageSize: q.pageSize,
  };
}

/** Validates the activity query (GET /api/platform/audit). */
export function parsePlatformAuditQuery(params: URLSearchParams): { page: number; pageSize: number; workspaceId: string | null } {
  const workspaceId = params.get("workspaceId")?.trim() || null;
  if (workspaceId && !/^[A-Za-z0-9_-]{1,64}$/.test(workspaceId)) throw new PlatformInputError("workspaceId is not a valid id");
  return {
    page: wholeNumber(params.get("page"), 0, "page", 0, 100_000),
    pageSize: wholeNumber(params.get("pageSize"), PLATFORM_PAGE_SIZE, "pageSize", 1, PLATFORM_MAX_PAGE_SIZE),
    workspaceId,
  };
}
