"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { WikiPageEditorHandle } from "./wiki-page-editor";

type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ApiDocsEndpoint {
  tag: string;
  method: ApiMethod;
  path: string;
  operationId: string;
  auth: boolean;
  summary: string;
}

export interface ApiDocsServer {
  url: string;
  label: string;
}

export interface ApiDocsContent {
  title: string;
  schemaPath: string;
  environment: string;
  specVersion: string;
  description: string;
  websiteLabel: string;
  websiteUrl: string;
  servers: ApiDocsServer[];
  endpoints: ApiDocsEndpoint[];
}

interface Props {
  title: string;
  content: unknown;
  onSave: (title: string, content: ApiDocsContent) => Promise<void>;
  mode: "edit" | "preview";
  onSaved?: (label: "Saved" | "Auto-saved") => void;
  readOnly?: boolean;
}

const DEFAULT_API_DOCS: ApiDocsContent = {
  title: "Client API",
  schemaPath: "/api/schema/",
  environment: "STAGE",
  specVersion: "OAS 3.0",
  description: "API documentation for the client application.",
  websiteLabel: "Client Website",
  websiteUrl: "",
  servers: [
    { url: "https://api.example.com", label: "STAGE" },
    { url: "https://api.example.com", label: "PRODUCTION" },
  ],
  endpoints: [
    {
      tag: "analytics",
      method: "GET",
      path: "/api/analytics/reports/",
      operationId: "analytics_reports_retrieve",
      auth: true,
      summary: "Retrieve analytics reports.",
    },
    {
      tag: "analytics",
      method: "GET",
      path: "/api/analytics/subscriptions/",
      operationId: "analytics_subscriptions_retrieve",
      auth: true,
      summary: "Retrieve subscription analytics.",
    },
    {
      tag: "users",
      method: "POST",
      path: "/api/users/",
      operationId: "users_create",
      auth: true,
      summary: "Create a user record.",
    },
  ],
};

const METHOD_STYLES: Record<ApiMethod, string> = {
  GET: "border-sky-300 bg-sky-50 text-sky-700",
  POST: "border-emerald-300 bg-emerald-50 text-emerald-700",
  PATCH: "border-amber-300 bg-amber-50 text-amber-700",
  PUT: "border-violet-300 bg-violet-50 text-violet-700",
  DELETE: "border-rose-300 bg-rose-50 text-rose-700",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function methodValue(value: unknown): ApiMethod {
  const method = stringValue(value, "GET").toUpperCase();
  return ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method)
    ? (method as ApiMethod)
    : "GET";
}

export function normalizeApiDocsContent(content: unknown, fallbackTitle = "API Docs"): ApiDocsContent {
  if (!isRecord(content)) return { ...DEFAULT_API_DOCS, title: fallbackTitle };
  const servers = Array.isArray(content.servers)
    ? content.servers
        .filter(isRecord)
        .map((server) => ({
          url: stringValue(server.url).trim(),
          label: stringValue(server.label, "Server").trim() || "Server",
        }))
        .filter((server) => server.url)
    : DEFAULT_API_DOCS.servers;
  const endpoints = Array.isArray(content.endpoints)
    ? content.endpoints
        .filter(isRecord)
        .map((endpoint) => ({
          tag: stringValue(endpoint.tag, "default").trim() || "default",
          method: methodValue(endpoint.method),
          path: stringValue(endpoint.path, "/api/resource/").trim() || "/api/resource/",
          operationId:
            stringValue(endpoint.operationId).trim() ||
            stringValue(endpoint.path, "resource").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, ""),
          auth: typeof endpoint.auth === "boolean" ? endpoint.auth : true,
          summary: stringValue(endpoint.summary).trim(),
        }))
    : DEFAULT_API_DOCS.endpoints;

  return {
    title: stringValue(content.title, fallbackTitle).trim() || fallbackTitle,
    schemaPath: stringValue(content.schemaPath, DEFAULT_API_DOCS.schemaPath).trim() || DEFAULT_API_DOCS.schemaPath,
    environment: stringValue(content.environment, DEFAULT_API_DOCS.environment).trim() || DEFAULT_API_DOCS.environment,
    specVersion: stringValue(content.specVersion, DEFAULT_API_DOCS.specVersion).trim() || DEFAULT_API_DOCS.specVersion,
    description: stringValue(content.description, DEFAULT_API_DOCS.description).trim(),
    websiteLabel: stringValue(content.websiteLabel, DEFAULT_API_DOCS.websiteLabel).trim() || DEFAULT_API_DOCS.websiteLabel,
    websiteUrl: stringValue(content.websiteUrl).trim(),
    servers: servers.length ? servers : DEFAULT_API_DOCS.servers,
    endpoints: endpoints.length ? endpoints : DEFAULT_API_DOCS.endpoints,
  };
}

function serversToText(servers: ApiDocsServer[]): string {
  return servers.map((server) => `${server.url} | ${server.label}`).join("\n");
}

