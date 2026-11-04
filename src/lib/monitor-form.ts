/**
 * The monitor form's state and the rules that turn it into a request. Pure, so the wiki's
 * Monitors section and the Monitors page's Add monitor popup build exactly the same payload
 * from exactly the same fields, and neither can drift from the other.
 *
 * The form keeps every field as text (what the inputs hold); `formToMonitorInput` decides
 * which ones apply to the chosen type and turns them into numbers.
 */

import type { MonitorWireInput } from "@/server/wiki-monitors";
import { DEFAULT_MONITOR_ENVIRONMENT, isMonitorEnvironment, type MonitorEnvironment } from "@/lib/monitor-environment";

export const MONITOR_TYPE_OPTIONS = [
  { value: "HTTP", label: "HTTP / HTTPS", hint: "https://api.example.com/health" },
  { value: "TCP", label: "TCP port", hint: "db.example.com:5432" },
  { value: "HEARTBEAT", label: "Heartbeat (cron / job)", hint: "" },
] as const;

export type MonitorFormType = (typeof MONITOR_TYPE_OPTIONS)[number]["value"];

export const MONITOR_METHODS = ["GET", "HEAD", "POST"] as const;

export type MonitorFormState = {
  name: string;
  type: MonitorFormType;
  /** Only production is shown to the client. */
  environment: MonitorEnvironment;
  target: string;
  method: string;
  expectedStatus: string;
  keyword: string;
  degradedMs: string;
  intervalMinutes: string;
  graceMinutes: string;
  /** New headers, "Name: value" per line. Blank keeps what's saved. */
  headersText: string;
  /** Saved header names (values never come back from the server). */
  savedHeaders: string[];
  clearHeaders: boolean;
  body: string;
};

export const EMPTY_MONITOR_FORM: MonitorFormState = {
  name: "",
  type: "HTTP",
  environment: DEFAULT_MONITOR_ENVIRONMENT,
  target: "",
  method: "GET",
  expectedStatus: "",
  keyword: "",
  degradedMs: "",
  intervalMinutes: "5",
  graceMinutes: "",
  headersText: "",
  savedHeaders: [],
  clearHeaders: false,
  body: "",
};

/** The fields `monitorToForm` reads off a saved monitor. */
export interface MonitorFormSource {
  name: string;
  type: MonitorFormType;
  environment: string;
  target: string;
  method: string;
  expectedStatus: number | null;
  keyword: string | null;
  degradedMs: number | null;
  intervalMinutes: number;
  headerNames: string[];
  heartbeat?: { graceMinutes: number | null } | null;
}

export function monitorToForm(m: MonitorFormSource): MonitorFormState {
  return {
    name: m.name,
    type: m.type,
    // Unrecognised → production in the form only; saving then makes it explicit.
    environment: isMonitorEnvironment(m.environment) ? m.environment : DEFAULT_MONITOR_ENVIRONMENT,
    target: m.target,
    method: m.method,
    expectedStatus: m.expectedStatus?.toString() ?? "",
    keyword: m.keyword ?? "",
    degradedMs: m.degradedMs?.toString() ?? "",
    intervalMinutes: m.intervalMinutes.toString(),
    graceMinutes: m.heartbeat?.graceMinutes?.toString() ?? "",
    headersText: "",
    savedHeaders: m.headerNames,
    clearHeaders: false,
    body: "",
  };
}

/** A whole number from a text field, or null when blank. NaN for anything else. */
function wholeNumber(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

export type MonitorFormResult = { ok: true; input: MonitorWireInput } | { ok: false; error: string };

/**
 * The request for a form, or a sentence saying what to fix. Mirrors the server's limits
 * (`monitorInputSchema`) so a mistake is caught here rather than coming back as a 400.
 */
export function formToMonitorInput(form: MonitorFormState): MonitorFormResult {
  const heartbeat = form.type === "HEARTBEAT";
  const http = form.type === "HTTP";
  if (!form.name.trim()) return { ok: false, error: "Give the monitor a name." };
  if (!heartbeat && !form.target.trim()) {
    return { ok: false, error: form.type === "TCP" ? "Add a host and port, e.g. db.example.com:5432." : "Add the address to check." };
  }

  const interval = wholeNumber(form.intervalMinutes);
  if (interval !== null && (Number.isNaN(interval) || interval < 1 || interval > 1440)) {
    return { ok: false, error: "The interval must be between 1 and 1440 minutes." };
  }
  const expectedStatus = http ? wholeNumber(form.expectedStatus) : null;
  if (expectedStatus !== null && (Number.isNaN(expectedStatus) || expectedStatus < 100 || expectedStatus > 599)) {
    return { ok: false, error: "The expected status must be an HTTP status, 100 to 599." };
  }
  const degradedMs = heartbeat ? null : wholeNumber(form.degradedMs);
  if (degradedMs !== null && (Number.isNaN(degradedMs) || degradedMs < 1 || degradedMs > 120000)) {
    return { ok: false, error: "Slow after must be between 1 and 120000 ms." };
  }
  const grace = heartbeat ? wholeNumber(form.graceMinutes) : null;
  if (grace !== null && (Number.isNaN(grace) || grace < 1 || grace > 1440)) {
    return { ok: false, error: "Grace must be between 1 and 1440 minutes." };
  }

  const input: MonitorWireInput = {
    name: form.name.trim(),
    type: form.type,
    environment: form.environment,
    target: heartbeat ? "" : form.target.trim(),
    graceMinutes: grace,
    // Headers: new text replaces; "remove" clears; otherwise leave what's saved alone.
    ...(http && form.headersText.trim()
      ? { requestHeaders: form.headersText }
      : form.clearHeaders
        ? { requestHeaders: null }
        : {}),
    ...(http && form.method === "POST" && form.body.trim() ? { requestBody: form.body } : {}),
    method: http ? form.method || "GET" : "GET",
    expectedStatus,
    keyword: http && form.keyword.trim() ? form.keyword.trim() : null,
    degradedMs,
    intervalMinutes: interval ?? 5,
  };
  return { ok: true, input };
}
