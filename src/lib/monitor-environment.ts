/**
 * Which environment a monitor watches: production, staging, development or testing.
 *
 * Asked for by Shahab (Nov 2026): a client's status board must show their live service, never
 * a staging box that's down because someone is redeploying it. So the client only ever sees
 * PRODUCTION monitors, and their incidents. Gitwork's own views (the client's wiki for the
 * team, the Monitors page, the all-clients board) show every environment, labelled.
 *
 * Pure, so the server's client copy, the team's "what the client sees" preview, the alerts and
 * the boards all apply exactly the same rule.
 */

export const MONITOR_ENVIRONMENTS = [
  { value: "production", label: "Production", short: "Prod" },
  { value: "staging", label: "Staging", short: "Staging" },
  { value: "development", label: "Development", short: "Dev" },
  { value: "testing", label: "Testing", short: "Test" },
] as const;

export type MonitorEnvironment = (typeof MONITOR_ENVIRONMENTS)[number]["value"];

export const MONITOR_ENVIRONMENT_VALUES = MONITOR_ENVIRONMENTS.map((e) => e.value) as [
  MonitorEnvironment,
  ...MonitorEnvironment[],
];

/** Every monitor added before environments existed watches production; so does a new one by default. */
export const DEFAULT_MONITOR_ENVIRONMENT: MonitorEnvironment = "production";

export function isMonitorEnvironment(value: unknown): value is MonitorEnvironment {
  return typeof value === "string" && MONITOR_ENVIRONMENTS.some((e) => e.value === value);
}

export function environmentLabel(value: string | null | undefined): string {
  return MONITOR_ENVIRONMENTS.find((e) => e.value === value)?.label ?? "Unknown environment";
}

export function environmentShort(value: string | null | undefined): string {
  return MONITOR_ENVIRONMENTS.find((e) => e.value === value)?.short ?? "Unknown";
}

/**
 * The client sees production and nothing else. ⚠️ Exactly "production": a value this code
 * doesn't recognise stays internal, because showing a client a box we can't place is the
 * mistake this exists to stop; hiding one from them costs nothing.
 */
export function isClientVisibleEnvironment(value: string | null | undefined): boolean {
  return value === "production";
}

/** The monitors a client may see. */
export function clientVisibleMonitors<T extends { environment: string }>(monitors: T[]): T[] {
  return monitors.filter((m) => isClientVisibleEnvironment(m.environment));
}

/** The incidents a client may see: only those on a monitor they can see. */
export function clientVisibleIncidents<I extends { monitorId: string }>(
  incidents: I[],
  monitors: { id: string; environment: string }[],
): I[] {
  const visible = new Set(clientVisibleMonitors(monitors).map((m) => m.id));
  return incidents.filter((i) => visible.has(i.monitorId));
}

/** "API" for production, "API (Staging)" otherwise: how a monitor is named in an alert. */
export function nameWithEnvironment(name: string, environment: string | null | undefined): string {
  return isClientVisibleEnvironment(environment) ? name : `${name} (${environmentLabel(environment)})`;
}
