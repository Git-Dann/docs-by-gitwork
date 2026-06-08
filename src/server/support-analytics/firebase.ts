import {
  type AnalyticsAdapter,
  type AnalyticsFetchContext,
  type AnalyticsMetric,
  type AnalyticsSnapshot,
  type FirebaseMetricSpec,
  monthLabel,
} from "./types";
import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore, type Query } from "firebase-admin/firestore";

// ─── Firebase / Firestore — count docs per month ────────────────────────────────
//
// The recommended source for app-based clients (most run on Firebase). No bespoke
// API needed — point it at a service-account JSON and list the collections to count.
// Each spec counts documents whose `timestampField` falls inside the target month,
// e.g. { label: "Subscribers", collection: "users", timestampField: "createdAt" }.
// The runner fetches the previous month too, so trends ("+142 vs last month") work
// with no extra config.

/**
 * Firebase forbids two apps with the same name, and credentials differ per client,
 * so we name the app by the service account's project_id and reuse it across calls.
 */
function appFor(serviceAccountJson: string): App {
  const creds = JSON.parse(serviceAccountJson) as {
    project_id?: string;
    projectId?: string;
    client_email?: string;
    private_key?: string;
  };
  const projectId = creds.project_id ?? creds.projectId;
  if (!projectId) throw new Error("Service-account JSON is missing project_id");
  const name = `care-analytics:${projectId}`;
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  return initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail: creds.client_email,
        privateKey: creds.private_key?.replace(/\\n/g, "\n"),
      }),
    },
    name,
  );
}

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

async function countSpec(
  db: Firestore,
  spec: FirebaseMetricSpec,
  year: number,
  month: number,
): Promise<number> {
  const { start, end } = monthBounds(year, month);
  let q: Query = spec.collectionGroup
    ? db.collectionGroup(spec.collection)
    : db.collection(spec.collection);

  for (const w of spec.where ?? []) {
    q = q.where(w.field, "==", w.value);
  }
  q = q
    .where(spec.timestampField, ">=", Timestamp.fromDate(start))
    .where(spec.timestampField, "<", Timestamp.fromDate(end));

  // count() aggregation — cheap, doesn't read every document.
  const snap = await q.count().get();
  return snap.data().count;
}

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  if (!ctx.serviceAccountJson) throw new Error("Firebase analytics needs a service-account JSON");
  const specs = ctx.firebaseMetrics ?? [];
  if (specs.length === 0) throw new Error("No Firebase metrics configured — add at least one collection to count");

  const db = getFirestore(appFor(ctx.serviceAccountJson));
  const metrics: AnalyticsMetric[] = [];

  for (const spec of specs) {
    try {
      const value = await countSpec(db, spec, ctx.year, ctx.month);
      metrics.push({
        key: `fb:${spec.collection}:${spec.label}`,
        label: spec.label,
        value,
        unit: spec.unit,
        group: spec.group ?? "Firebase",
      });
    } catch (err) {
      // One bad spec (missing index, wrong field) shouldn't sink the whole snapshot.
      metrics.push({
        key: `fb:${spec.collection}:${spec.label}`,
        label: spec.label,
        value: 0,
        group: spec.group ?? "Firebase",
      });
      console.warn(`[firebase-analytics] ${spec.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { periodLabel: monthLabel(ctx.year, ctx.month), metrics };
}

export const firebaseAdapter: AnalyticsAdapter = {
  key: "firebase",
  label: "Firebase / Firestore",
  defaultBaseUrl: "",
  requiresToken: false,
  hint: "Paste a service-account JSON, then list collections to count per month (e.g. users → Subscribers).",
  fetchMonth,
};
