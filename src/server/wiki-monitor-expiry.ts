/**
 * Certificate and domain expiry for uptime monitors — the commonest outage nobody sees coming.
 *
 * Run from the every-minute `jobs` worker, a few monitors at a time: each HTTPS monitor's
 * certificate is read twice a day, each domain's registration (RDAP) once a day. A warning
 * goes to #client-alerts once per tier (src/lib/monitor-expiry.ts) and clears on renewal.
 * A domain shared by several monitors is looked up and announced once.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { readCertificate } from "@/server/pulse-checks/tls-certificate";
import { platformSuffixOf, registrableDomain } from "@/server/pulse-lite/registrable-domain";
import { alertBlocks } from "@/lib/monitor-alerts";
import { AGENCY_CLIENT_SLUG } from "@/lib/agency-client";
import {
  expiryPhrase,
  expiryTier,
  mostSevereTier,
  rdapExpiry,
  shouldAnnounceTier,
  type ExpiryTier,
} from "@/lib/monitor-expiry";

const SSL_EVERY_MS = 12 * 60 * 60 * 1000;
const DOMAIN_EVERY_MS = 24 * 60 * 60 * 1000;
/** Per run: keeps a jobs tick short. ~12 clients' monitors are all covered within the hour. */
const PER_RUN = 6;

/** The monitor's hostname, or null (TCP "host:port", heartbeats, junk). */
export function monitorHost(type: string, target: string): string | null {
  if (type === "HEARTBEAT") return null;
  if (type === "TCP") return target.split(":")[0]?.trim().toLowerCase() || null;
  try {
    return new URL(target).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The domain whose registration matters, or null. A host on a shared platform suffix
 * (`*.vercel.app`, `*.run.app`) has no registration of its own to renew.
 */
export function monitorDomain(type: string, target: string): string | null {
  const host = monitorHost(type, target);
  if (!host || platformSuffixOf(host)) return null;
  return registrableDomain(host);
}

async function rdapLookup(domain: string): Promise<{ expiresAt: Date | null; error: string | null }> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { expiresAt: null, error: "The registry publishes no RDAP record for this domain" };
    if (!res.ok) return { expiresAt: null, error: `RDAP answered HTTP ${res.status}` };
    const expiresAt = rdapExpiry(await res.json());
    return expiresAt ? { expiresAt, error: null } : { expiresAt: null, error: "The registry does not publish an expiry date" };
  } catch (err) {
    return { expiresAt: null, error: err instanceof Error ? err.message : "RDAP lookup failed" };
  }
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://foundry.gitwork.co.uk").replace(/\/+$/, "");
}

function announce(input: {
  workspaceId: string;
  clientName: string;
  clientSlug: string;
  what: string;
  subject: string;
  tier: ExpiryTier;
  expiresAt: Date;
  now: Date;
  groupKey: string;
}) {
  const expired = input.tier === "expired";
  const phrase = expiryPhrase(input.expiresAt, input.now);
  const title = `${expired ? "🔴" : "🟠"} ${input.clientName} — ${input.what} ${phrase}`;
  const body = `${input.subject}: the ${input.what} ${phrase} (${input.expiresAt.toISOString().slice(0, 10)}).${
    expired ? " Visitors are affected until it is renewed." : " Renew it before it lapses."
  }`;
  const actionUrl = `/app/portal/${input.clientSlug}/wiki#monitors`;
  try {
    dispatchNotification({
      event: "clients.monitor_alert",
      workspaceId: input.workspaceId,
      title,
      body,
      actionUrl,
      target: { kind: "admins" },
      groupKey: input.groupKey,
      count: 1,
      slackBlocks: alertBlocks({
        heading: expired ? `Incident: ${input.what} expired` : `Renewal due: ${input.what}`,
        title: title.replace(/^\S+\s+/, ""),
        url: `${appBaseUrl()}${actionUrl}`,
        description: body,
        services: [],
        footer: "Foundry uptime monitoring · expiry checks",
        button: { label: "View all monitors", url: `${appBaseUrl()}/app/portal/${AGENCY_CLIENT_SLUG}/wiki#monitors` },
      }),
    });
  } catch (err) {
    console.error("[monitor-expiry] could not send", err);
  }
}

const OWNER = {
  wiki: { select: { client: { select: { name: true, slug: true, workspaceId: true } } } },
} as const satisfies Prisma.WikiMonitorSelect;