function endpointsToText(endpoints: ApiDocsEndpoint[]): string {
  return endpoints
    .map((endpoint) =>
      [
        endpoint.tag,
        endpoint.method,
        endpoint.path,
        endpoint.operationId,
        endpoint.auth ? "auth" : "public",
        endpoint.summary,
      ].join(" | "),
    )
    .join("\n");
}

function parseServers(text: string): ApiDocsServer[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, label] = line.split("|").map((part) => part.trim());
      return { url, label: label || "Server" };
    })
    .filter((server) => server.url);
}

function parseEndpoints(text: string): ApiDocsEndpoint[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [tag, method, path, operationId, auth, ...summaryParts] = line
        .split("|")
        .map((part) => part.trim());
      return {
        tag: tag || "default",
        method: methodValue(method),
        path: path || "/api/resource/",
        operationId: operationId || (path || "resource").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, ""),
        auth: (auth || "auth").toLowerCase() !== "public",
        summary: summaryParts.join(" | "),
      };
    });
}

function endpointGroups(endpoints: ApiDocsEndpoint[]) {
  const groups = new Map<string, ApiDocsEndpoint[]>();
  for (const endpoint of endpoints) {
    const list = groups.get(endpoint.tag) ?? [];
    list.push(endpoint);
    groups.set(endpoint.tag, list);
  }
  return [...groups.entries()].map(([tag, items]) => ({ tag, items }));
}

export const ApiDocsPageEditor = forwardRef<WikiPageEditorHandle, Props>(
  function ApiDocsPageEditor({ title, content, onSave, mode, onSaved, readOnly = false }, ref) {
    const initial = useMemo(() => normalizeApiDocsContent(content, title), [content, title]);
    const [doc, setDoc] = useState(initial);
    const [serversText, setServersText] = useState(() => serversToText(initial.servers));
    const [endpointsText, setEndpointsText] = useState(() => endpointsToText(initial.endpoints));
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef({ doc, serversText, endpointsText });

    useEffect(() => {
      latest.current = { doc, serversText, endpointsText };
    }, [doc, serversText, endpointsText]);

    const buildContent = useCallback(() => ({
      ...latest.current.doc,
      servers: parseServers(latest.current.serversText),
      endpoints: parseEndpoints(latest.current.endpointsText),
    }), []);

    const save = useCallback(async (label: "Saved" | "Auto-saved") => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      const next = buildContent();
      await onSave(next.title, next);
      onSaved?.(label);
    }, [buildContent, onSave, onSaved]);

    const scheduleAutoSave = useCallback(() => {
      if (readOnly) return;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        void save("Auto-saved");
      }, 2500);
    }, [readOnly, save]);

    useEffect(
      () => () => {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      },
      [],
    );

    useImperativeHandle(ref, () => ({ save: () => save("Saved") }), [save]);

    const previewContent = useMemo(
      () => ({
        ...doc,
        servers: parseServers(serversText),
        endpoints: parseEndpoints(endpointsText),
      }),
      [doc, serversText, endpointsText],
    );

    if (readOnly || mode === "preview") {
      return <ApiDocsReference content={previewContent} />;
    }

    const inputCls =
      "w-full rounded-[7px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]";
    const textareaCls = `${inputCls} min-h-[120px] font-mono text-[12px] leading-5`;

    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Title</span>
            <input
              value={doc.title}
              onChange={(event) => {
                setDoc((current) => ({ ...current, title: event.target.value }));
                scheduleAutoSave();
              }}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Schema path</span>
            <input
              value={doc.schemaPath}
              onChange={(event) => {
                setDoc((current) => ({ ...current, schemaPath: event.target.value }));
                scheduleAutoSave();
              }}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Environment</span>
            <input
              value={doc.environment}
              onChange={(event) => {
                setDoc((current) => ({ ...current, environment: event.target.value }));
                scheduleAutoSave();
              }}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Spec version</span>
            <input
              value={doc.specVersion}
              onChange={(event) => {
                setDoc((current) => ({ ...current, specVersion: event.target.value }));
                scheduleAutoSave();
              }}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Description</span>
            <textarea
              value={doc.description}
              onChange={(event) => {
                setDoc((current) => ({ ...current, description: event.target.value }));
                scheduleAutoSave();
              }}
              className={`${inputCls} min-h-[78px]`}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Website label</span>
            <input
              value={doc.websiteLabel}
              onChange={(event) => {
                setDoc((current) => ({ ...current, websiteLabel: event.target.value }));
                scheduleAutoSave();
              }}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-[var(--text-4)]">Website URL</span>
            <input
              value={doc.websiteUrl}
              onChange={(event) => {
                setDoc((current) => ({ ...current, websiteUrl: event.target.value }));
                scheduleAutoSave();
              }}
              className={inputCls}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-medium text-[var(--text-4)]">Servers</span>
          <textarea
            value={serversText}
            onChange={(event) => {
              setServersText(event.target.value);
              scheduleAutoSave();
            }}
            className={textareaCls}
            spellCheck={false}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-medium text-[var(--text-4)]">Endpoints</span>
          <textarea
            value={endpointsText}
            onChange={(event) => {
              setEndpointsText(event.target.value);
              scheduleAutoSave();
            }}
            className={`${textareaCls} min-h-[220px]`}
            spellCheck={false}
          />
        </label>

        <ApiDocsReference content={previewContent} />
      </div>
    );
  },
);

