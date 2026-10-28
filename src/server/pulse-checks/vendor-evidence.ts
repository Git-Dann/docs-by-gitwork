/**
 * VENDOR EVIDENCE — what a page DOES with a vendor, not whether it names one.
 *
 * The website checks this replaces passed when a vendor's name appeared anywhere in the
 * page's HTML: "pingdom" in a blog post, "newrelic" in a comparison table, "affirm" (an
 * English word) in a sentence, "trustpilot" in a JS bundle. A name is a mention. The
 * evidence here is one of:
 *
 *   - a script the page LOADS from the vendor's host (`<script src>`), or the vendor's
 *     init call in an inline script (an identifier such as `NREUM` or `DD_RUM.init(`,
 *     never the brand word, because Next.js streams page prose inside inline scripts);
 *   - a LINK the page carries to the vendor-hosted profile or page (`<a href>`), read
 *     with the shared `pageAnchors` helper, so a URL inside a script string is not a link;
 *   - a statement in VISIBLE PROSE (`proseRuns`), quoted back, for checks that are about
 *     what the site says;
 *   - for a status page, the page itself, fetched through the SSRF guard and confirmed.
 *
 * Anything else is not a PASS. A bare mention is reported as INCONCLUSIVE when it is
 * worth saying, never as a finding in either direction.
 */
import type { PulseScanCheckInput } from "@/types/pulse";
import { registrableDomain } from "@/server/pulse-lite/registrable-domain";
import { findClaim, pageAnchors, proseRuns } from "./page-claims";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { fetchSnippet, pageTitle, type PathProbe } from "./path-probe";

type Verdict = Pick<PulseScanCheckInput, "status" | "detail"> & { evidence?: string; confidence?: PulseScanCheckInput["confidence"]; confidenceReason?: string };

// ── What the page loads ──────────────────────────────────────────────────────

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, " ");

/** Every `<script src>` URL, quoted or not. A `data-src` is not a `src`. */
export function scriptSrcs(html: string): string[] {
  return (stripComments(html).match(/<script\b[^>]*>/gi) ?? [])
    .map((tag) => /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag))
    .map((m) => (m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : ""))
    .filter(Boolean);
}

/** `src` of iframes and images: badges and embedded widgets. */
export function embedSrcs(html: string): string[] {
  return (stripComments(html).match(/<(?:iframe|img)\b[^>]*>/gi) ?? [])
    .map((tag) => /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag))
    .map((m) => (m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : ""))
    .filter(Boolean);
}

