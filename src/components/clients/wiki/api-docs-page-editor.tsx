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
  CheckIcon,
  ChevronDownIcon,
  LockClosedIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { WikiPageEditorHandle } from "./wiki-page-editor";

type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type ApiParamLocation = "path" | "query" | "header";

const BODY_METHODS: ApiMethod[] = ["POST", "PUT", "PATCH"];
function methodHasBody(method: ApiMethod): boolean {
  return BODY_METHODS.includes(method);
}

export interface ApiDocsParam {
  name: string;
  in: ApiParamLocation;
  required: boolean;
  description: string;
}

export interface ApiDocsEndpoint {
  tag: string;
  method: ApiMethod;
  path: string;
  operationId: string;
  auth: boolean;
  summary: string;
  parameters: ApiDocsParam[];
  requestBody: string;
  responseExample: string;
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
      parameters: [
        { name: "from", in: "query", required: false, description: "Start date (ISO 8601)." },
        { name: "to", in: "query", required: false, description: "End date (ISO 8601)." },
      ],
      requestBody: "",
      responseExample: '{\n  "results": [\n    { "date": "2026-07-01", "total": 128 }\n  ]\n}',
    },
    {
      tag: "analytics",
      method: "GET",
      path: "/api/analytics/subscriptions/",
      operationId: "analytics_subscriptions_retrieve",
      auth: true,
      summary: "Retrieve subscription analytics.",
      parameters: [],
      requestBody: "",
      responseExample: '{\n  "active": 42,\n  "cancelled": 3\n}',
    },
    {
      tag: "users",
      method: "POST",
      path: "/api/users/",
      operationId: "users_create",
      auth: true,
      summary: "Create a user record.",
      parameters: [],
      requestBody: '{\n  "email": "user@example.com",\n  "name": "Jane Doe"\n}',
      responseExample: '{\n  "id": "usr_123",\n  "email": "user@example.com",\n  "name": "Jane Doe"\n}',
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

function paramLocationValue(value: unknown): ApiParamLocation {
  const location = stringValue(value, "query").toLowerCase();
  return location === "path" || location === "header" ? location : "query";
}

function normalizeParams(value: unknown): ApiDocsParam[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((param) => ({
      name: stringValue(param.name).trim(),
      in: paramLocationValue(param.in),
      required: typeof param.required === "boolean" ? param.required : false,
      description: stringValue(param.description).trim(),
    }))
    .filter((param) => param.name);
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
          parameters: normalizeParams(endpoint.parameters),
          requestBody: stringValue(endpoint.requestBody).trim(),
          responseExample: stringValue(endpoint.responseExample).trim(),
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
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef(doc);

    useEffect(() => {
      latest.current = doc;
    }, [doc]);

    const buildContent = useCallback(() => normalizeApiDocsContent(latest.current, title), [title]);

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

    const previewContent = useMemo(() => normalizeApiDocsContent(doc, title), [doc, title]);

    if (readOnly || mode === "preview") {
      return <ApiDocsReference content={previewContent} />;
    }

    function patchDoc(patch: Partial<ApiDocsContent>) {
      setDoc((current) => ({ ...current, ...patch }));
      scheduleAutoSave();
    }

    function patchServer(index: number, patch: Partial<ApiDocsServer>) {
      setDoc((current) => ({
        ...current,
        servers: current.servers.map((server, i) => (i === index ? { ...server, ...patch } : server)),
      }));
      scheduleAutoSave();
    }

    function addServer() {
      setDoc((current) => ({
        ...current,
        servers: [...current.servers, { url: "", label: "STAGE" }],
      }));
      scheduleAutoSave();
    }

    function removeServer(index: number) {
      setDoc((current) => ({
        ...current,
        servers: current.servers.filter((_, i) => i !== index),
      }));
      scheduleAutoSave();
    }

    function patchEndpoint(index: number, patch: Partial<ApiDocsEndpoint>) {
      setDoc((current) => ({
        ...current,
        endpoints: current.endpoints.map((endpoint, i) => (i === index ? { ...endpoint, ...patch } : endpoint)),
      }));
      scheduleAutoSave();
    }

    function addEndpoint() {
      setDoc((current) => ({
        ...current,
        endpoints: [
          ...current.endpoints,
          {
            tag: "default",
            method: "GET",
            path: "/api/resource/",
            operationId: "resource_retrieve",
            auth: true,
            summary: "",
            parameters: [],
            requestBody: "",
            responseExample: "",
          },
        ],
      }));
      scheduleAutoSave();
    }

    function removeEndpoint(index: number) {
      setDoc((current) => ({
        ...current,
        endpoints: current.endpoints.filter((_, i) => i !== index),
      }));
      scheduleAutoSave();
    }

    function addParam(endpointIndex: number) {
      setDoc((current) => ({
        ...current,
        endpoints: current.endpoints.map((endpoint, i) =>
          i === endpointIndex
            ? { ...endpoint, parameters: [...endpoint.parameters, { name: "", in: "query", required: false, description: "" }] }
            : endpoint,
        ),
      }));
      scheduleAutoSave();
    }

    function patchParam(endpointIndex: number, paramIndex: number, patch: Partial<ApiDocsParam>) {
      setDoc((current) => ({
        ...current,
        endpoints: current.endpoints.map((endpoint, i) =>
          i === endpointIndex
            ? {
                ...endpoint,
                parameters: endpoint.parameters.map((param, j) => (j === paramIndex ? { ...param, ...patch } : param)),
              }
            : endpoint,
        ),
      }));
      scheduleAutoSave();
    }

    function removeParam(endpointIndex: number, paramIndex: number) {
      setDoc((current) => ({
        ...current,
        endpoints: current.endpoints.map((endpoint, i) =>
          i === endpointIndex
            ? { ...endpoint, parameters: endpoint.parameters.filter((_, j) => j !== paramIndex) }
            : endpoint,
        ),
      }));
      scheduleAutoSave();
    }

    const inputCls =
      "w-full rounded-[7px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]";
    const labelCls = "text-[11px] font-medium text-[var(--text-4)]";

    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelCls}>Title</span>
            <input
              value={doc.title}
              onChange={(event) => patchDoc({ title: event.target.value })}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelCls}>Schema path</span>
            <input
              value={doc.schemaPath}
              onChange={(event) => patchDoc({ schemaPath: event.target.value })}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelCls}>Environment</span>
            <input
              value={doc.environment}
              onChange={(event) => patchDoc({ environment: event.target.value })}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelCls}>Spec version</span>
            <input
              value={doc.specVersion}
              onChange={(event) => patchDoc({ specVersion: event.target.value })}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className={labelCls}>Description</span>
            <textarea
              value={doc.description}
              onChange={(event) => patchDoc({ description: event.target.value })}
              className={`${inputCls} min-h-[78px]`}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelCls}>Website label</span>
            <input
              value={doc.websiteLabel}
              onChange={(event) => patchDoc({ websiteLabel: event.target.value })}
              className={inputCls}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelCls}>Website URL</span>
            <input
              value={doc.websiteUrl}
              onChange={(event) => patchDoc({ websiteUrl: event.target.value })}
              className={inputCls}
            />
          </label>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--border-1)] pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Servers</h3>
            <button
              type="button"
              onClick={addServer}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add server
            </button>
          </div>
          <div className="space-y-2">
            {doc.servers.map((server, index) => (
              <div key={`${index}-${server.url}`} className="grid gap-2 rounded-[8px] border border-[var(--border-2)] bg-white p-3 md:grid-cols-[minmax(0,1.6fr)_minmax(140px,0.5fr)_auto]">
                <label className="space-y-1.5">
                  <span className={labelCls}>URL</span>
                  <input
                    value={server.url}
                    onChange={(event) => patchServer(index, { url: event.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={labelCls}>Label</span>
                  <input
                    value={server.label}
                    onChange={(event) => patchServer(index, { label: event.target.value })}
                    className={inputCls}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeServer(index)}
                  className="mt-6 inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
                  title="Remove server"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--border-1)] pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">Endpoints</h3>
            <button
              type="button"
              onClick={addEndpoint}
              className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add endpoint
            </button>
          </div>
          <div className="space-y-3">
            {doc.endpoints.map((endpoint, index) => (
              <div key={`${index}-${endpoint.method}-${endpoint.path}`} className="rounded-[8px] border border-[var(--border-2)] bg-white p-3">
                <div className="grid gap-2 md:grid-cols-[110px_minmax(120px,0.7fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                  <label className="space-y-1.5">
                    <span className={labelCls}>Method</span>
                    <select
                      value={endpoint.method}
                      onChange={(event) => patchEndpoint(index, { method: methodValue(event.target.value) })}
                      className="app-select w-full text-sm"
                    >
                      {(["GET", "POST", "PATCH", "PUT", "DELETE"] as ApiMethod[]).map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Tag</span>
                    <input
                      value={endpoint.tag}
                      onChange={(event) => patchEndpoint(index, { tag: event.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Path</span>
                    <input
                      value={endpoint.path}
                      onChange={(event) => patchEndpoint(index, { path: event.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Operation ID</span>
                    <input
                      value={endpoint.operationId}
                      onChange={(event) => patchEndpoint(index, { operationId: event.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeEndpoint(index)}
                    className="mt-6 inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
                    title="Remove endpoint"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
                  <label className="space-y-1.5">
                    <span className={labelCls}>Summary</span>
                    <textarea
                      value={endpoint.summary}
                      onChange={(event) => patchEndpoint(index, { summary: event.target.value })}
                      className={`${inputCls} min-h-[66px]`}
                    />
                  </label>
                  <label className="mt-6 flex h-9 items-center gap-2 rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text-2)]">
                    <input
                      type="checkbox"
                      checked={endpoint.auth}
                      onChange={(event) => patchEndpoint(index, { auth: event.target.checked })}
                      className="accent-[var(--brand-700)]"
                    />
                    Requires auth
                  </label>
                </div>

                <div className="mt-3 space-y-2 border-t border-[var(--border-1)] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={labelCls}>Parameters (path / query / header)</span>
                    <button
                      type="button"
                      onClick={() => addParam(index)}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    >
                      <PlusIcon className="h-3 w-3" />
                      Add parameter
                    </button>
                  </div>
                  {endpoint.parameters.map((param, paramIndex) => (
                    <div
                      key={paramIndex}
                      className="grid gap-2 rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2 md:grid-cols-[minmax(0,0.9fr)_100px_minmax(0,1.6fr)_auto_auto]"
                    >
                      <input
                        value={param.name}
                        onChange={(event) => patchParam(index, paramIndex, { name: event.target.value })}
                        placeholder="Name"
                        className={`${inputCls} font-mono`}
                      />
                      <select
                        value={param.in}
                        onChange={(event) => patchParam(index, paramIndex, { in: paramLocationValue(event.target.value) })}
                        className="app-select w-full text-sm"
                      >
                        <option value="path">path</option>
                        <option value="query">query</option>
                        <option value="header">header</option>
                      </select>
                      <input
                        value={param.description}
                        onChange={(event) => patchParam(index, paramIndex, { description: event.target.value })}
                        placeholder="Description"
                        className={inputCls}
                      />
                      <label className="flex items-center gap-1.5 whitespace-nowrap px-1 text-xs text-[var(--text-2)]">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(event) => patchParam(index, paramIndex, { required: event.target.checked })}
                          className="accent-[var(--brand-700)]"
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => removeParam(index, paramIndex)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
                        title="Remove parameter"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 border-t border-[var(--border-1)] pt-3 md:grid-cols-2">
                  {methodHasBody(endpoint.method) ? (
                    <label className="space-y-1.5">
                      <span className={labelCls}>Request body (example JSON)</span>
                      <textarea
                        value={endpoint.requestBody}
                        onChange={(event) => patchEndpoint(index, { requestBody: event.target.value })}
                        placeholder={'{\n  "field": "value"\n}'}
                        className={`${inputCls} min-h-[110px] font-mono`}
                      />
                    </label>
                  ) : null}
                  <label className="space-y-1.5">
                    <span className={labelCls}>Response example (JSON)</span>
                    <textarea
                      value={endpoint.responseExample}
                      onChange={(event) => patchEndpoint(index, { responseExample: event.target.value })}
                      placeholder={'{\n  "field": "value"\n}'}
                      className={`${inputCls} min-h-[110px] font-mono`}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  },
);

export function ApiDocsReference({ content }: { content: ApiDocsContent }) {
  const [filter, setFilter] = useState("");
  const [selectedServer, setSelectedServer] = useState(content.servers[0]?.url ?? "");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [authOpen, setAuthOpen] = useState(false);
  const [authScheme, setAuthScheme] = useState<"bearer" | "apiKey">("bearer");
  const [authValue, setAuthValue] = useState("");
  const [authorizedLabel, setAuthorizedLabel] = useState<string | null>(null);
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

  function saveAuthorization() {
    if (!authValue.trim()) return;
    setAuthorizedLabel(authScheme === "bearer" ? "Bearer token" : "API key");
    setAuthOpen(false);
  }

  function clearAuthorization() {
    setAuthValue("");
    setAuthorizedLabel(null);
    setAuthOpen(false);
  }

  return (
    <>
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
            className="app-select w-full text-sm font-semibold"
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
          onClick={() => setAuthOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-[6px] border bg-white px-4 py-2 text-sm font-semibold transition",
            authorizedLabel
              ? "border-emerald-500 text-emerald-700"
              : "border-emerald-400 text-emerald-600 hover:bg-emerald-50",
          )}
        >
          {authorizedLabel ? "Authorized" : "Authorize"}
          {authorizedLabel ? <CheckIcon className="h-4 w-4" /> : <LockClosedIcon className="h-4 w-4" />}
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

                        {endpoint.parameters.length ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Parameters</p>
                            <div className="mt-2 overflow-hidden rounded-[6px] border border-[var(--border-2)]">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-[var(--surface-1)] text-[var(--text-4)]">
                                  <tr>
                                    <th className="px-2.5 py-1.5 font-semibold">Name</th>
                                    <th className="px-2.5 py-1.5 font-semibold">In</th>
                                    <th className="px-2.5 py-1.5 font-semibold">Required</th>
                                    <th className="px-2.5 py-1.5 font-semibold">Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {endpoint.parameters.map((param, paramIndex) => (
                                    <tr key={paramIndex} className="border-t border-[var(--border-1)]">
                                      <td className="px-2.5 py-1.5 font-mono text-[var(--text-1)]">{param.name}</td>
                                      <td className="px-2.5 py-1.5 text-[var(--text-2)]">{param.in}</td>
                                      <td className="px-2.5 py-1.5 text-[var(--text-2)]">{param.required ? "Yes" : "No"}</td>
                                      <td className="px-2.5 py-1.5 text-[var(--text-2)]">{param.description || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        {methodHasBody(endpoint.method) && endpoint.requestBody ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Request body</p>
                            <pre className="mt-2 max-h-[280px] overflow-auto rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text-1)]">
                              {endpoint.requestBody}
                            </pre>
                          </div>
                        ) : null}

                        {endpoint.responseExample ? (
                          <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Response example</p>
                            <pre className="mt-2 max-h-[280px] overflow-auto rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text-1)]">
                              {endpoint.responseExample}
                            </pre>
                          </div>
                        ) : null}
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
    {authOpen ? (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/25"
          aria-label="Close authorization"
          onClick={() => setAuthOpen(false)}
        />
        <div className="relative z-10 w-full max-w-[420px] rounded-[10px] border border-[var(--border-2)] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-1)] px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-700)]" style={{ fontFamily: "var(--font-mono)" }}>
                API auth
              </p>
              <h3 className="mt-1 text-base font-semibold text-[var(--text-1)]">Authorize requests</h3>
            </div>
            <button
              type="button"
              onClick={() => setAuthOpen(false)}
              className="rounded-[5px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
              title="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 px-5 py-4">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--text-4)]">Type</span>
              <select
                value={authScheme}
                onChange={(event) => setAuthScheme(event.target.value === "apiKey" ? "apiKey" : "bearer")}
                className="app-select w-full text-sm"
              >
                <option value="bearer">Bearer token</option>
                <option value="apiKey">API key</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-[var(--text-4)]">Value</span>
              <input
                type="password"
                value={authValue}
                onChange={(event) => setAuthValue(event.target.value)}
                className="w-full rounded-[7px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)]"
              />
            </label>
            {authorizedLabel ? (
              <p className="text-xs text-emerald-700">Current session is authorized with {authorizedLabel}.</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-1)] px-5 py-4">
            <button
              type="button"
              onClick={clearAuthorization}
              className="text-xs font-medium text-[var(--text-4)] transition hover:text-rose-600"
            >
              Clear
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAuthorization}
                disabled={!authValue.trim()}
                className="rounded-[6px] bg-[var(--text-1)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Authorize
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