export function ApiDocsReference({ content }: { content: ApiDocsContent }) {
  const [filter, setFilter] = useState("");
  const [selectedServer, setSelectedServer] = useState(content.servers[0]?.url ?? "");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const needle = filter.trim().toLowerCase();
  const filteredEndpoints = needle
    ? content.endpoints.filter((endpoint) =>
        [endpoint.tag, endpoint.method, endpoint.path, endpoint.operationId, endpoint.summary]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : content.endpoints;
  const groups = endpointGroups(filteredEndpoints);

  return (
    <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
      <div className="bg-[var(--surface-0)] px-5 py-6 md:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[30px] font-semibold leading-tight text-[var(--text-1)] md:text-[38px]">
            {content.title}
          </h1>
          <span className="rounded-full bg-slate-600 px-2 py-0.5 text-[11px] font-bold text-white">
            {content.environment}
          </span>
          <span className="rounded-full bg-lime-600 px-2 py-0.5 text-[11px] font-bold text-white">
            {content.specVersion}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-[var(--brand-600)]">{content.schemaPath}</p>
        {content.description ? (
          <p className="mt-5 max-w-3xl text-sm leading-6 text-[var(--text-2)]">{content.description}</p>
        ) : null}
        {content.websiteUrl ? (
          <a
            href={content.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-600)] hover:underline"
          >
            {content.websiteLabel}
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 border-y border-[rgba(0,0,0,0.08)] px-5 py-5 md:px-7">
        <label className="min-w-[260px] max-w-full flex-1 space-y-1">
          <span className="block text-[11px] font-semibold text-[var(--text-3)]">Servers</span>
          <select
            value={selectedServer}
            onChange={(event) => setSelectedServer(event.target.value)}
            className="w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-1)]"
          >
            {content.servers.map((server) => (
              <option key={`${server.url}-${server.label}`} value={server.url}>
                {server.url} - {server.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-[6px] border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-600"
        >
          Authorize
          <LockClosedIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 px-5 py-6 md:px-7">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by tag"
          className="w-full rounded-[6px] border border-[var(--border-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-500)]"
        />

        {groups.map((group) => (
          <section key={group.tag} className="space-y-2">
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.12)] pb-2">
              <h2 className="text-[22px] font-semibold text-[var(--text-1)]">{group.tag}</h2>
              <ChevronDownIcon className="h-5 w-5 text-[var(--text-3)]" />
            </div>
            <div className="space-y-2">
              {group.items.map((endpoint) => {
                const key = `${endpoint.method}:${endpoint.path}:${endpoint.operationId}`;
                const isOpen = Boolean(open[key]);
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-[6px] border border-sky-300 bg-sky-50"
                  >
                    <button
                      type="button"
                      onClick={() => setOpen((current) => ({ ...current, [key]: !isOpen }))}
                      className="flex w-full items-center gap-3 px-2 py-2 text-left"
                    >
                      <span
                        className={cn(
                          "inline-flex w-[72px] shrink-0 justify-center rounded-[4px] border px-2 py-1 text-[12px] font-bold",
                          METHOD_STYLES[endpoint.method],
                        )}
                      >
                        {endpoint.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[15px] font-semibold text-[var(--text-1)]">
                        {endpoint.path}
                      </span>
                      <span className="hidden max-w-[260px] truncate font-mono text-[12px] font-semibold text-[var(--text-2)] md:block">
                        {endpoint.operationId}
                      </span>
                      {endpoint.auth ? <LockClosedIcon className="h-4 w-4 shrink-0 text-black" /> : null}
                      <ChevronDownIcon className={cn("h-4 w-4 shrink-0 transition", isOpen && "rotate-180")} />
                    </button>
                    {isOpen ? (
                      <div className="border-t border-sky-200 bg-white px-4 py-3">
                        <p className="text-sm leading-6 text-[var(--text-2)]">
                          {endpoint.summary || "No summary yet."}
                        </p>
                        <dl className="mt-3 grid gap-3 text-xs md:grid-cols-3">
                          <div>
                            <dt className="font-semibold text-[var(--text-4)]">Operation</dt>
                            <dd className="mt-1 font-mono text-[var(--text-1)]">{endpoint.operationId}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[var(--text-4)]">Auth</dt>
                            <dd className="mt-1 text-[var(--text-1)]">{endpoint.auth ? "Required" : "Public"}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[var(--text-4)]">Server</dt>
                            <dd className="mt-1 truncate font-mono text-[var(--text-1)]">{selectedServer}</dd>
                          </div>
                        </dl>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {groups.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-[rgba(0,0,0,0.12)] py-10 text-center text-sm text-[var(--text-4)]">
            No endpoints match this filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}