/** The code of inline scripts. JSON and JSON-LD blocks are data, not code, and are left out. */
export function inlineScriptCode(html: string): string {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  const src = stripComments(html);
  while ((m = re.exec(src)) !== null) {
    if (/\ssrc\s*=/i.test(m[1])) continue;
    if (/\btype\s*=\s*["']?application\/(?:ld\+)?json/i.test(m[1])) continue;
    out.push(m[2]);
  }
  return out.join("\n");
}

type Agent = { tool: string; src?: RegExp; inline?: RegExp };

function loadedAgent(html: string, agents: readonly Agent[]): { tool: string; how: string } | null {
  const srcs = scriptSrcs(html);
  let code: string | null = null;
  for (const a of agents) {
    const s = a.src ? srcs.find((u) => a.src!.test(u)) : undefined;
    if (s) return { tool: a.tool, how: `loads ${shortUrl(s)}` };
    if (a.inline) {
      code ??= inlineScriptCode(html);
      const hit = a.inline.exec(code);
      if (hit) return { tool: a.tool, how: `initialises it in an inline script (${hit[0].slice(0, 40)})` };
    }
  }
  return null;
}

function shortUrl(u: string): string {
  const s = u.replace(/^https?:/i, "").replace(/^\/\//, "").split(/[?#]/)[0];
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

// ── apm_signals ──────────────────────────────────────────────────────────────

/**
 * Browser agents of application-performance products. Each is the product's own
 * distribution host or init call. Server-side agents (New Relic APM, Scout, Datadog APM)
 * leave no trace in a page, which is why absence is reported as unobservable.
 */
const APM_AGENTS: readonly Agent[] = [
  { tool: "New Relic", src: /\/\/js-agent\.newrelic\.com\//i, inline: /\bwindow\.NREUM\b|\bNREUM\s*(?:=|\|\||\.(?:init|info|loader_config)\b)/ },
  { tool: "Dynatrace", src: /\/ruxitagentjs_|\/\/js-cdn\.dynatrace\.com\/|\.dynatrace\.com\/jstag\//i, inline: /\bdtrum\.(?:enable|identifyUser|sendSessionProperties|enterAction)\s*\(/ },
  { tool: "AppDynamics", src: /\/\/cdn\.appdynamics\.com\/adrum|\/adrum(?:-[\d.]+)?\.js(?:$|[?#])/i, inline: /window\[["']adrum-config["']\]|\bADRUM\.(?:report|command)\s*\(/ },
  { tool: "Elastic APM", src: /elastic-apm-rum/i, inline: /\belasticApm\.init\s*\(/ },
  { tool: "Datadog", src: /\/\/www\.datadoghq-browser-agent\.com\/[^"']*rum/i, inline: /\bDD_RUM\.init\s*\(/ },
  { tool: "Sentry (tracing)", inline: /\bbrowserTracingIntegration\s*\(|\bSentry\.init\s*\(\s*\{[\s\S]{0,800}?\btracesSampleRate\s*:/ },
];

export function apmAgent(html: string): { tool: string; how: string } | null {
  return loadedAgent(html, APM_AGENTS);
}

export function apmVerdict(html: string): Verdict {
  const hit = apmAgent(html);
  if (hit) {
    return {
      status: "PASS",
      detail: `The page loads the ${hit.tool} browser agent (it ${hit.how}). That is front-end tracing; whether the server is traced too cannot be seen from outside.`,
      evidence: hit.how,
    };
  }
  return {
    status: "WARN",
    detail: "No application-performance agent is loaded by this page. Server-side APM agents leave no trace in the page, so this does not show there is none.",
  };
}

// ── real_user_monitoring ─────────────────────────────────────────────────────

const RUM_AGENTS: readonly Agent[] = [
  // gov.uk self-hosts SpeedCurve LUX as vendor/lux/lux-measurer-*.js and rum-loader-*.js.
  { tool: "SpeedCurve LUX", src: /\/\/cdn\.speedcurve\.com\/|\/lux(?:-measurer|-reporter)?[-\w.]*\.js(?:$|[?#])|\/rum-loader[-\w.]*\.js(?:$|[?#])/i, inline: /\bwindow\.LUX\s*=|\bLUX\s*=\s*window\.LUX\b|\bLUX\.init\s*\(/ },
  { tool: "web-vitals", src: /\/web-vitals(?:@[\d.]+)?(?:\/[\w./-]*)?\.(?:m?js|iife\.js)(?:$|[?#])/i, inline: /\bfrom\s*["'](?:https?:\/\/[^"']*)?web-vitals[^"']*["']|\bwebVitals\.on(?:LCP|CLS|INP|FCP|TTFB)\s*\(/ },
  { tool: "Perfume.js", src: /\/perfume(?:\.umd)?(?:\.min)?\.js(?:$|[?#])/i, inline: /\bnew\s+Perfume\s*\(/ },
  { tool: "Datadog RUM", src: /\/\/www\.datadoghq-browser-agent\.com\/[^"']*rum/i, inline: /\bDD_RUM\.init\s*\(/ },
  { tool: "New Relic Browser", src: /\/\/js-agent\.newrelic\.com\//i, inline: /\bwindow\.NREUM\b|\bNREUM\s*(?:=|\|\||\.(?:init|info|loader_config)\b)/ },
  { tool: "Akamai mPulse", src: /\/\/[\w.-]*go-mpulse\.net\//i, inline: /\bgo-mpulse\.net\/|\bBOOMR\.init\s*\(/ },
  { tool: "Cloudflare Web Analytics", src: /\/\/static\.cloudflareinsights\.com\/beacon(?:\.min)?\.js/i },
  { tool: "Vercel Speed Insights", src: /\/_vercel\/speed-insights\/script\.js|\/\/va\.vercel-scripts\.com\/v\d\/speed-insights\//i },
  { tool: "Dynatrace RUM", src: /\/ruxitagentjs_|\/\/js-cdn\.dynatrace\.com\//i },
];

export function rumAgent(html: string): { tool: string; how: string } | null {
  return loadedAgent(html, RUM_AGENTS);
}

export function rumVerdict(html: string): Verdict {
  const hit = rumAgent(html);
  if (hit) {
    return {
      status: "PASS",
      detail: `The page collects field performance with ${hit.tool} (it ${hit.how}).`,
      evidence: hit.how,
    };
  }
  return {
    status: "WARN",
    detail: "No Real User Monitoring script is loaded by this page (a RUM agent bundled inside your own JavaScript is not visible to this check). Lab performance data does not reflect real-world Core Web Vitals across user devices.",
  };
}

// ── Links ────────────────────────────────────────────────────────────────────

/** Absolute http(s) links the page carries, as URL objects. */
export function absoluteLinks(html: string): Array<{ url: URL; text: string }> {
  const out: Array<{ url: URL; text: string }> = [];
  for (const a of pageAnchors(html)) {
    if (!/^(?:https?:)?\/\//i.test(a.href)) continue;
    try {
      const url = new URL(a.href, "https://x.invalid/");
      if (url.protocol === "http:" || url.protocol === "https:") out.push({ url, text: a.text });
    } catch { /* not a URL */ }
  }
  return out;
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

// ── Status pages (status_page, uptime_monitoring, uptime_history_public) ──────

/** Hosts whose status pages are published by an uptime MONITOR (the uptime shown is measured). */
const MONITOR_STATUS_HOSTS: ReadonlyArray<[string, string]> = [
  ["betteruptime.com", "Better Stack"], ["betterstack.com", "Better Stack"],
  ["uptimerobot.com", "UptimeRobot"], ["hyperping.app", "Hyperping"], ["hyperping.io", "Hyperping"],
  ["freshstatus.io", "Freshping"], ["pingdom.com", "Pingdom"], ["checkly-dashboards.com", "Checkly"],
  ["statuscake.com", "StatusCake"], ["updown.io", "updown.io"], ["ohdear.app", "Oh Dear"],
  ["instatus.com", "Instatus"],
];
/** Hosts of hosted status-page products that may be updated by hand. */
const STATUS_ONLY_HOSTS: ReadonlyArray<[string, string]> = [
  ["statuspage.io", "Atlassian Statuspage"], ["statuspal.io", "Statuspal"], ["status.io", "Status.io"],
  ["sorryapp.com", "Sorry"], ["cachethq.io", "Cachet"],
];
/** Embedded status widgets and badges, by the vendor's own asset host. */
const STATUS_WIDGETS: ReadonlyArray<[RegExp, string, boolean]> = [
  [/\.statuspage\.io\/embed\/script\.js|\/\/cdn\.statuspage\.io\//i, "Atlassian Statuspage", false],
  [/\.instatus\.com\/widget\/script\.js/i, "Instatus", true],
  [/\/\/uptime\.betterstack\.com\/(?:widgets|status-badges)\/|\/\/betteruptime\.com\/(?:widgets|status-badges)\//i, "Better Stack", true],
  [/\/\/(?:stats\.)?uptimerobot\.com\/[^"']*badge|\/\/img\.shields\.io\/uptimerobot\//i, "UptimeRobot", true],
  [/\/\/statuspal\.io\/[^"']*widget/i, "Statuspal", false],
];

export type StatusLink = { url: string; provider: string | null; monitor: boolean; own: boolean };

/**
 * Links that could be THIS site's status page: a status host on the site's own
 * registrable domain (status.cal.com), a `<brand>status` domain (linearstatus.com,
 * vercel-status.com, githubstatus.com), or a hosted status product. A link to another
 * company's status page (an integrations page linking status.stripe.com) is not one.
 */
export function statusPageLinks(html: string, scannedHost: string): StatusLink[] {
  const host = scannedHost.toLowerCase().replace(/^www\./, "");
  const org = registrableDomain(host) ?? host;
  const brand = org.split(".")[0];
  const out: StatusLink[] = [];
  const seen = new Set<string>();
  for (const { url } of absoluteLinks(html)) {
    const h = url.hostname.toLowerCase();
    if (h === scannedHost.toLowerCase() || h === host) continue;
    const linkedOrg = registrableDomain(h) ?? h;
    let match: StatusLink | null = null;
    const monitor = MONITOR_STATUS_HOSTS.find(([d]) => hostIs(h, d));
    const statusOnly = STATUS_ONLY_HOSTS.find(([d]) => hostIs(h, d));
    if (monitor || statusOnly) {
      // The vendor's own website (www.statuspage.io, betterstack.com/docs) is not a
      // customer's status page: a hosted page sits on a subdomain or under /p/ or /pages/.
      const [domain, provider] = (monitor ?? statusOnly)!;
      const sub = h.slice(0, Math.max(0, h.length - domain.length - 1));
      const hosted = (sub !== "" && sub !== "www") || /^\/(?:p|pages)\/[^/]+/i.test(url.pathname);
      if (hosted) match = { url: url.href, provider, monitor: Boolean(monitor), own: false };
    } else if (linkedOrg === org) {
      const sub = h.slice(0, Math.max(0, h.length - org.length - 1));
      if (sub.split(".").some((label) => /(?:^|-)status(?:$|-)/.test(label))) match = { url: url.href, provider: null, monitor: false, own: true };
    } else if (brand.length >= 2 && new Set([`${brand}status`, `${brand}-status`, `status-${brand}`]).has(linkedOrg.split(".")[0])) {
      match = { url: url.href, provider: null, monitor: false, own: true };
    }
    if (match && !seen.has(h)) {
      seen.add(h);
      out.push(match);
    }
  }
  return out;
}

export function statusWidget(html: string): { provider: string; monitor: boolean; src: string } | null {
  const srcs = [...scriptSrcs(html), ...embedSrcs(html)];
  for (const [re, provider, monitor] of STATUS_WIDGETS) {
    const s = srcs.find((u) => re.test(u));
    if (s) return { provider, monitor, src: shortUrl(s) };
  }
  return null;
}

export type StatusPageCheck = "confirmed" | "not_status" | "unreadable";

/** A fetched page is a status page when its title or opening markup says so. */
export function classifyStatusProbe(probe: PathProbe): StatusPageCheck {
  if (probe.status === 0 || probe.status === 401 || probe.status === 403 || probe.status === 429 || probe.status >= 500) return "unreadable";
  if (probe.status === 404 || probe.status === 410 || probe.status >= 300) return "not_status";
  const title = pageTitle(probe.body);
  if (/\bstatus\b|\buptime\b|\bincidents?\b|\boutages?\b/.test(title)) return "confirmed";
  if (/\ball systems operational\b|\bsystems? (?:are |is )?operational\b|\bcurrent status\b|\bpast incidents\b|\buptime\b[^<]{0,40}%|\bcomponent-status\b|\bstatuspage\b/i.test(probe.body)) return "confirmed";
  return "not_status";
}

/** One scan asks for the same status page from several checks; remember it for ten minutes. */
const STATUS_CACHE_MS = 10 * 60_000;
const statusCache = new Map<string, { at: number; result: Promise<StatusPageCheck> }>();

export function resetStatusPageCache(): void {
  statusCache.clear();
}

/**
 * Fetch a candidate status page (SSRF-guarded) and classify it. The read is 192KB because
 * an incident.io page (linearstatus.com) puts ~100KB of image preloads before its <title>.
 */
export function confirmStatusPage(url: string, fetcher: (u: string) => Promise<PathProbe> = (u) => fetchSnippet(u, 6000, 196_608)): Promise<StatusPageCheck> {
  const now = Date.now();
  const cached = statusCache.get(url);
  if (cached && now - cached.at < STATUS_CACHE_MS) return cached.result;
  const result = fetcher(url).then(classifyStatusProbe, () => "unreadable" as const);
  if (statusCache.size > 500) statusCache.clear();
  statusCache.set(url, { at: now, result });
  return result;
}

export type StatusEvidence = {
  /** The first confirmed status page, or a widget. */
  confirmed: { where: string; provider: string | null; monitor: boolean; how: "link" | "widget" } | null;
  /** A candidate link that could not be opened. */
  unreadable: string | null;
};

/** Find this site's status page from its links and embeds, confirming a link by fetching it (at most 3). */
export async function statusEvidence(
  html: string,
  scannedHost: string,
  fetcher?: (u: string) => Promise<PathProbe>,
): Promise<StatusEvidence> {
  const widget = statusWidget(html);
  if (widget) return { confirmed: { where: widget.src, provider: widget.provider, monitor: widget.monitor, how: "widget" }, unreadable: null };
  const links = statusPageLinks(html, scannedHost).slice(0, 3);
  let unreadable: string | null = null;
  for (const link of links) {
    const state = await confirmStatusPage(link.url, fetcher);
    if (state === "confirmed") return { confirmed: { where: link.url, provider: link.provider, monitor: link.monitor, how: "link" }, unreadable: null };
    if (state === "unreadable") unreadable ??= link.url;
  }
  return { confirmed: null, unreadable };
}

/** A status provider's name in the page with no link or widget behind it. */
export const STATUS_MENTION = /statuspage|status\.io|betteruptime|uptimerobot|pingdom|freshping|checkly|hyperping/i;

export function uptimeMonitoringVerdict(ev: StatusEvidence, html: string): Verdict {
  const c = ev.confirmed;
  if (c?.monitor) {
    return {
      status: "PASS",
      detail: c.how === "widget"
        ? `The page embeds a ${c.provider} status widget (${c.where}); ${c.provider} publishes uptime it measures itself.`
        : `The site links its status page at ${c.where}, hosted by ${c.provider}, an uptime monitor. Pulse opened it and it is a live status page.`,
      evidence: c.where,
    };
  }
  if (c) {
    return {
      status: "INCONCLUSIVE",
      confidence: "LOW",
      confidenceReason: "A status page can be updated by hand.",
      detail: `The site publishes a status page (${c.where}${c.provider ? `, ${c.provider}` : ""}). Whether an automated uptime monitor feeds it cannot be seen from outside.`,
      evidence: c.where,
    };
  }
  if (ev.unreadable) {
    return { status: "INCONCLUSIVE", detail: `The site links what looks like its status page (${ev.unreadable}), but Pulse could not open it, so whether uptime is monitored could not be established.` };
  }
  return {
    status: "WARN",
    detail: STATUS_MENTION.test(html)
      ? "The page mentions an uptime-monitoring service but neither links a status page nor loads a monitor's widget, so a mention is all there is. Monitoring is usually set up in the vendor's dashboard, which a scan cannot see."
      : "No uptime monitor is visible: the page links no status page and loads no monitoring widget. Monitoring is usually set up in the vendor's dashboard, which a scan cannot see.",
  };
}

// ── email_provider ───────────────────────────────────────────────────────────

/** SPF `include:` / `redirect=` targets of transactional senders, by provider. */
const SPF_SENDERS: ReadonlyArray<[RegExp, string]> = [
  [/(?:^|\.)sendgrid\.net$/i, "SendGrid"],
  [/(?:^|\.)mailgun\.org$/i, "Mailgun"],
  [/(?:^|\.)mtasv\.net$/i, "Postmark"],
  [/(?:^|\.)amazonses\.com$/i, "Amazon SES"],
  [/(?:^|\.)sparkpostmail\.com$/i, "SparkPost"],
  [/(?:^|\.)mandrillapp\.com$/i, "Mandrill"],
  [/(?:^|\.)mailjet\.com$/i, "Mailjet"],
  [/(?:^|\.)mlsend\.com$/i, "MailerSend"],
  [/(?:^|\.)(?:sendinblue|brevo)\.com$/i, "Brevo"],
  [/(?:^|\.)resend\.com$/i, "Resend"],
  [/(?:^|\.)smtp2go\.com$/i, "SMTP2GO"],
  [/(?:^|\.)elasticemail\.com$/i, "Elastic Email"],
  [/(?:^|\.)customeriomail\.com$/i, "Customer.io"],
];

/** Transactional providers an SPF record authorises. */
export function spfSenders(records: readonly string[]): string[] {
  const found: string[] = [];
  for (const rec of records) {
    const txt = rec.replace(/^"|"$/g, "").replace(/"\s*"/g, "");
    if (!/^v=spf1\b/i.test(txt)) continue;
    for (const m of txt.matchAll(/\b(?:include:|redirect=)([^\s]+)/gi)) {
      const target = m[1].toLowerCase().replace(/\.$/, "");
      const hit = SPF_SENDERS.find(([re]) => re.test(target));
      if (hit && !found.includes(hit[1])) found.push(hit[1]);
    }
  }
  return found;
}

export type TxtLookup = { ok: boolean; records: string[] };

/** One retry: public DoH answers the odd query with a timeout under a burst of lookups. */
export async function lookupTxt(name: string): Promise<TxtLookup> {
  const first = await lookupTxtOnce(name);
  return first.ok ? first : lookupTxtOnce(name);
}

async function lookupTxtOnce(name: string): Promise<TxtLookup> {
  try {
    // The same SSRF-guarded transport as the scan's other DNS-over-HTTPS lookups.
    const res = await fetchScannableUrl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, records: [] };
    const json = await res.json() as { Status?: number; Answer?: { type?: number; data: string }[] };
    if (json.Status !== undefined && json.Status !== 0 && json.Status !== 3) return { ok: false, records: [] };
    return { ok: true, records: (json.Answer ?? []).filter((a) => a.type === 16).map((a) => a.data) };
  } catch {
    return { ok: false, records: [] };
  }
}

/** The names a transactional sender's SPF usually sits on: the host, the domain, and the `send.` subdomain Resend uses. */
export function spfNamesFor(hostname: string): string[] {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const org = registrableDomain(host) ?? host.replace(/^www\./, "");
  return [...new Set([host, org, `send.${org}`])];
}

export function emailProviderVerdict(lookups: ReadonlyArray<{ name: string; lookup: TxtLookup }>): Verdict {
  for (const { name, lookup } of lookups) {
    const senders = spfSenders(lookup.records);
    if (senders.length > 0) {
      return {
        status: "PASS",
        detail: `The SPF record on ${name} authorises ${senders.join(", ")} to send mail for the domain.`,
        evidence: lookup.records.find((r) => /v=spf1/i.test(r))?.slice(0, 200),
      };
    }
  }
  const failed = lookups.every((l) => !l.lookup.ok);
  return {
    status: "INCONCLUSIVE",
    detail: failed
      ? "The domain's DNS could not be read, so which provider sends its email could not be established."
      : `No SPF record on ${lookups.map((l) => l.name).join(", ")} authorises a transactional email provider Pulse recognises. Mail may go out from another subdomain or through the mailbox provider, which a scan cannot tell apart.`,
  };
}

// ── Payments ─────────────────────────────────────────────────────────────────

const BNPL_SCRIPTS: ReadonlyArray<[RegExp, string]> = [
  [/\/\/(?:js\.klarna\.com|x\.klarnacdn\.net|[\w.-]*\.klarnaservices\.com)\//i, "Klarna"],
  [/\/\/(?:js|static|portal)\.(?:afterpay|clearpay)\.com|\/\/js\.squarecdn\.com\/square-marketplace\.js/i, "Afterpay / Clearpay"],
  [/\/\/cdn1\.affirm\.com\/js\//i, "Affirm"],
  [/\/\/[\w.-]*laybuy\.com\//i, "Laybuy"],
  [/\/\/static\.zip\.co\/|\/\/[\w.-]*quadpay\.com\//i, "Zip"],
  [/\/\/widget\.sezzle\.com\//i, "Sezzle"],
  [/\/\/(?:www\.)?paypal\.com\/sdk\/js[^"']*(?:enable-funding|components)=[^"']*(?:paylater|messages)/i, "PayPal Pay Later"],
];
const BNPL_ELEMENTS = /<(?:klarna-placement|afterpay-placement|square-placement|clearpay-placement|zip-message|sezzle-widget)\b|\sdata-pp-message\b|\sclass\s*=\s*["'][^"']*\baffirm-as-low-as\b/i;
const BNPL_PROSE = /\bbuy now,? pay later\b|\b(?:pay|split|spread)\b[^.!?]{0,30}\b(?:in|over)\s+(?:3|4|three|four|6|six)\b[^.!?]{0,40}\b(?:instal?lments?|payments)\b[^.!?]{0,30}\b(?:with\s+)?(?:Klarna|Clearpay|Afterpay|Affirm|Laybuy|Zip|Sezzle|PayPal)\b|\b(?:with|via|using)\s+(?:Klarna|Clearpay|Afterpay|Affirm|Laybuy|Sezzle)\b|\b(?:Klarna|Clearpay|Afterpay|Laybuy|Sezzle)\b[^.!?]{0,40}\b(?:instal?lments?|interest[- ]free|pay later|at checkout)\b/i;

export function bnplVerdict(html: string): Verdict {
  const srcs = scriptSrcs(html);
  const script = BNPL_SCRIPTS.find(([re]) => srcs.some((u) => re.test(u)));
  if (script) return { status: "PASS", detail: `The page loads ${script[1]}'s on-site messaging or checkout script.`, evidence: script[1] };
  if (BNPL_ELEMENTS.test(stripComments(html))) return { status: "PASS", detail: "The page carries a pay-later messaging element (Klarna, Afterpay/Clearpay, Zip or PayPal Pay Later).", evidence: "pay-later messaging element" };
  const quote = findClaim(proseRuns(html), BNPL_PROSE);
  if (quote) return { status: "PASS", detail: `The page offers paying later. It says: "${quote}"`, evidence: quote };
  return { status: "WARN", detail: "No buy-now-pay-later option is offered on this page: no Klarna, Afterpay/Clearpay, Affirm or similar script, element or wording. A brand name on its own is not counted." };
}

const CRYPTO_SCRIPTS = /\/\/commerce\.coinbase\.com\/|\/\/(?:www\.)?bitpay\.com\/bitpay\.(?:min\.)?js|\/\/nowpayments\.io\/[^"']*(?:widget|embed)|\/\/[\w.-]*btcpayserver[\w.-]*\//i;
const CRYPTO_LINK_HOSTS = ["commerce.coinbase.com", "bitpay.com", "nowpayments.io", "coingate.com"];
const CRYPTO_PROSE = /\b(?:we|now)\s+accept\b[^.!?]{0,40}\b(?:bitcoin|btc|ethereum|eth|usdc|crypto(?:currenc(?:y|ies))?)\b|\bpay\s+(?:with|in|using)\s+(?:bitcoin|btc|ethereum|usdc|crypto(?:currenc(?:y|ies))?)\b|\bcrypto(?:currency)?\s+payments?\s+(?:accepted|available)\b/i;

export function cryptoPaymentsVerdict(html: string): Verdict {
  if (scriptSrcs(html).some((u) => CRYPTO_SCRIPTS.test(u))) return { status: "PASS", detail: "The page loads a crypto checkout script (Coinbase Commerce, BitPay, NOWPayments or BTCPay).", evidence: "crypto checkout script" };
  const link = absoluteLinks(html).find(({ url }) => CRYPTO_LINK_HOSTS.some((d) => hostIs(url.hostname.toLowerCase(), d)) && url.pathname.length > 1);
  if (link) return { status: "PASS", detail: `The page links a crypto checkout (${shortUrl(link.url.href)}).`, evidence: shortUrl(link.url.href) };
  const quote = findClaim(proseRuns(html), CRYPTO_PROSE);
  if (quote) return { status: "PASS", detail: `The page says it accepts cryptocurrency: "${quote}"`, evidence: quote };
  return { status: "WARN", detail: "No cryptocurrency payment option is offered on this page. The word \"bitcoin\" or \"ethereum\" in an article is not counted." };
}

const WALLET_SCRIPTS: ReadonlyArray<[RegExp, string]> = [
  [/\/\/applepay\.cdn-apple\.com\/jsapi\//i, "Apple Pay"],
  [/\/\/pay\.google\.com\/gp\/p\/js\/pay\.js/i, "Google Pay"],
  [/\/\/static-[\w-]+\.payments-amazon\.com\/|\/\/[\w.-]*payments-amazon\.com\/checkout\.js/i, "Amazon Pay"],
];
const WALLET_CODE: ReadonlyArray<[RegExp, string]> = [
  [/\bApplePaySession\b|<apple-pay-button\b/, "Apple Pay"],
  [/\bgoogle\.payments\.api\b|<google-pay-button\b/, "Google Pay"],
  [/\bamazon\.Pay\.renderButton\s*\(/, "Amazon Pay"],
];
const WALLET_PROSE = /\b(?:Apple Pay|Google Pay|Amazon Pay)\b/;

export function walletVerdict(html: string): Verdict {
  const srcs = scriptSrcs(html);
  const found = new Set<string>();
  for (const [re, name] of WALLET_SCRIPTS) if (srcs.some((u) => re.test(u))) found.add(name);
  const code = inlineScriptCode(html) + stripComments(html).replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ");
  for (const [re, name] of WALLET_CODE) if (re.test(code)) found.add(name);
  if (found.size > 0) {
    const names = [...found].join(", ");
    return { status: "PASS", detail: `The page integrates ${names} (its SDK or button is on the page).`, evidence: names };
  }
  const runs = proseRuns(html);
  const alts = [...stripComments(html).matchAll(/<img\b[^>]*\salt\s*=\s*["']([^"']{2,80})["']/gi)].map((m) => m[1]);
  const quote = findClaim([...runs, ...alts], WALLET_PROSE);
  if (quote) return { status: "PASS", detail: `The page lists a wallet as a way to pay: "${quote}". Pulse did not reach the checkout.`, evidence: quote };
  return { status: "WARN", detail: "No Apple Pay, Google Pay or Amazon Pay button, SDK or listed payment logo on this page." };
}

// ── App stores ───────────────────────────────────────────────────────────────

export function amazonAppstoreVerdict(html: string): Verdict {
  const link = absoluteLinks(html).find(({ url, text }) => {
    const h = url.hostname.toLowerCase();
    if (!/(?:^|\.)amazon\.(?:com|co\.uk|de|fr|it|es|co\.jp|ca|in|com\.br|com\.mx|com\.au)$/.test(h) && h !== "amzn.to") return false;
    if (/\/gp\/mas\/dl\//i.test(url.pathname) || /\/mobile-apps\//i.test(url.pathname)) return true;
    return /\/(?:dp|gp\/product)\/B0[0-9A-Z]{8}\b/.test(url.pathname) && /\b(?:app ?store|appstore|amazon app|fire tv|fire tablet|kindle fire)\b/i.test(text);
  });
  if (link) return { status: "PASS", detail: `The page links an Amazon Appstore listing (${shortUrl(link.url.href)}).`, evidence: shortUrl(link.url.href) };
  const quote = findClaim(proseRuns(html), /\bAmazon Appstore\b|\bavailable (?:on|for) (?:Fire TV|Fire tablets?)\b/i);
  if (quote) {
    return {
      status: "INCONCLUSIVE",
      detail: `The page mentions the Amazon Appstore ("${quote}") but links no listing, so whether the app is there could not be established.`,
    };
  }
  return { status: "WARN", detail: "No Amazon Appstore link — consider Amazon Appstore for Fire tablet reach and LATAM/emerging market Android users." };
}

// ── Trust & brand ────────────────────────────────────────────────────────────

const COMPLIANCE_CLAIM = /\bSOC ?2(?: Type (?:I{1,2}|1|2))?\b|\bISO(?:\/IEC)? ?27001\b|\bHIPAA[- ]compliant\b|\bGDPR[- ]compliant\b|\bPCI[- ]DSS\b/i;

/** Readable text plus image alt text: a certification badge is often only an image. */
export function proseAndAlt(html: string): string[] {
  const alts = [...stripComments(html).matchAll(/<img\b[^>]*\salt\s*=\s*["']([^"']{2,160})["']/gi)].map((m) => m[1]);
  return [...proseRuns(html), ...alts];
}

export function complianceClaim(html: string): string | null {
  return findClaim(proseAndAlt(html), COMPLIANCE_CLAIM);
}

/** Social networks, by host, with the path shape of a PROFILE (not a share intent, an embed or an API script). */
const SOCIAL_PROFILES: ReadonlyArray<[string, RegExp, RegExp]> = [
  ["X / Twitter", /^(?:www\.|mobile\.)?(?:twitter|x)\.com$/, /^\/(?!intent\b|share\b|home\b|search\b|hashtag\b|i\/)[A-Za-z0-9_]{1,15}\/?$/],
  ["LinkedIn", /^(?:[a-z]{2,3}\.)?linkedin\.com$/, /^\/(?:company|in|school|showcase)\/[^/]+\/?/],
  ["GitHub", /^(?:www\.)?github\.com$/, /^\/(?!login\b|features\b|pricing\b|sponsors\/?$|marketplace\b|topics\b|explore\b|about\b|enterprise\b|security\b|site\b|join\b)[A-Za-z0-9-]{1,39}(?:\/[\w.-]+)?\/?$/],
  ["Instagram", /^(?:www\.)?instagram\.com$/, /^\/(?!p\/|reel\/|explore\/|accounts\/)[\w.]{1,30}\/?$/],
  ["YouTube", /^(?:www\.|m\.)?youtube\.com$/, /^\/(?:@[\w.-]+|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/?/],
  ["Facebook", /^(?:www\.|m\.)?facebook\.com$/, /^\/(?!sharer|share\b|dialog\/|plugins\/|tr\b)[\w.-]{2,}\/?$/],
  ["TikTok", /^(?:www\.)?tiktok\.com$/, /^\/@[\w.-]+\/?$/],
];

/** `sameAs` URLs in the page's JSON-LD: profiles the site declares as its own. */
export function jsonLdSameAs(html: string): URL[] {
  const out: URL[] = [];
  for (const m of stripComments(html).matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    for (const block of m[1].matchAll(/"sameAs"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)) {
      for (const u of block[1].matchAll(/"(https?:\/\/[^"\s]+)"/g)) {
        try { out.push(new URL(u[1])); } catch { /* not a URL */ }
      }
    }
  }
  return out;
}

/**
 * Social networks the page links a profile on, by real `<a href>`, or declares in its
 * JSON-LD `sameAs` (atlassian.com draws its footer with JavaScript but declares its
 * profiles there).
 */
export function linkedSocialProfiles(html: string): string[] {
  const found: string[] = [];
  for (const url of [...absoluteLinks(html).map((l) => l.url), ...jsonLdSameAs(html)]) {
    const h = url.hostname.toLowerCase();
    for (const [name, hostRe, pathRe] of SOCIAL_PROFILES) {
      if (hostRe.test(h) && pathRe.test(url.pathname) && !found.includes(name)) found.push(name);
    }
  }
  return found;
}

/** Third-party review profiles, by host and the path of a listed product or company. */
const REVIEW_PROFILES: ReadonlyArray<[string, RegExp, RegExp]> = [
  ["Trustpilot", /(?:^|\.)trustpilot\.com$/, /^\/review\/[^/]+/],
  ["G2", /^(?:www\.)?g2\.com$/, /^\/products\/[^/]+/],
  ["Capterra", /(?:^|\.)capterra\.(?:com|co\.uk|com\.au|ca|fr|de|es|it|nl|in)$/, /^\/(?:p|software)\/[^/]+/],
  ["GetApp", /(?:^|\.)getapp\.(?:com|co\.uk|com\.au|ca|fr|de|es|it|nl|in)$/, /^\/[^/]+\/a\/[^/]+|^\/software\/[^/]+/],
  ["Software Advice", /(?:^|\.)softwareadvice\.(?:com|co\.uk|com\.au|ca|fr|de|es|it|nl|in)$/, /\/[^/]+-profile\/?|\/reviews?\//],
  ["TrustRadius", /(?:^|\.)trustradius\.com$/, /^\/products\/[^/]+/],
  ["Product Hunt", /(?:^|\.)producthunt\.com$/, /^\/(?:posts|products)\/[^/]+/],
  ["Reviews.io", /(?:^|\.)reviews\.io$/, /^\/company-reviews\/store\/[^/]+/],
];
/** Review widgets, by the platform's own asset host. */
const REVIEW_WIDGETS: ReadonlyArray<[RegExp, string]> = [
  [/\/\/widget\.trustpilot\.com\/bootstrap\//i, "Trustpilot"],
  [/\/\/(?:www\.)?g2\.com\/products\/[^"']*\/(?:rating|badge)|\/\/(?:images|tracking)\.g2crowd\.com\//i, "G2"],
  [/\/\/(?:assets|badges)\.capterra\.com\//i, "Capterra"],
  [/\/\/api\.producthunt\.com\/widgets\/embed-image\//i, "Product Hunt"],
  [/\/\/widget\.reviews\.io\//i, "Reviews.io"],
  [/\/\/(?:www\.)?trustradius\.com\/api\/v\d\/badge|\/\/trustradius-static/i, "TrustRadius"],
];

/** Review platforms the page links a profile on or embeds a widget from. */
export function reviewPlatformEvidence(html: string): Array<{ platform: string; where: string }> {
  const out: Array<{ platform: string; where: string }> = [];
  for (const { url } of absoluteLinks(html)) {
    const h = url.hostname.toLowerCase();
    for (const [name, hostRe, pathRe] of REVIEW_PROFILES) {
      if (hostRe.test(h) && pathRe.test(url.pathname) && !out.some((o) => o.platform === name)) out.push({ platform: name, where: shortUrl(url.href) });
    }
  }
  const srcs = [...scriptSrcs(html), ...embedSrcs(html)];
  for (const [re, name] of REVIEW_WIDGETS) {
    const s = srcs.find((u) => re.test(u));
    if (s && !out.some((o) => o.platform === name)) out.push({ platform: name, where: shortUrl(s) });
  }
  return out;
}

export function productHuntVerdict(html: string): Verdict {
  const ev = reviewPlatformEvidence(html).find((e) => e.platform === "Product Hunt");
  if (ev) return { status: "PASS", detail: `The page links or embeds its Product Hunt listing (${ev.where}).`, evidence: ev.where };
  const quote = findClaim(proseAndAlt(html), /\b(?:#\s?1|product of the (?:day|week|month|year)|launched|featured|upvote)\b[^.!?]{0,60}\bProduct ?Hunt\b|\bProduct ?Hunt\b[^.!?]{0,60}\b(?:launch|product of the|#\s?1|upvote|golden kitty)\b/i);
  if (quote) return { status: "PASS", detail: `The page refers to its Product Hunt launch: "${quote}"`, evidence: quote };
  return { status: "WARN", detail: "No Product Hunt listing is linked or embedded. A mention of Product Hunt alone is not counted." };
}

// ── Prose claims used by trust-brand and saas modules ────────────────────────

// "backed by" alone is not investment: basecamp.com is "designed, built, and backed by 37signals".
export const INVESTOR_CLAIM = /\b(?:backed|funded) by\b[^.!?]{0,60}\b(?:investors?|VCs?|venture|capital|Ventures|Partners|Combinator|Techstars|Sequoia|a16z|Accel|angels?)\b|\b(?:Y Combinator|Techstars|Sequoia(?: Capital)?|Andreessen Horowitz|a16z|Index Ventures|Lightspeed Venture|General Catalyst|Founders Fund|Kleiner Perkins|Greylock|Balderton|Atomico|LocalGlobe|Seedcamp|Entrepreneur First)\b|\bYC [SWF]\d{2}\b|\b(?:seed|pre-seed|Series [A-F]) (?:round|funding|financing|investment)\b|\braised (?:a |an )?[£€$]\s?\d/;
export const AWARD_CLAIM = /\baward(?:s|ed)?\b|\b(?:winner|finalist) of\b|\bGartner\b[^.!?]{0,40}\b(?:Cool Vendor|Magic Quadrant|Peer Insights|named|recogni[sz]ed)\b|\b(?:named|ranked|listed|recogni[sz]ed|included)\b[^.!?]{0,40}\b(?:Forbes Cloud 100|Inc\.? 5000|Fast 50)\b|\bG2 (?:Leader|High Performer|Best Software)\b|\bDeloitte (?:UK )?Technology Fast 50\b/i;
export const CONFERENCE_CLAIM = /\b(?:speak(?:ing|er)|talk|keynote|present(?:ed|ing)?)\b[^.!?]{0,40}\b(?:at|during)\b[^.!?]{0,40}\b(?:conf(?:erence)?|summit|meetup|festival|expo|Web Summit|SXSW|re:Invent|KubeCon|Collision|DevCon|JSConf)\b|\bkeynote\b|\bconference talks?\b/i;
export const UPTIME_CLAIM = /\b99\.9\d*\s?%[^.!?]{0,30}\buptime\b|\buptime\b[^.!?]{0,30}\b99\.9\d*\s?%|\b(?:historical|public) uptime\b|\buptime history\b/i;
export const ROADMAP_CLAIM = /\b(?:public|product) roadmap\b|\bour roadmap\b|\bwhat'?s (?:next|coming)\b[^.!?]{0,20}\broadmap\b/i;
/** Hosted roadmap / feedback boards. */
const ROADMAP_HOSTS = ["canny.io", "productboard.com", "featurebase.app", "nolt.io", "upvoty.com", "trello.com", "roadmap.sh", "frill.co", "uservoice.com", "feedbear.com"];

export function roadmapEvidence(html: string): string | null {
  const link = absoluteLinks(html).find(({ url, text }) => {
    const h = url.hostname.toLowerCase();
    if (ROADMAP_HOSTS.some((d) => h !== d && hostIs(h, d))) return true; // customer.canny.io
    if ((h === "trello.com" && /^\/b\//.test(url.pathname)) || (h === "portal.productboard.com")) return /roadmap|feature|feedback|idea/i.test(text + url.pathname);
    return false;
  });
  if (link) return `links ${shortUrl(link.url.href)}`;
  const rel = pageAnchors(html).find((a) => /^\/[\w/-]*roadmap\b/i.test(a.href) || /^(?:public |product )?roadmap$/i.test(a.text.trim()));
  if (rel) return `links "${rel.text || rel.href}" (${shortUrl(rel.href)})`;
  const quote = findClaim(proseRuns(html), ROADMAP_CLAIM);
  return quote ? `says "${quote}"` : null;
}

/** A link to a GitHub account or repository (not GitHub's own pages, not a share link). */
export function githubOrgLink(html: string): string | null {
  for (const { url } of absoluteLinks(html)) {
    if (!/^(?:www\.)?github\.com$/i.test(url.hostname)) continue;
    if (/^\/(?!login\b|features\b|pricing\b|sponsors\/?$|marketplace\b|topics\b|explore\b|about\b|enterprise\b|security\b|site\b|join\b|signup\b|contact\b|orgs\/community\b)[A-Za-z0-9-]{1,39}(?:\/[\w.-]+)?\/?$/.test(url.pathname)) return shortUrl(url.href);
  }
  return null;
}

/** Shared shape for the prose-claim PASS. */
export function proseClaimVerdict(html: string, pattern: RegExp, what: string, warn: string): Verdict {
  const quote = findClaim(proseAndAlt(html), pattern);
  return quote
    ? { status: "PASS", detail: `${what} The page says: "${quote}"`, evidence: quote }
    : { status: "WARN", detail: warn };
}