/** Certificates: HTTPS monitors not read in 12 h. */
async function checkCertificates(now: Date): Promise<number> {
  const due = await prisma.wikiMonitor.findMany({
    where: {
      enabled: true,
      type: "HTTP",
      target: { startsWith: "https://" },
      OR: [{ sslCheckedAt: null }, { sslCheckedAt: { lt: new Date(now.getTime() - SSL_EVERY_MS) } }],
    },
    orderBy: { sslCheckedAt: { sort: "asc", nulls: "first" } },
    take: PER_RUN,
    select: { id: true, name: true, target: true, type: true, sslAlertedTier: true, ...OWNER },
  });
  await Promise.all(
    due.map(async (m) => {
      const host = monitorHost(m.type, m.target);
      const reading = host ? await readCertificate(host) : { ok: false as const, reason: "no hostname" };
      const expiresAt = reading.ok ? reading.validTo : null;
      const tier = expiryTier("ssl", expiresAt, now);
      const announceIt = expiresAt !== null && shouldAnnounceTier("ssl", m.sslAlertedTier, tier);
      await prisma.wikiMonitor.update({
        where: { id: m.id },
        data: {
          sslCheckedAt: now,
          sslExpiresAt: expiresAt,
          sslIssuer: reading.ok ? reading.issuer : null,
          sslError: reading.ok ? reading.authorizationError : reading.reason,
          // A failed read keeps the last tier — "could not look" is not "renewed".
          ...(reading.ok ? { sslAlertedTier: announceIt ? tier : tier === null ? null : m.sslAlertedTier } : {}),
        },
      });
      if (announceIt && tier && expiresAt) {
        const c = m.wiki.client;
        announce({
          workspaceId: c.workspaceId,
          clientName: c.name,
          clientSlug: c.slug,
          what: "SSL certificate",
          subject: `${m.name} (${host})`,
          tier,
          expiresAt,
          now,
          groupKey: `clients.monitor_alert:ssl:${m.id}:${tier}`,
        });
      }
    }),
  );
  return due.length;
}

/** Domains: one RDAP lookup per registrable domain not checked in 24 h. */
async function checkDomains(now: Date): Promise<number> {
  const monitors = await prisma.wikiMonitor.findMany({
    where: { enabled: true, type: { in: ["HTTP", "TCP"] } },
    select: { id: true, type: true, target: true, domain: true, domainCheckedAt: true, domainAlertedTier: true, ...OWNER },
  });
  // Group by (workspace, domain): monitors on one domain share a lookup and an alert.
  const groups = new Map<string, typeof monitors>();
  for (const m of monitors) {
    const domain = monitorDomain(m.type, m.target);
    if (!domain) continue;
    const key = `${m.wiki.client.workspaceId}|${domain}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const due = [...groups.entries()]
    .filter(([, list]) =>
      list.some((m) => !m.domainCheckedAt || now.getTime() - m.domainCheckedAt.getTime() >= DOMAIN_EVERY_MS || !m.domain),
    )
    .slice(0, PER_RUN);

  await Promise.all(
    due.map(async ([key, list]) => {
      const domain = key.split("|")[1];
      const { expiresAt, error } = await rdapLookup(domain);
      const tier = expiryTier("domain", expiresAt, now);
      const previous = mostSevereTier("domain", list.map((m) => m.domainAlertedTier));
      const announceIt = expiresAt !== null && shouldAnnounceTier("domain", previous, tier);
      await prisma.wikiMonitor.updateMany({
        where: { id: { in: list.map((m) => m.id) } },
        data: {
          domain,
          domainCheckedAt: now,
          domainExpiresAt: expiresAt,
          domainError: error,
          ...(expiresAt ? { domainAlertedTier: announceIt ? tier : tier === null ? null : previous } : {}),
        },
      });
      if (announceIt && tier && expiresAt) {
        const c = list[0].wiki.client;
        announce({
          workspaceId: c.workspaceId,
          clientName: c.name,
          clientSlug: c.slug,
          what: "domain registration",
          subject: domain,
          tier,
          expiresAt,
          now,
          groupKey: `clients.monitor_alert:domain:${domain}:${tier}`,
        });
      }
    }),
  );
  return due.length;
}

/** Jobs-worker entry point. Each half fails on its own. */
export async function checkMonitorExpiries(now: Date = new Date()): Promise<{ certificates: number; domains: number }> {
  const [certificates, domains] = await Promise.all([
    checkCertificates(now).catch((err) => {
      console.error("[monitor-expiry] certificates failed", err);
      return 0;
    }),
    checkDomains(now).catch((err) => {
      console.error("[monitor-expiry] domains failed", err);
      return 0;
    }),
  ]);
  return { certificates, domains };
}
